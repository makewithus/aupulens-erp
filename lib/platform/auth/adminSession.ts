import crypto from "crypto";
import connectDB from "@/lib/db";
import AdminUser from "@/models/platform/AdminUser";
import AdminSession from "@/models/platform/AdminSession";
import { ADMIN_USER_STATUS, AdminRoleType } from "@/lib/constants/statuses";
import { AdminActor } from "./types";
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  extractAdminSessionCookie,
  signAdminSessionJwt,
  verifyAdminSessionTokenEdge,
} from "./adminSessionEdge";

/**
 * Node-runtime-only admin session functions (DB access via Mongoose — NOT
 * safe to import from middleware.ts, which runs on the Edge runtime; see
 * ./adminSessionEdge.ts for the Edge-safe subset middleware actually uses).
 * A completely separate session domain from auth.ts/auth.config.ts (the
 * tenant NextAuth instance) — different cookie name, different signing
 * secret, different claim shape — by construction, a tenant session JWT
 * cannot verify against this secret and vice versa (docs/admin/
 * SYSTEM_INVENTORY_DELTA.md §7).
 */

export {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  buildAdminSessionCookie,
  buildAdminSessionClearCookie,
  signLoginChallenge,
  verifyLoginChallenge,
  verifyAdminSessionTokenEdge,
  type LoginChallengePurpose,
} from "./adminSessionEdge";

/** Node runtime only (DB access). Issues a new session: signs the JWT and
 *  persists the tracked AdminSession row that makes revocation possible. */
export async function createAdminSession(
  adminUser: { id: string; email: string; name: string; role: AdminRoleType },
  meta: { ip?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  await connectDB();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000);

  const session = await AdminSession.create({
    adminUserId: adminUser.id,
    jti,
    ip: meta.ip,
    userAgent: meta.userAgent,
    lastActivityAt: new Date(),
    expiresAt,
  });

  const token = await signAdminSessionJwt({
    adminUserId: adminUser.id,
    jti,
    email: adminUser.email,
    name: adminUser.name,
    role: adminUser.role,
    expiresAt,
  });

  return { token, expiresAt, sessionId: String(session._id) };
}

async function resolveActorFromToken(
  token: string | null,
  meta: { ip?: string; userAgent?: string },
): Promise<AdminActor | null> {
  if (!token) return null;
  const payload = await verifyAdminSessionTokenEdge(token);
  if (!payload) return null;

  await connectDB();
  const session = await AdminSession.findOne({ jti: payload.jti });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  const adminUser = await AdminUser.findById(payload.sub).lean();
  if (!adminUser || adminUser.status !== ADMIN_USER_STATUS.ACTIVE) {
    return null;
  }

  session.lastActivityAt = new Date();
  await session.save();

  return {
    id: String(adminUser._id),
    email: adminUser.email,
    name: adminUser.name,
    role: adminUser.role,
    sessionId: payload.jti,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}

/** Node runtime only. The authoritative check: verifies the JWT AND that the
 *  tracked session hasn't been revoked AND the admin account is still
 *  active — this is what a "hostile case" test (revoke a session, then
 *  replay its still-unexpired JWT) must fail against. Every app/api/platform
 *  route calls this directly, matching the repo-wide convention that every
 *  route self-checks auth rather than trusting middleware alone. */
export async function getAdminActorFromRequest(request: Request): Promise<AdminActor | null> {
  const token = extractAdminSessionCookie(request.headers.get("cookie"));
  const forwardedFor = request.headers.get("x-forwarded-for");
  const actor = await resolveActorFromToken(token, {
    ip: forwardedFor?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  // Phase 10 Part 0.3 item 3: fire-and-forget only, on the platform surface
  // only — every /api/platform/** route calls this function, and no
  // tenant-facing route does. Never awaited, so it can never add latency to
  // (or fail) this request. See lib/platform/scheduler/opportunistic.ts.
  if (actor) {
    import("@/lib/platform/scheduler/opportunistic")
      .then((m) => m.maybeTriggerOpportunisticRun())
      .catch(() => {});
  }
  return actor;
}

/** Server Component variant — same authoritative checks, reading the cookie
 *  value via next/headers instead of a Request object (used by
 *  app/platform/(app)/layout.tsx, which has no raw Request to read). */
export async function getAdminActorFromCookieValue(
  cookieValue: string | undefined,
  meta: { ip?: string; userAgent?: string },
): Promise<AdminActor | null> {
  return resolveActorFromToken(cookieValue ?? null, meta);
}

export async function revokeAdminSession(jti: string, reason: string): Promise<void> {
  await connectDB();
  await AdminSession.updateOne(
    { jti, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}
