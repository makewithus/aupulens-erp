import { ADMIN_CAPABILITY, ADMIN_ROLE, AdminCapability } from "@/lib/constants/statuses";

/**
 * The §30 permission matrix — the single source of truth, read as data
 * (Hard Rule 6), by both `scripts/seed-platform-roles.ts` (writes it to
 * `models/platform/AdminRole.ts`) and `tests/platform/permissionMatrix.test.ts`
 * (checks every role × every capability cell against it). Correcting a
 * cell is a one-file change here.
 *
 * GLOBAL_SUPER_ADMIN, GLOBAL_ADMIN, AI_ADMIN, BILLING_ADMIN and
 * READ_ONLY_ADMIN are the five roles the source doc's §30 table names
 * explicitly (docs/admin/BRIEF-PHASE-9-COVERAGE.md Part 0.1) — every cell
 * for these five is the literal table, not an inference. The corrected
 * cell vs. this project's original inferred default: GLOBAL_ADMIN does
 * NOT have MANAGE_AI_LIMITS ("Configure AI Limits" = No in the literal
 * table), even though it holds every other non-destructive capability.
 *
 * SUPPORT_ADMIN and SECURITY_ADMIN do not appear in the §30 table at all
 * (only in §25's role list) — their capability sets below remain this
 * project's own INFERRED DEFAULT, not source-doc text. Do not treat them
 * as equally authoritative when reconciling against the source document.
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
        c !== ADMIN_CAPABILITY.MANAGE_SECURITY_CONFIG &&
        c !== ADMIN_CAPABILITY.MANAGE_AI_LIMITS,
    ),
    description:
      "Full operational control of organisations, plans, billing and alerts, excluding the three GLOBAL_SUPER_ADMIN-only destructive/security-config/admin-user-management actions and AI limit configuration (source-doc §30: 'Configure AI Limits' = No for this role — AI_ADMIN owns that).",
  },
  [ADMIN_ROLE.BILLING_ADMIN]: {
    capabilities: [
      ...READ_ONLY_CAPS,
      ADMIN_CAPABILITY.MANAGE_PLANS,
      ADMIN_CAPABILITY.ASSIGN_PLAN,
      ADMIN_CAPABILITY.MANAGE_BILLING,
    ],
    description:
      "Plans, subscriptions and billing only, plus platform-wide read access. Matches the literal §30 table: 'Change Plan' = Yes for this role (ASSIGN_PLAN), 'Configure AI Limits' = No (no MANAGE_AI_LIMITS).",
  },
  [ADMIN_ROLE.AI_ADMIN]: {
    capabilities: [...READ_ONLY_CAPS, ADMIN_CAPABILITY.MANAGE_AI_LIMITS],
    description:
      "AI usage, limits and cost configuration only, plus platform-wide read access. Matches the literal §30 table: 'Configure AI Limits' = Yes, 'Change Plan' = No.",
  },
  // INFERRED, NOT SPECIFIED — SUPPORT_ADMIN does not appear in the §30 table
  // (only in §25's role list). Also gated by Part 0.2: this role keeps the
  // organisation LIST but requires an active access grant
  // (lib/platform/access/status.ts::getActiveAccessGrant()) to open an
  // organisation's DETAIL tabs — enforced in the detail-fetch function
  // itself, not by withholding a capability, since VIEW_ORGANIZATIONS
  // must remain true for the list to render at all.
  [ADMIN_ROLE.SUPPORT_ADMIN]: {
    capabilities: [
      ...READ_ONLY_CAPS,
      ADMIN_CAPABILITY.REQUEST_ORG_ACCESS,
      ADMIN_CAPABILITY.IMPERSONATE_READONLY,
    ],
    description:
      "INFERRED, NOT SPECIFIED (source doc §30 does not name this role). Platform-wide read access, organisation LIST only — opening an organisation's DETAIL tabs requires an active, approved access grant (source doc §26, Part 0.2). Can request time-boxed, read-only organisation access. Never write access during an elevated session (Part 2.7).",
  },
  // INFERRED, NOT SPECIFIED — SECURITY_ADMIN does not appear in the §30
  // table either. Also gated by Part 0.2, same as SUPPORT_ADMIN.
  [ADMIN_ROLE.SECURITY_ADMIN]: {
    capabilities: [
      ...READ_ONLY_CAPS,
      ADMIN_CAPABILITY.MANAGE_SECURITY_CONFIG,
      ADMIN_CAPABILITY.MANAGE_RETENTION_POLICY,
      ADMIN_CAPABILITY.APPROVE_ORG_ACCESS,
      ADMIN_CAPABILITY.MANAGE_ALERTS,
    ],
    description:
      "INFERRED, NOT SPECIFIED (source doc §30 does not name this role). Security configuration, retention policy, alerting and organisation-access approval, plus platform-wide read access; organisation LIST only, same detail-access gate as SUPPORT_ADMIN (Part 0.2). Not organisation/plan management.",
  },
  [ADMIN_ROLE.READ_ONLY_ADMIN]: {
    capabilities: READ_ONLY_CAPS,
    description: "Read-only everywhere. No mutating capability, no impersonation.",
  },
};
