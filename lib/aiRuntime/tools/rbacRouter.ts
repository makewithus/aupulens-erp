import connectDB from "@/lib/db";
import User from "@/models/auth/User";
import { hasPermission } from "@/lib/crm/rbac";
import { CRM_PERMISSIONS, type CrmPermission } from "@/lib/crm/permissions";

/**
 * check_permission's real per-module router (docs/ai/BRIEF-02-BATCH-A.md A.2).
 *
 * There is no generic cross-module `checkPermission(action)` helper anywhere in this
 * codebase (confirmed in docs/ai/SYSTEM_INVENTORY.md) — `lib/crm/rbac.ts` is a real
 * fine-grained permission system, but every other module's actual, live authorization
 * boundary is the role-per-module table enforced in `middleware.ts` (there is no finer
 * permission layer underneath it to route to). This module mirrors that exact table —
 * it does not invent a new authorization system, it wraps the real one, the same way
 * `check_period_lock` wraps `assertTransactionNotLocked` instead of reimplementing it.
 *
 * `module === "crm"` routes to the real `lib/crm/rbac.ts::hasPermission`. Every other
 * known module checks the user's role against the same allow-list `middleware.ts` uses.
 * An unmapped module denies — see A.2: "a placeholder that returns true is worse than
 * no tool."
 */

const MODULE_ALLOWED_ROLES: Record<string, string[]> = {
  finance: ["finance", "admin", "master-admin"],
  sales: ["sales", "admin", "master-admin"],
  inventory: ["inventory", "finance", "admin", "master-admin"],
  manufacturing: ["manufacturing", "admin", "master-admin"],
  hr: ["hr", "admin", "master-admin"],
  admin: ["admin", "master-admin"],
  "master-admin": ["master-admin"],
};

export interface RbacRouterResult {
  allowed: boolean;
  reason: string;
}

export async function routePermissionCheck(
  tenantId: string,
  userId: string | undefined,
  module: string,
  action: string,
): Promise<RbacRouterResult> {
  if (!userId) {
    return { allowed: false, reason: "no acting user id provided" };
  }

  await connectDB();
  const user = await User.findOne({ _id: userId, tenantId }).lean();
  if (!user) {
    return { allowed: false, reason: `no user ${userId} found for tenant ${tenantId}` };
  }
  const role = String((user as { role?: string }).role ?? "");

  if (module === "crm") {
    if (!(CRM_PERMISSIONS as readonly string[]).includes(action)) {
      return { allowed: false, reason: `"${action}" is not a recognized CRM permission` };
    }
    const fakeSession = { user: { role, permissions: (user as { permissions?: string[] }).permissions ?? [] } };
    const allowed = hasPermission(fakeSession, action as CrmPermission);
    return { allowed, reason: allowed ? `role "${role}" has CRM permission "${action}"` : `role "${role}" lacks CRM permission "${action}"` };
  }

  const allowedRoles = MODULE_ALLOWED_ROLES[module];
  if (!allowedRoles) {
    // Deny by design — see docs/ai/OPEN_QUESTIONS.md for the process to add a module.
    return { allowed: false, reason: `module "${module}" has no mapped permission check — denied by default` };
  }

  const allowed = allowedRoles.includes(role);
  return {
    allowed,
    reason: allowed
      ? `role "${role}" is permitted for module "${module}"`
      : `role "${role}" is not permitted for module "${module}" (allowed: ${allowedRoles.join(", ")})`,
  };
}
