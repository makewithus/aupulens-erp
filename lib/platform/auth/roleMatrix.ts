import { ADMIN_CAPABILITY, ADMIN_ROLE, AdminCapability } from "@/lib/constants/statuses";

/**
 * The §30 permission matrix — the single source of truth, read as data
 * (Hard Rule 6), by both `scripts/seed-platform-roles.ts` (writes it to
 * `models/platform/AdminRole.ts`) and `tests/platform/permissionMatrix.test.ts`
 * (checks every role × every capability cell against it). Correcting a
 * cell is a one-file change here — see docs/admin/OPEN_QUESTIONS.md #6 for
 * why the exact cell contents are this project's own inferred default, not
 * a quoted source-doc table.
 */
export const ALL_CAPABILITIES: AdminCapability[] = Object.values(ADMIN_CAPABILITY);

export const READ_ONLY_CAPS: AdminCapability[] = [
  ADMIN_CAPABILITY.VIEW_DASHBOARD,
  ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
  ADMIN_CAPABILITY.VIEW_PLANS,
  ADMIN_CAPABILITY.VIEW_AI_USAGE,
  ADMIN_CAPABILITY.VIEW_AUDIT_LOGS,
  ADMIN_CAPABILITY.VIEW_SECURITY_LOGS,
  ADMIN_CAPABILITY.VIEW_BILLING,
  ADMIN_CAPABILITY.VIEW_ADMIN_USERS,
  ADMIN_CAPABILITY.VIEW_API_MONITORING,
  ADMIN_CAPABILITY.GLOBAL_SEARCH,
];

export const ROLE_MATRIX: Record<string, { capabilities: AdminCapability[]; description: string }> = {
  [ADMIN_ROLE.GLOBAL_SUPER_ADMIN]: {
    capabilities: ALL_CAPABILITIES,
    description:
      "Full platform control, including destructive actions (delete organisation, manage global admins, change security configuration). Every such action still requires the source-doc §25 privileged-action confirmation step and is individually logged.",
  },
  [ADMIN_ROLE.GLOBAL_ADMIN]: {
    capabilities: ALL_CAPABILITIES.filter(
      (c) =>
        c !== ADMIN_CAPABILITY.DELETE_ORGANIZATION &&
        c !== ADMIN_CAPABILITY.MANAGE_ADMIN_USERS &&
        c !== ADMIN_CAPABILITY.MANAGE_SECURITY_CONFIG,
    ),
    description:
      "Full operational control of organisations, plans, AI limits, billing and alerts, excluding the three GLOBAL_SUPER_ADMIN-only destructive/security-config/admin-user-management actions.",
  },
  [ADMIN_ROLE.BILLING_ADMIN]: {
    capabilities: [
      ...READ_ONLY_CAPS,
      ADMIN_CAPABILITY.MANAGE_PLANS,
      ADMIN_CAPABILITY.ASSIGN_PLAN,
      ADMIN_CAPABILITY.MANAGE_BILLING,
    ],
    description: "Plans, subscriptions and billing only, plus platform-wide read access.",
  },
  [ADMIN_ROLE.AI_ADMIN]: {
    capabilities: [...READ_ONLY_CAPS, ADMIN_CAPABILITY.MANAGE_AI_LIMITS],
    description: "AI usage, limits and cost configuration only, plus platform-wide read access.",
  },
  [ADMIN_ROLE.SUPPORT_ADMIN]: {
    capabilities: [
      ...READ_ONLY_CAPS,
      ADMIN_CAPABILITY.REQUEST_ORG_ACCESS,
      ADMIN_CAPABILITY.IMPERSONATE_READONLY,
    ],
    description:
      "Platform-wide read access plus the ability to request time-boxed, read-only organisation access (source doc §26). Never write access during an elevated session (Part 2.7).",
  },
  [ADMIN_ROLE.SECURITY_ADMIN]: {
    capabilities: [
      ...READ_ONLY_CAPS,
      ADMIN_CAPABILITY.MANAGE_SECURITY_CONFIG,
      ADMIN_CAPABILITY.MANAGE_RETENTION_POLICY,
      ADMIN_CAPABILITY.APPROVE_ORG_ACCESS,
      ADMIN_CAPABILITY.MANAGE_ALERTS,
    ],
    description:
      "Security configuration, retention policy, alerting and organisation-access approval, plus platform-wide read access. Not organisation/plan management.",
  },
  [ADMIN_ROLE.READ_ONLY_ADMIN]: {
    capabilities: READ_ONLY_CAPS,
    description: "Read-only everywhere. No mutating capability, no impersonation.",
  },
};
