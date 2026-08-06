/**
 * CRM RBAC — Permission Hooks
 *
 * Defines all CRM permissions as string literals.
 *
 * Enforcement policy (see QA_GAP_REPORT.md item #9): there is no granular
 * per-role permission map yet — only admin/master-admin can be told apart
 * from every other authenticated role. Given that ceiling, enforcement is
 * scoped to WRITE-shaped permissions only (anything not containing "read"
 * or "view"): a non-admin write is rejected, a read is always allowed
 * through this layer and stays role-gated only at the route/middleware
 * level, to avoid over-blocking before a real permission map exists.
 * ENFORCE_RBAC=false is an explicit escape hatch to fully disable write
 * enforcement too (e.g. demo/staging); enforcement is ON by default.
 */
import { NextResponse } from "next/server";
import { CRM_PERMISSIONS, type CrmPermission } from "@/lib/crm/permissions";

export { CRM_PERMISSIONS, type CrmPermission };

// A permission string is treated as "read" if it contains "read" or "view"
// (covers both the `entity.read`/`entity.view` dot-notation and the older
// `view_x`/`create_x` prefix-notation used by a couple of routes).
function isReadPermission(permission: string): boolean {
  return /read|view/i.test(permission);
}

/**
 * Returns true if the session user has the given permission.
 * Admin and master-admin (this app's actual superuser role — "owner" is not
 * a real User.role value in this codebase) always return true.
 * Read permissions always return true (role-gated at the route level only).
 * ENFORCE_RBAC=false disables write enforcement too.
 *
 * Per-user override (Phase 3): User.permissions[] — previously declared on
 * the schema but never read anywhere — is checked next. It's an ALLOW-list
 * an org admin grants an individual user beyond their role's baseline (e.g.
 * letting one specific sales rep approve large discounts without promoting
 * them). It only ever grants extra access, never revokes what the role
 * already provides.
 */
export function hasPermission(session: any, permission: CrmPermission): boolean {
  if (!session?.user) return false;
  const role = (session.user.role || "").toLowerCase();
  if (["admin", "master-admin"].includes(role)) return true;
  if (isReadPermission(permission)) return true;

  const userPermissions: string[] = Array.isArray(session.user.permissions) ? session.user.permissions : [];
  if (userPermissions.includes(permission)) return true;

  if (process.env.ENFORCE_RBAC === "false") return true;

  // Future: map roles (not just individual users) to permission sets for
  // finer-grained write access.
  // const rolePermissions = ROLE_PERMISSION_MAP[role] || [];
  // return rolePermissions.includes(permission);
  return false;
}

/**
 * Route-level gate. Returns a 403 NextResponse when the session's role may
 * not perform ANY of the given (OR'd) permissions, or null to let the
 * request continue — same "return response or null" convention as
 * lib/middleware/moduleGate.ts. Write-shaped permissions are enforced;
 * read-shaped ones always return null (unchanged behavior).
 */
export function requireRole(session: any, allowedPermissions: string[]): NextResponse | null {
  if (!session?.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user.role || "").toLowerCase();
  if (["admin", "master-admin"].includes(role)) return null;

  const isWriteCheck = allowedPermissions.some((p) => !isReadPermission(p));
  if (!isWriteCheck) return null;

  // Per-user override — see hasPermission()'s doc comment.
  const userPermissions: string[] = Array.isArray(session.user.permissions) ? session.user.permissions : [];
  if (allowedPermissions.some((p) => userPermissions.includes(p))) return null;

  if (process.env.ENFORCE_RBAC === "false") return null;

  return NextResponse.json(
    { success: false, message: "Forbidden: insufficient permissions for this action" },
    { status: 403 },
  );
}

/**
 * Hard check — throws if permission not satisfied.
 * Use in server actions or API routes where enforcement is required.
 */
export function requirePermission(session: any, permission: CrmPermission): void {
  if (!hasPermission(session, permission)) {
    throw new Error(`Forbidden: missing permission '${permission}'`);
  }
}

/**
 * Checks multiple permissions (AND logic — all must be satisfied).
 */
export function requireAllPermissions(
  session: any,
  permissions: CrmPermission[]
): void {
  for (const p of permissions) {
    requirePermission(session, p);
  }
}
