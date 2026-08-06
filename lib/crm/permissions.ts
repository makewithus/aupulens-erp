/**
 * CRM permission string constants — split out from lib/crm/rbac.ts so this
 * list can be imported by client components (e.g. the admin permissions
 * editor) without pulling in rbac.ts's `next/server` import, which throws
 * when bundled for the browser.
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

/** Only the write-shaped permissions are meaningful to grant individually — read/view is always allowed regardless. */
export const GRANTABLE_CRM_PERMISSIONS = CRM_PERMISSIONS.filter((p) => !/read|view/i.test(p));
