import { NextResponse } from "next/server";

/**
 * Minimal in-process rate limiter (QA_GAP_REPORT.md item #22) — no
 * Redis/external infra exists in this codebase, so this uses the same
 * "module-level Map, lives for the process lifetime" pattern as the
 * org-tier cache in middleware.ts. Not distributed-safe across multiple
 * server instances, but closes the "completely unthrottled" gap for a
 * single-process deployment (this app's current Electron/single-node
 * target). Fixed window per key, lazily pruned on access.
 */

interface RateLimitRule {
  /** Matches when pathname === this, or (if isSuffix) pathname.endsWith(this). */
  pattern: string;
  isSuffix?: boolean;
  limit: number;
  windowMs: number;
}

const RULES: RateLimitRule[] = [
  { pattern: "/api/auth/callback/credentials", limit: 10, windowMs: 60_000 },
  { pattern: "/api/crm/search", limit: 30, windowMs: 60_000 },
  { pattern: "/api/sales/products", limit: 60, windowMs: 60_000 },
  { pattern: "/api/crm/accounts", limit: 60, windowMs: 60_000 },
  { pattern: "/api/finance/assets/compute", limit: 20, windowMs: 60_000 },
  { pattern: "/ai-assistant", isSuffix: true, limit: 20, windowMs: 60_000 },
];

const hits = new Map<string, { count: number; resetAt: number }>();

function matchRule(pathname: string): RateLimitRule | null {
  for (const rule of RULES) {
    if (rule.isSuffix ? pathname.endsWith(rule.pattern) : pathname === rule.pattern) {
      return rule;
    }
  }
  return null;
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Returns a 429 NextResponse when the caller has exceeded the limit for this
 * path, or null to let the request continue.
 */
export function checkRateLimit(req: Request, pathname: string, userId?: string): NextResponse | null {
  const rule = matchRule(pathname);
  if (!rule) return null;

  const ip = getClientIp(req);
  const key = `${rule.pattern}:${ip}:${userId || "anon"}`;
  const now = Date.now();

  const existing = hits.get(key);
  if (!existing || existing.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + rule.windowMs });
    return null;
  }

  existing.count += 1;
  if (existing.count > rule.limit) {
    const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  return null;
}
