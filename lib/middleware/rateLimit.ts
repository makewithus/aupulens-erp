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
  increment(key: string, windowMs: number, limit?: number): Promise<RateLimitResult> | RateLimitResult;
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
  { pattern: "/api/auth/callback/credentials", limit: 10, windowMs: 60_000, isSensitiveAuth: true },

  // General resource endpoints
  { pattern: "/api/crm/search", limit: 30, windowMs: 60_000 },
  { pattern: "/api/sales/products", limit: 60, windowMs: 60_000 },
  { pattern: "/api/tax/hsn-sac-lookup", limit: 20, windowMs: 60_000 },
  { pattern: "/api/crm/accounts", limit: 60, windowMs: 60_000 },
  { pattern: "/api/finance/assets/compute", limit: 20, windowMs: 60_000 },
  { pattern: "/api/public/waitlist", limit: 15, windowMs: 60_000 },
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

/**
 * Counter increment + expiry run as ONE Lua script (Redis executes scripts atomically), so a
 * failed or skipped expiry call can never leave an immortal counter. The script also repairs a
 * pre-existing key that has no TTL (PTTL < 0) instead of trusting it forever.
 * Executed through Upstash's documented REST command API: POST / with ["EVAL", script, numkeys, ...].
 */
export const UPSTASH_RATE_LIMIT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if c == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {c, ttl}
`.trim();

const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

export class UpstashRedisRateLimitStore implements RateLimitStore {
  constructor(private url: string, private token: string) {
    if (!/^https?:\/\//.test(url) || !token) throw new Error("Invalid Upstash Redis configuration");
  }

  async increment(key: string, windowMs: number, limit?: number): Promise<RateLimitResult> {
    if (!Number.isInteger(windowMs) || windowMs <= 0 || windowMs > MAX_WINDOW_MS) {
      throw new Error("Invalid rate limit window");
    }
    const response = await fetch(this.url.replace(/\/+$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", UPSTASH_RATE_LIMIT_SCRIPT, 1, `rl:${key}`, String(windowMs)]),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error("Upstash Redis rate limit backend unavailable");
    const data = await response.json();
    const [rawCount, rawTtl] = Array.isArray(data?.result) ? data.result : [];
    const count = Number(rawCount);
    const ttl = Number(rawTtl);
    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(ttl) || ttl <= 0) {
      throw new Error("Invalid Upstash Redis rate limit response");
    }
    return {
      allowed: limit === undefined ? true : count <= limit,
      count,
      remaining: limit === undefined ? 0 : Math.max(0, limit - count),
      resetAt: Date.now() + ttl,
    };
  }

  async reset(key?: string): Promise<void> {
    if (!key) return;
    await fetch(this.url.replace(/\/+$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["DEL", `rl:${key}`]),
      cache: "no-store",
    }).catch(() => {});
  }
}

function configuredStore(): RateLimitStore {
  if (activeStore) return activeStore;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRedisRateLimitStore(
      process.env.UPSTASH_REDIS_REST_URL,
      process.env.UPSTASH_REDIS_REST_TOKEN,
    );
  }
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
      const result = await store.increment(key, rule.windowMs, rule.limit);
      if (result.count > rule.limit) {
        return NextResponse.json({ error: "Too many requests. Please try again shortly.", code: "RATE_LIMITED" }, {
          status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
            "X-RateLimit-Limit": String(rule.limit), "X-RateLimit-Remaining": String(Math.max(0, rule.limit - result.count)), "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)) },
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
