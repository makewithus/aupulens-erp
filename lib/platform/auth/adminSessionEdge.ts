import { SignJWT, jwtVerify } from "jose";
import { AdminRoleType } from "@/lib/constants/statuses";

/**
 * Edge-safe primitives only — NO Mongoose/DB imports in this file. It is
 * imported directly by middleware.ts, which runs on the Edge runtime (the
 * same reason middleware.ts already resolves tenant tier data via an
 * internal HTTP call instead of a direct DB query — see its own comment).
 * lib/platform/auth/adminSession.ts (Node-only, DB-backed) re-exports
 * everything here so every other call site is unaffected.
 */

export const ADMIN_SESSION_COOKIE_NAME = "aupulens_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8h, matches tenant session policy

function getAdminSessionSecret(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Please define ADMIN_SESSION_SECRET (>= 32 chars) — must be different from AUTH_SECRET.",
    );
  }
  return new TextEncoder().encode(secret);
}

export interface AdminJwtPayload {
  sub: string; // AdminUser _id
  jti: string;
  email: string;
  name: string;
  role: AdminRoleType;
}

/** Pure cryptographic verification, no DB access. This is a fast-path guard
 *  only (used by middleware.ts) — never treated as the authoritative check.
 *  The authoritative check is lib/platform/auth/adminSession.ts's
 *  getAdminActorFromRequest / getAdminActorFromCookieValue, which additionally
 *  verify DB-tracked revocation and account status. */
export async function verifyAdminSessionTokenEdge(
  token: string,
): Promise<AdminJwtPayload | null> {
  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.jti || !payload.role) return null;
    return payload as unknown as AdminJwtPayload;
  } catch {
    return null;
  }
}

export function signAdminSessionJwt(params: {
  adminUserId: string;
  jti: string;
  email: string;
  name: string;
  role: AdminRoleType;
  expiresAt: Date;
}): Promise<string> {
  const secret = getAdminSessionSecret();
  return new SignJWT({
    sub: params.adminUserId,
    jti: params.jti,
    email: params.email,
    name: params.name,
    role: params.role,
  } satisfies AdminJwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(params.expiresAt.getTime() / 1000))
    .sign(secret);
}

export type LoginChallengePurpose = "mfa" | "mfa_setup";

interface LoginChallengePayload {
  sub: string;
  purpose: LoginChallengePurpose;
}

const LOGIN_CHALLENGE_TTL_SECONDS = 5 * 60;

/** Short-lived token bridging password verification and the MFA step. Not a
 *  session — carries no role/session claims, cannot be used against any
 *  /api/platform route, only against the two MFA endpoints. */
export async function signLoginChallenge(
  adminUserId: string,
  purpose: LoginChallengePurpose,
): Promise<string> {
  const secret = getAdminSessionSecret();
  return new SignJWT({ sub: adminUserId, purpose } satisfies LoginChallengePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + LOGIN_CHALLENGE_TTL_SECONDS)
    .sign(secret);
}

export async function verifyLoginChallenge(
  token: string,
  expectedPurpose: LoginChallengePurpose,
): Promise<{ adminUserId: string } | null> {
  try {
    const secret = getAdminSessionSecret();
    const { payload } = await jwtVerify(token, secret);
    const p = payload as unknown as LoginChallengePayload;
    if (!p.sub || p.purpose !== expectedPurpose) return null;
    return { adminUserId: p.sub };
  } catch {
    return null;
  }
}

export function buildAdminSessionCookie(token: string, expiresAt: Date): string {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    // Intentionally omitting Expires/Max-Age to create a true browser session
    // cookie that clears when the browser is closed, forcing re-authentication.
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

export function buildAdminSessionClearCookie(): string {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

/** Extracts the raw cookie value from a Request's Cookie header (middleware
 *  and Node route handlers both receive a standard Request/NextRequest). */
export function extractAdminSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(ADMIN_SESSION_COOKIE_NAME.length + 1));
}
