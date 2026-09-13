import connectDB from "@/lib/db";
import AdminSession from "@/models/platform/AdminSession";
import AdminUser from "@/models/platform/AdminUser";
import {
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";
import { revokeAdminSession } from "@/lib/platform/auth/adminSession";

export class AdminSessionActionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AdminSessionActionError";
  }
}

/**
 * Source doc §25: "IP/device monitoring" — the data (`ip`, `userAgent`) was
 * already captured on every `AdminSession`, just never surfaced (Phase 11
 * Part 1.6). Lists every session, most recent first, and flags one whose IP
 * this admin has never used in any of their own PRIOR sessions — "prior"
 * meaning strictly earlier `createdAt`, so the very first session an admin
 * ever creates is never flagged (there is nothing to compare it against).
 */
export async function listAdminSessions(actor: AdminActor, reason: string) {
  await requireCapability(actor, ADMIN_CAPABILITY.VIEW_ADMIN_USERS);
  await connectDB();

  const sessions = await AdminSession.find({}).sort({ createdAt: -1 }).limit(200).lean();
  const adminIds = Array.from(new Set(sessions.map((s) => String(s.adminUserId))));
  const admins = await AdminUser.find({ _id: { $in: adminIds } }).select("name email role").lean();
  const adminById = new Map(admins.map((a) => [String(a._id), a]));

  // All sessions per admin, oldest first, so "has this IP appeared in an
  // earlier session" is a simple prefix scan rather than a second query per row.
  const allByAdmin = await AdminSession.find({ adminUserId: { $in: adminIds } })
    .sort({ createdAt: 1 })
    .select("adminUserId ip createdAt")
    .lean();
  const seenIpsBeforeIndex = new Map<string, Set<string>>(); // sessionId -> IPs seen strictly before it, for this admin
  const isFirstSessionForAdmin = new Set<string>(); // sessionId -> this admin's very first session ever
  const perAdminHistory = new Map<string, { ip?: string; createdAt: Date; id: string }[]>();
  for (const s of allByAdmin) {
    const key = String(s.adminUserId);
    if (!perAdminHistory.has(key)) perAdminHistory.set(key, []);
    perAdminHistory.get(key)!.push({ ip: s.ip, createdAt: s.createdAt, id: String(s._id) });
  }
  for (const [, history] of perAdminHistory) {
    const seen = new Set<string>();
    history.forEach((entry, i) => {
      seenIpsBeforeIndex.set(entry.id, new Set(seen));
      if (i === 0) isFirstSessionForAdmin.add(entry.id);
      if (entry.ip) seen.add(entry.ip);
    });
  }

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "AdminSession",
    metadata: { reason, count: sessions.length },
  });

  const now = Date.now();
  return sessions.map((s) => {
    const admin = adminById.get(String(s.adminUserId));
    const priorIps = seenIpsBeforeIndex.get(String(s._id)) ?? new Set<string>();
    const isNewIp = Boolean(s.ip) && !priorIps.has(s.ip!) && !isFirstSessionForAdmin.has(String(s._id));
    return {
      id: String(s._id),
      adminUserId: String(s.adminUserId),
      adminName: admin?.name ?? "(deleted admin)",
      adminEmail: admin?.email,
      adminRole: admin?.role,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastActivityAt: s.lastActivityAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      revokedAt: s.revokedAt?.toISOString(),
      revokedReason: s.revokedReason,
      isActive: !s.revokedAt && s.expiresAt.getTime() > now,
      isNewIp,
    };
  });
}

/**
 * Revoking a session through this admin-facing view is itself a privileged,
 * audited action — distinct from `revokeAdminSession()`'s own internal
 * callers (self-logout, the expiry sweep), which don't act on another
 * admin's behalf and don't need this gate.
 */
export async function revokeAdminSessionAsAdmin(actor: AdminActor, sessionId: string, reason: string): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_ADMIN_USERS);
  if (!reason || !reason.trim()) {
    throw new AdminSessionActionError("A reason is required to revoke a session.", 400);
  }
  await connectDB();
  const session = await AdminSession.findById(sessionId);
  if (!session) {
    throw new AdminSessionActionError("Session not found.", 404);
  }
  await revokeAdminSession(session.jti, reason);

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.SESSION_REVOKED,
    severity: PLATFORM_SEVERITY.WARNING,
    entityType: "AdminSession",
    entityId: sessionId,
    metadata: { reason, revokedAdminUserId: String(session.adminUserId) },
  });
}
