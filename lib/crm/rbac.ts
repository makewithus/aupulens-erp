/**
 * CRM RBAC — Permission Hooks
 *
 * Defines all CRM permissions as string literals.
 * Currently operates in "bypass" mode for development — all authenticated
 * tenant users can access everything. Production enforcement is gated behind
 * the enforcement flag or the stricter `requirePermission` call.
 */

export const CRM_PERMISSIONS = [
  // Activities
  "activity.read", "activity.create", "activity.update", "activity.delete",
  // Tasks
  "task.read", "task.create", "task.update", "task.delete", "task.assign",
  // Opportunities
  "opportunity.read", "opportunity.create", "opportunity.update", "opportunity.delete", "opportunity.close",
  // Leads
  "lead.read", "lead.create", "lead.update", "lead.delete",
  // Accounts
  "account.read", "account.create", "account.update", "account.delete",
  // Quotes
  "quote.read", "quote.create", "quote.update", "quote.delete",
  // Contracts
  "contract.read", "contract.create", "contract.update", "contract.delete",
  "contract.renew", "contract.approve", "contract.cancel",
  // Renewals
  "renewal.manage", "renewal.view",
  // Health & Risk
  "health.view", "health.refresh",
  "risk.view", "risk.manage",
  // Expansion
  "expansion.view", "expansion.create",
  // Forecast
  "forecast.view",
  // Campaigns
  "campaign.read", "campaign.create", "campaign.update", "campaign.delete",
  "campaign.archive", "campaign.export", "campaign.analytics",
  // Enterprise Globals
  "export", "import", "merge", "manage_workflows", "manage_pipelines", "view_sensitive_data",
  // Communications
  "communication.view", "communication.create", "communication.send", "communication.delete", "communication.export",
] as const;

export type CrmPermission = (typeof CRM_PERMISSIONS)[number];

/**
 * Returns true if the session user has the given permission.
 * Admin and Owner roles always return true.
 * In bypass mode (ENFORCE_RBAC env not set to 'true'), always returns true.
 */
export function hasPermission(session: any, permission: CrmPermission): boolean {
  if (!session?.user) return false;
  // Admin and Owner always have everything
  const role = (session.user.role || "").toLowerCase();
  if (["admin", "owner"].includes(role)) return true;

  // Bypass enforcement in dev mode
  if (process.env.ENFORCE_RBAC !== "true") return true;

  // Future: map roles to permission sets
  // const rolePermissions = ROLE_PERMISSION_MAP[role] || [];
  // return rolePermissions.includes(permission);
  return false;
}

/**
 * Soft check — does not throw.
 */
export function requireRole(session: any, _allowedPermissions: string[]): boolean {
  return true; // Development bypass
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
