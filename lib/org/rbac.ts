/**
 * Org management RBAC — mirrors the lib/crm/rbac.ts pattern.
 *
 * Org management operations (invite, revoke, update settings) are
 * restricted to admin and master-admin roles. Unlike CRM permissions,
 * there is no bypass mode here — enforcement is always active.
 */

const ORG_ADMIN_ROLES = ["admin", "master-admin"] as const;

/**
 * Returns true if the session user may manage org membership.
 */
export function canManageOrg(session: any): boolean {
  if (!session?.user) return false;
  return ORG_ADMIN_ROLES.includes(
    (session.user.role ?? "").toLowerCase() as (typeof ORG_ADMIN_ROLES)[number]
  );
}

/**
 * Hard check — throws if the session user is not an org admin.
 * Catch in the route handler and return 403.
 */
export function requireOrgAdmin(session: any): void {
  if (!canManageOrg(session)) {
    throw new Error("Forbidden: admin role required to manage org membership");
  }
}
