import crypto from "crypto";

/**
 * Signed, time-limited public links (Phase 5) — lets an external recipient
 * (e.g. someone a WhatsApp-shared invoice is sent to, who has no ERP login)
 * open a specific invoice without a session, while still being safe:
 * authorization comes from an HMAC signature over the resource id + expiry,
 * keyed by ENCRYPTION_KEY. A link can't be forged without the key, and it
 * stops working after it expires.
 */

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set — cannot sign public links.");
  return key;
}

function sign(resource: string, id: string, exp: number): string {
  return crypto.createHmac("sha256", getKey()).update(`${resource}:${id}:${exp}`).digest("hex");
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signPublicToken(resource: string, id: string, ttlMs: number = DEFAULT_TTL_MS): { token: string; exp: number } {
  const exp = Date.now() + ttlMs;
  return { token: sign(resource, id, exp), exp };
}

export function verifyPublicToken(resource: string, id: string, token: string, exp: number): boolean {
  if (!token || !exp || Number.isNaN(exp)) return false;
  if (Date.now() > exp) return false;
  const expected = sign(resource, id, exp);
  // Constant-time comparison to avoid leaking the signature via timing.
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
