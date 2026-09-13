import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import AdminUser from "@/models/platform/AdminUser";
import {
  ADMIN_CAPABILITY,
  ADMIN_ROLE_VALUES,
  ADMIN_USER_STATUS,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  type AdminRoleType,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export class AdminUserActionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AdminUserActionError";
  }
}

const MIN_PASSWORD_LENGTH = 12; // matches scripts/seed-platform-admin.ts's own bootstrap rule

function requireReason(reason: string): void {
  if (!reason || !reason.trim()) {
    throw new AdminUserActionError("A reason is required for every admin-user change.", 400);
  }
}

/**
 * Phase 11 Part 1.6 (user decision, this session): "today the only path to
 * creating an admin is scripts/seed-platform-admin.ts... production has one
 * bootstrap super-admin and no way to add a colleague, revoke a leaver, or
 * reset MFA without server access." This module is that path. Every mutating
 * function here is gated on MANAGE_ADMIN_USERS, which per the §30 matrix
 * (lib/platform/auth/roleMatrix.ts) only GLOBAL_SUPER_ADMIN holds — "GLOBAL_
 * SUPER_ADMIN only" falls out of the existing capability model, not a new
 * role check. Suspend, never delete — an AdminUser row is a `PlatformAuditLog`
 * actor and must remain resolvable by id indefinitely (Hard Rule 3).
 */
export async function listAdminUsers(actor: AdminActor, reason: string) {
  await requireCapability(actor, ADMIN_CAPABILITY.VIEW_ADMIN_USERS);
  await connectDB();
  const admins = await AdminUser.find({}).sort({ createdAt: -1 }).lean();
  return admins.map((a) => ({
    id: String(a._id),
    name: a.name,
    email: a.email,
    role: a.role,
    status: a.status,
    mfaEnabled: a.mfaEnabled,
    failedLoginCount: a.failedLoginCount,
    lastLoginAt: a.lastLoginAt?.toISOString(),
    lastLoginIp: a.lastLoginIp,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function createAdminUser(
  actor: AdminActor,
  input: { name: string; email: string; password: string; role: AdminRoleType },
  reason: string,
): Promise<{ id: string }> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_ADMIN_USERS);
  requireReason(reason);

  const email = input.email?.trim().toLowerCase();
  if (!input.name?.trim() || !email) {
    throw new AdminUserActionError("Name and email are required.", 400);
  }
  if (!ADMIN_ROLE_VALUES.includes(input.role)) {
    throw new AdminUserActionError(`"${input.role}" is not a recognised admin role.`, 400);
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AdminUserActionError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
  }

  await connectDB();
  const existing = await AdminUser.findOne({ email });
  if (existing) {
    throw new AdminUserActionError("An admin with this email already exists.", 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  // mfaEnabled stays false — forced through the same mandatory first-login
  // MFA enrollment flow as scripts/seed-platform-admin.ts's own bootstrap
  // account, never a second, weaker onboarding path.
  const admin = await AdminUser.create({
    name: input.name.trim(),
    email,
    passwordHash,
    role: input.role,
    status: ADMIN_USER_STATUS.ACTIVE,
    mfaEnabled: false,
  });

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.USER,
    eventType: PLATFORM_EVENT_TYPE.ADMIN_USER_CREATED,
    severity: PLATFORM_SEVERITY.WARNING,
    entityType: "AdminUser",
    entityId: String(admin._id),
    newValue: { email, role: input.role },
    metadata: { reason },
  });

  return { id: String(admin._id) };
}

/**
 * A safety guard with no equivalent anywhere else in this codebase yet: this
 * is the first feature that can remove the ability to administer the
 * platform at all, so it is the first place that needs to check for it.
 * Refuses to leave zero ACTIVE GLOBAL_SUPER_ADMIN accounts — the one role
 * that can undo any other admin-user change, including this one.
 */
async function assertNotLastActiveSuperAdmin(adminUserId: string, roleAfterChange: AdminRoleType | null): Promise<void> {
  const { ADMIN_ROLE } = await import("@/lib/constants/statuses");
  const target = await AdminUser.findById(adminUserId).lean();
  if (!target || target.role !== ADMIN_ROLE.GLOBAL_SUPER_ADMIN) return; // not touching a super admin — nothing to guard
  if (roleAfterChange === ADMIN_ROLE.GLOBAL_SUPER_ADMIN) return; // still one after the change — fine

  const otherActiveSuperAdmins = await AdminUser.countDocuments({
    _id: { $ne: adminUserId },
    role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    status: ADMIN_USER_STATUS.ACTIVE,
  });
  if (otherActiveSuperAdmins === 0) {
    throw new AdminUserActionError(
      "This would leave zero active GLOBAL_SUPER_ADMIN accounts — promote or reactivate another one first.",
      409,
    );
  }
}

export async function updateAdminUserRole(actor: AdminActor, adminUserId: string, newRole: AdminRoleType, reason: string): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_ADMIN_USERS);
  requireReason(reason);
  if (!ADMIN_ROLE_VALUES.includes(newRole)) {
    throw new AdminUserActionError(`"${newRole}" is not a recognised admin role.`, 400);
  }

  await connectDB();
  const admin = await AdminUser.findById(adminUserId);
  if (!admin) throw new AdminUserActionError("Admin not found.", 404);

  await assertNotLastActiveSuperAdmin(adminUserId, newRole);

  const oldRole = admin.role;
  if (oldRole === newRole) return; // no-op, nothing to audit

  admin.role = newRole;
  await admin.save();

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.USER,
    eventType: PLATFORM_EVENT_TYPE.ADMIN_USER_ROLE_CHANGED,
    severity: PLATFORM_SEVERITY.WARNING,
    entityType: "AdminUser",
    entityId: adminUserId,
    oldValue: { role: oldRole },
    newValue: { role: newRole },
    metadata: { reason },
  });
}

async function setAdminUserStatus(
  actor: AdminActor,
  adminUserId: string,
  status: "active" | "suspended",
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_ADMIN_USERS);
  requireReason(reason);
  if (actor.id === adminUserId && status === "suspended") {
    throw new AdminUserActionError("You cannot suspend your own account.", 400);
  }

  await connectDB();
  const admin = await AdminUser.findById(adminUserId);
  if (!admin) throw new AdminUserActionError("Admin not found.", 404);

  if (status === "suspended") {
    await assertNotLastActiveSuperAdmin(adminUserId, null);
  }

  const oldStatus = admin.status;
  admin.status = status === "active" ? ADMIN_USER_STATUS.ACTIVE : ADMIN_USER_STATUS.SUSPENDED;
  await admin.save();

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.USER,
    eventType: status === "active" ? PLATFORM_EVENT_TYPE.ADMIN_USER_REACTIVATED : PLATFORM_EVENT_TYPE.ADMIN_USER_SUSPENDED,
    severity: status === "suspended" ? PLATFORM_SEVERITY.WARNING : PLATFORM_SEVERITY.INFO,
    entityType: "AdminUser",
    entityId: adminUserId,
    oldValue: { status: oldStatus },
    newValue: { status: admin.status },
    metadata: { reason },
  });
}

export async function suspendAdminUser(actor: AdminActor, adminUserId: string, reason: string): Promise<void> {
  await setAdminUserStatus(actor, adminUserId, "suspended", reason);
}

export async function reactivateAdminUser(actor: AdminActor, adminUserId: string, reason: string): Promise<void> {
  await setAdminUserStatus(actor, adminUserId, "active", reason);
}

/**
 * Clears MFA enrollment, forcing the admin through first-login enrollment
 * again next time they sign in — the sanctioned recovery path for a lost
 * authenticator device (previously: none, short of direct database access).
 */
export async function resetAdminUserMfa(actor: AdminActor, adminUserId: string, reason: string): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_ADMIN_USERS);
  requireReason(reason);

  await connectDB();
  const admin = await AdminUser.findById(adminUserId);
  if (!admin) throw new AdminUserActionError("Admin not found.", 404);

  admin.mfaEnabled = false;
  admin.mfaSecretEncrypted = undefined;
  admin.mfaBackupCodeHashes = [];
  await admin.save();

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.AUTH,
    eventType: PLATFORM_EVENT_TYPE.MFA_RESET,
    severity: PLATFORM_SEVERITY.WARNING,
    entityType: "AdminUser",
    entityId: adminUserId,
    metadata: { reason },
  });
}
