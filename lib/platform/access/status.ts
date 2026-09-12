import connectDB from "@/lib/db";
import AdminAccessRequest from "@/models/platform/AdminAccessRequest";
import { ADMIN_ACCESS_REQUEST_STATUS, ADMIN_ROLE } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

export interface ActiveAccessGrant {
  requestId: string;
  tenantId: string;
  requestedScope: "read" | "write";
  reason: string;
  expiresAt: string;
}

/**
 * The one function a "you are in an active elevated session" banner reads.
 * Expiry is checked LIVE here (`expiresAt < now`) — correctness never
 * depends on the cron sweep (app/api/cron/platform/access-session-expiry)
 * having run; that cron only tidies the stored `status` field for reporting.
 */
export async function getActiveAccessGrant(
  adminUserId: string,
  tenantId: string,
): Promise<ActiveAccessGrant | null> {
  await connectDB();
  const request = await AdminAccessRequest.findOne({
    adminUserId,
    tenantId,
    status: ADMIN_ACCESS_REQUEST_STATUS.APPROVED,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!request || !request.expiresAt || request.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return {
    requestId: String(request._id),
    tenantId: request.tenantId,
    requestedScope: request.requestedScope,
    reason: request.reason,
    expiresAt: request.expiresAt.toISOString(),
  };
}

/** Roles with standing organisation-detail access per the literal §30 table
 * (docs/admin/BRIEF-PHASE-9-COVERAGE.md Part 0.1) plus GLOBAL_SUPER_ADMIN.
 * Every other role (SUPPORT_ADMIN, SECURITY_ADMIN — both §30-inferred, not
 * specified) must hold an active, approved access grant to open detail. */
const STANDING_DETAIL_ACCESS_ROLES: Set<string> = new Set([
  ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
  ADMIN_ROLE.GLOBAL_ADMIN,
  ADMIN_ROLE.AI_ADMIN,
  ADMIN_ROLE.BILLING_ADMIN,
  ADMIN_ROLE.READ_ONLY_ADMIN,
]);

export class AdminAccessGrantRequiredError extends Error {
  constructor(role: string, tenantId: string) {
    super(
      `Role ${role} requires an active, approved access grant to open organisation "${tenantId}"'s detail view (source doc §26, "supported access, not standing access"). Request access from the organisation's detail page.`,
    );
    this.name = "AdminAccessGrantRequiredError";
  }
}

/**
 * Part 0.2's gate: SUPPORT_ADMIN and SECURITY_ADMIN keep the organisation
 * LIST (VIEW_ORGANIZATIONS is unaffected) but require a live, unexpired,
 * APPROVED AdminAccessRequest to open that organisation's DETAIL tabs.
 * Every other standing-access role is a no-op check. Called once at the top
 * of the organisation-detail route, before any tab-specific data fetch, so
 * a denial never depends on which tab was requested.
 */
export async function assertOrganizationDetailAccess(
  actor: Pick<AdminActor, "id" | "role">,
  tenantId: string,
): Promise<void> {
  if (STANDING_DETAIL_ACCESS_ROLES.has(actor.role)) return;
  const grant = await getActiveAccessGrant(actor.id, tenantId);
  if (!grant) {
    throw new AdminAccessGrantRequiredError(actor.role, tenantId);
  }
}
