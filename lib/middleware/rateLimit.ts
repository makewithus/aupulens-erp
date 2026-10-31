import { NextResponse } from "next/server";

/** Shared Mongo counters are reached through a secret-protected Node route because middleware runs on Edge.
 * Development/test memory mode is explicit local behavior; production sensitive routes require Mongo mode.
 */
export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitResult> | RateLimitResult;
  reset?(key?: string): Promise<void> | void;
}

export interface RateLimitRule {
  pattern: string;
  isSuffix?: boolean;
  limit: number;
  windowMs: number;
  isSensitiveAuth?: boolean;
}

export const RATE_LIMIT_RULES: RateLimitRule[] = [
  // Sensitive Authentication & credential endpoints (fail-closed on store outage)
  { pattern: "/api/auth/register", limit: 5, windowMs: 60_000, isSensitiveAuth: true },
  { pattern: "/api/auth/password-reset/request", limit: 5, windowMs: 60_000, isSensitiveAuth: true },
  { pattern: "/api/auth/password-reset/confirm", limit: 5, windowMs: 60_000, isSensitiveAuth: true },
  // Sign-in is a multi-request flow (provider discovery, CSRF initialization,
  // then credentials callback) and shared office/NAT IPs are common. Keep a
  // useful per-minute ceiling without locking legitimate users out after a
  // handful of retries. Requests are counted independently by IP and account.
  { pattern: "/api/auth/callback/credentials", limit: 30, windowMs: 60_000, isSensitiveAuth: true },

  // General resource endpoints
  { pattern: "/api/crm/search", limit: 30, windowMs: 60_000 },
  { pattern: "/api/sales/products", limit: 60, windowMs: 60_000 },
  { pattern: "/api/tax/hsn-sac-lookup", limit: 20, windowMs: 60_000 },
  { pattern: "/api/crm/accounts", limit: 60, windowMs: 60_000 },
  { pattern: "/api/finance/assets/compute", limit: 20, windowMs: 60_000 },
  { pattern: "/ai-assistant", isSuffix: true, limit: 20, windowMs: 60_000 },
];

/**
 * In-memory fallback rate limit store with sliding expiry window.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetAt: number }>();

  increment(key: string, windowMs: number): RateLimitResult {
    const now = Date.now();
    this.prune();
    if (this.hits.size >= 10000 && !this.hits.has(key)) throw new Error("Local limiter capacity exceeded");
    const existing = this.hits.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { allowed: true, count: 1, remaining: Math.max(0, 1), resetAt };
    }

    existing.count += 1;
    return {
      allowed: true, // evaluated by caller against rule limit
      count: existing.count,
      remaining: Math.max(0, 0),
      resetAt: existing.resetAt,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
    }
  }

  prune(): void {
    const now = Date.now();
    for (const [key, value] of this.hits.entries()) {
      if (value.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}

// Global active store instance (defaults to in-memory store)
let activeStore: RateLimitStore | undefined;
const localStore = new MemoryRateLimitStore();

export class HttpRateLimitStore implements RateLimitStore {
  constructor(private endpoint: string, private secret: string) {}
  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const response = await fetch(this.endpoint, {
      method: "POST", headers: { "content-type": "application/json", "x-middleware-secret": this.secret },
      body: JSON.stringify({ key, windowMs }), cache: "no-store", signal: AbortSignal.timeout(3000), redirect: "error",
    });
    if (!response.ok) throw new Error("Rate limit backend unavailable");
    const result = await response.json();
    if (!Number.isInteger(result.count) || result.count < 1 || !Number.isFinite(result.resetAt) || result.resetAt <= Date.now()) throw new Error("Invalid rate limit backend response");
    return result;
  }
}

function configuredStore(): RateLimitStore {
  if (activeStore) return activeStore;
  if (process.env.RATE_LIMIT_STORE === "mongo") {
    const endpoint = process.env.RATE_LIMIT_INTERNAL_URL;
    const secret = process.env.MIDDLEWARE_INTERNAL_SECRET;
    if (!endpoint || !secret) throw new Error("Shared limiter configuration missing");
    const url = new URL(endpoint);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/api/internal/rate-limit" ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && process.env.NODE_ENV !== "production"))) {
      throw new Error("Invalid shared limiter endpoint");
    }
    return new HttpRateLimitStore(url.toString(), secret);
  }
  if (process.env.NODE_ENV === "production") throw new Error("Production requires a shared rate limit store");
  return localStore;
}

export function setRateLimitStore(store: RateLimitStore): void {
  activeStore = store;
}

export function getRateLimitStore(): RateLimitStore {
  return configuredStore();
}

export function resetRateLimitStore(key?: string): void {
  localStore.reset(key);
  if (activeStore?.reset) {
    activeStore.reset(key);
  }
}

export function matchRule(pathname: string): RateLimitRule | null {
  for (const rule of RATE_LIMIT_RULES) {
    if (rule.isSuffix ? pathname.endsWith(rule.pattern) : pathname === rule.pattern) {
      return rule;
    }
  }
  return null;
}

/**
 * Sanitizes and extracts client IP address, guarding against header injection and spoofing.
 */
export function getClientIp(req: Request): string {
  const trustedHeader = process.env.RATE_LIMIT_TRUSTED_IP_HEADER;
  const headers = trustedHeader ? [trustedHeader] : (process.env.NODE_ENV === "production" ? [] : ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]);
  for (const header of headers) {
    const value = req.headers.get(header)?.split(",")[0].trim();
    if (value && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split(".").every(part => Number(part) <= 255)) return value;
    if (value && value.includes(":") && /^[a-fA-F0-9:]{2,45}$/.test(value)) return value;
  }

  return "unknown-ip";
}

/**
 * Checks whether the incoming request is within rate limits.
 * Handles both synchronous stores and async distributed stores.
 */
export async function checkRateLimit(req: Request, pathname: string, userId?: string, storeOverride?: RateLimitStore): Promise<NextResponse | null> {
  const rule = matchRule(pathname);
  if (!rule || pathname === "/api/internal/rate-limit") return null;
  try {
    const store = storeOverride ?? getRateLimitStore();
    const digest = async (value: string) => {
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
    };
    // Separate IP and account limits: rotating either alone cannot evade both.
    const identities = [`ip:${getClientIp(req)}`];
    if (userId) identities.push(`user:${userId}`);
    if (rule.isSensitiveAuth && req.method === "POST") {
      const type = req.headers.get("content-type") || "";
      let email: unknown;
      if (type.includes("application/json")) email = (await req.clone().json().catch(() => ({}))).email;
      else if (type.includes("application/x-www-form-urlencoded")) email = (await req.clone().formData()).get("email");
      if (typeof email === "string" && email.length <= 320 && email.trim()) identities.push(`account:${email.trim().toLowerCase()}`);
    }
    for (const identity of identities) {
      const key = await digest(`${rule.pattern}:${identity}`);
      const result = await store.increment(key, rule.windowMs);
      if (result.count > rule.limit) {
        return NextResponse.json({ error: "Too many requests. Please try again shortly.", code: "RATE_LIMITED" }, {
          status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
            "X-RateLimit-Limit": String(rule.limit), "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)) },
        });
      }
    }
    return null;
  } catch {
    return rule.isSensitiveAuth
      ? NextResponse.json({ error: "Authentication service temporarily throttled. Please try again shortly.", code: "RATE_LIMIT_SERVICE_UNAVAILABLE" }, { status: 429, headers: { "Retry-After": "3" } })
      : null;
  }
}
