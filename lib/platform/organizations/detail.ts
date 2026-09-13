import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import ActivityLog from "@/models/admin/ActivityLog";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import Plan from "@/models/platform/Plan";
import OrganizationType from "@/models/platform/OrganizationType";
import StorageUsage from "@/models/platform/StorageUsage";
import { getAiPeriod } from "@/lib/ai/usage";
import { isAiUsageRollupStale } from "@/lib/platform/ai/rollupFreshness";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import {
  ADMIN_CAPABILITY,
  AI_USAGE_FEATURE_BUCKET_VALUES,
  ENTITY_STATUS,
  ORGANIZATION_STATUS,
  PLATFORM_EVENT_TYPE,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { withCrossTenantRead } from "@/lib/platform/tenancy/crossTenant";
import { LAST_MEANINGFUL_ACTIVITY_DEFINITION, ACTIVITY_MODULE_FILTER_NOTE, ALL_TENANT_MODULES } from "./types";

/**
 * One function per source-doc §7 tab that has real data today. Every tab
 * reads through the gateway (each call is individually audited — a support
 * engineer opening five tabs on one organisation produces five audit rows,
 * which is the correct, literal reading of "Global Admin access should
 * itself be logged," source doc §6). AI Usage and Billing intentionally
 * return an explicit empty state rather than a placeholder (Phase 4/6 build
 * the real thing) — see Hard Rule 3.
 */
export async function getOrganizationOverview(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const org = await Organization.findOne({ subdomain }).lean();
      if (!org) return null;
      return {
        id: String(org._id),
        name: org.name,
        subdomain: org.subdomain,
        domain: org.domain,
        organizationType: org.organizationType,
        status: org.status ?? ORGANIZATION_STATUS.ACTIVE,
        isActive: org.isActive,
        planAssignmentPending: org.planAssignmentPending ?? false,
        tier: org.tier,
        subscriptionStatus: org.subscriptionStatus,
        maxUsers: org.maxUsers,
        aiCallsPerMonth: org.aiCallsPerMonth,
        settings: org.settings,
        createdAt: org.createdAt.toISOString(),
      };
    },
  });
}

export async function getOrganizationUsers(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const users = await User.find({ tenantId: subdomain })
        .select("name email role status createdAt")
        .lean();
      return users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        active: u.status === ENTITY_STATUS.ACTIVE,
        createdAt: u.createdAt.toISOString(),
      }));
    },
  });
}

export async function getOrganizationSubscriptionHistory(
  actor: AdminActor,
  reason: string,
  subdomain: string,
) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const events = await SubscriptionEvent.find({ tenantId: subdomain })
        .sort({ occurredAt: -1 })
        .limit(50)
        .lean();
      return events.map((e) => ({
        type: e.type,
        tier: e.tier,
        amount: e.amount,
        currency: e.currency,
        occurredAt: e.occurredAt.toISOString(),
        meta: e.meta,
      }));
    },
  });
}

/**
 * Source doc §18 names 7 filters: User, Action, Module, Date, IP, Device,
 * Severity. Checked directly against `models/admin/ActivityLog.ts` rather
 * than assumed from its own "free text, single writer" framing (which
 * undersold it): `activity`/`details` are indeed free text with no
 * structured Action, and there is no Module or Severity field at all — but
 * `userId`, `ipAddress`, and `userAgent` are real, populated fields
 * (`lib/logger.ts::logActivity()` writes them on every call, falling back to
 * the literal string "unknown" only when no request context exists). Date
 * needs no field at all — `timestamp` is indexed. So 4 of 7 are real:
 * **User, Date, IP, Device** — "Device" here is a plain substring match on
 * the raw `userAgent` string, not device-type classification (this
 * codebase has no user-agent-parsing library) — documented as such rather
 * than implied to be more than it is. Action, Module, and Severity remain
 * genuinely unavailable and must be shown disabled with a reason, never
 * silently absent.
 */
export interface OrganizationActivityFilter {
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  ip?: string;
  device?: string;
}

export const ACTIVITY_UNAVAILABLE_FILTERS = [
  { field: "Action", reason: "ActivityLog.activity is a free-text description, not a structured action enum — there is nothing reliable to filter on." },
  { field: "Module", reason: "ActivityLog has no module field at all (source doc §20's own finding) — inferring one from the free-text activity string would be guessing from prose." },
  { field: "Severity", reason: "ActivityLog has no severity field — severity exists only on the separate PlatformAuditLog (Audit Logs tab)." },
] as const;

export async function getOrganizationActivity(
  actor: AdminActor,
  reason: string,
  subdomain: string,
  filter: OrganizationActivityFilter = {},
) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const query: Record<string, unknown> = { tenantId: subdomain };
      if (filter.userId) query.userId = filter.userId;
      if (filter.ip) query.ipAddress = filter.ip;
      if (filter.device) query.userAgent = { $regex: filter.device, $options: "i" };
      if (filter.dateFrom || filter.dateTo) {
        const range: Record<string, Date> = {};
        if (filter.dateFrom) range.$gte = new Date(filter.dateFrom);
        if (filter.dateTo) range.$lte = new Date(filter.dateTo);
        query.timestamp = range;
      }

      const logs = await ActivityLog.find(query).sort({ timestamp: -1 }).limit(50).lean();
      return {
        definitionNote: LAST_MEANINGFUL_ACTIVITY_DEFINITION,
        moduleFilterNote: ACTIVITY_MODULE_FILTER_NOTE,
        unavailableFilters: ACTIVITY_UNAVAILABLE_FILTERS,
        entries: logs.map((l) => ({
          activity: l.activity,
          details: l.details,
          userId: String(l.userId),
          userName: l.userName,
          userRole: l.userRole,
          ipAddress: l.ipAddress,
          timestamp: l.timestamp.toISOString(),
        })),
      };
    },
  });
}

export async function getOrganizationAuditLogs(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_AUDIT_LOGS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const logs = await PlatformAuditLog.find({ tenantId: subdomain })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      return logs.map((l) => ({
        eventCategory: l.eventCategory,
        eventType: l.eventType,
        severity: l.severity,
        actorId: l.actorId,
        actorRole: l.actorRole,
        oldValue: l.oldValue,
        newValue: l.newValue,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
      }));
    },
  });
}

/**
 * AI Usage tab (source doc §14) — real data from the AiUsageMonthly rollup
 * plus the resolved plan's AI credit allocation. A tenant with no usage
 * rows yet gets real zeros for every feature bucket, not an omitted row.
 */
export async function getOrganizationAiUsage(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_AI_USAGE,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const period = getAiPeriod();
      const [rollupStale, entitlements] = await Promise.all([
        isAiUsageRollupStale(),
        resolveEntitlements(subdomain),
      ]);

      // Phase 10 Part 0.4: the daily rollup job no longer runs on a Vercel
      // Cron schedule (docs/admin/CRON_INCIDENT.md) — if it's gone stale,
      // reading AiUsageMonthly would silently show an old number as if
      // current. Compute the same shape live from AiUsageRecord instead,
      // and say which source was used so the distinction is never hidden.
      let byFeature: Map<string, { requestCount: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number; errorCount: number }>;
      if (rollupStale) {
        const monthStart = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4, 6)) - 1, 1));
        const liveRows = await AiUsageRecord.aggregate([
          { $match: { tenantId: subdomain, createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: "$feature",
              requestCount: { $sum: 1 },
              inputTokens: { $sum: "$inputTokens" },
              outputTokens: { $sum: "$outputTokens" },
              estimatedCostUsd: { $sum: "$estimatedCostUsd" },
              errorCount: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
            },
          },
        ]);
        byFeature = new Map(liveRows.map((r) => [r._id as string, r]));
      } else {
        const rows = await AiUsageMonthly.find({ tenantId: subdomain, period }).lean();
        byFeature = new Map(rows.map((r) => [r.feature, r]));
      }

      const used = Array.from(byFeature.values()).reduce((sum, r) => sum + r.requestCount, 0);
      const allocation = entitlements.limits.aiRequestsPerMonth;

      // Every bucket is listed explicitly, even at zero (docs/admin/AI_FEATURE_MAP.md's
      // own design: "Document Processing: 0" honestly, never an omitted row).
      const featureBreakdown = AI_USAGE_FEATURE_BUCKET_VALUES.map((feature) => {
        const row = byFeature.get(feature);
        return {
          feature,
          requestCount: row?.requestCount ?? 0,
          inputTokens: row?.inputTokens ?? 0,
          outputTokens: row?.outputTokens ?? 0,
          estimatedCostUsd: row?.estimatedCostUsd ?? 0,
          errorCount: row?.errorCount ?? 0,
        };
      });

      return {
        available: true as const,
        planKey: entitlements.planKey,
        allocation,
        used,
        remaining: Math.max(0, allocation - used),
        usagePercent: allocation > 0 ? Math.round((used / allocation) * 100) : 0,
        featureBreakdown,
        dataSource: rollupStale ? ("live" as const) : ("rollup" as const),
      };
    },
  });
}
export function getOrganizationBillingEmptyState() {
  return {
    available: false,
    reason:
      "Platform billing is not yet integrated — see docs/admin/OPEN_QUESTIONS.md #4.",
  } as const;
}

/**
 * Phase 11 Part 1.2, Modules tab. "Toggling a module is an override edit, so
 * route it through the existing setOverride() rather than a new path" — this
 * function is read-only; the write path is the pre-existing
 * `PATCH /api/platform/organizations/[id]/entitlement-override` (Group A
 * item 3), unchanged. Shows the plan's own module set and, separately,
 * whether an override has replaced it — never conflates the two, so an
 * operator can always tell "the plan grants this" from "an override changed
 * this."
 */
export async function getOrganizationModules(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const [entitlements, entitlementRow] = await Promise.all([
        resolveEntitlements(subdomain),
        OrganizationEntitlement.findOne({ tenantId: subdomain }).lean(),
      ]);
      const plan = await Plan.findOne({ key: entitlements.planKey }).lean();

      return {
        allModules: ALL_TENANT_MODULES,
        planKey: entitlements.planKey,
        planModules: plan?.features.modules ?? [],
        overrideModules: entitlementRow?.overrides?.modules ?? null,
        effectiveModules: entitlements.modules,
        hasBasePlan: Boolean(entitlementRow),
      };
    },
  });
}

/**
 * Phase 11 Part 1.2, Configuration tab. Read side of country/currency/
 * timezone/tax jurisdiction plus the organisation type's own defaults
 * (for context — "these are the defaults this org type was created with,"
 * never re-applied automatically). Write side is
 * `updateOrganizationConfiguration()` in ./configuration.ts.
 */
export async function getOrganizationConfiguration(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const org = await Organization.findOne({ subdomain }).lean();
      if (!org) return null;

      const typeDoc = org.organizationType
        ? await OrganizationType.findOne({ type: org.organizationType }).lean()
        : null;

      return {
        country: org.settings?.country ?? null,
        currency: org.settings?.currency ?? null,
        timezone: org.settings?.timezone ?? null,
        taxJurisdiction: org.settings?.taxJurisdiction ?? null,
        organizationType: org.organizationType ?? null,
        organizationTypeDefaults: typeDoc?.defaultConfig ?? null,
      };
    },
  });
}

/**
 * Phase 11 Part 1.2, Security tab. "To whatever depth the tenant data
 * genuinely supports" — checked directly, not assumed: `models/auth/User.ts`
 * has no MFA field, no last-login timestamp, and no failed-login counter for
 * TENANT users (the failed-login counter and MFA enrollment that exist in
 * this codebase are `AdminUser`'s own, a completely separate identity domain
 * — Hard Rule 13). Tenant auth is JWT-strategy with no server-side session
 * store, so "active sessions" has no backing data either. What IS real: the
 * tenant's own user list and each one's account status — already fetched by
 * getOrganizationUsers(), reused here rather than a second query, presented
 * alongside four explicit, individually-named absent-data notes rather than
 * a single vague "not available."
 */
export async function getOrganizationSecurity(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const users = await User.find({ tenantId: subdomain }).select("name email role status").lean();
      return {
        users: users.map((u) => ({
          id: String(u._id),
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.status === ENTITY_STATUS.ACTIVE,
        })),
        unavailable: [
          { field: "MFA status", reason: "Tenant users have no MFA field in this codebase — MFA (TOTP) exists only for the separate Global Admin identity domain." },
          { field: "Recent logins", reason: "No login-event log exists for tenant users — only a free-text Activity Log with no structured event type to filter on reliably." },
          { field: "Failed-login counts", reason: "No failed-login counter is tracked for tenant users — the one that exists (AdminUser.failedLoginCount) is Global-Admin-only." },
          { field: "Active sessions", reason: "Tenant authentication is JWT-strategy with no server-side session store, so there is nothing to enumerate — unlike AdminSession, which backs the platform's own Admin Sessions view." },
        ],
      };
    },
  });
}

/**
 * Phase 11 Part 1.2, Usage tab. Distinct from the AI Usage tab. Checked
 * directly per resource, not assumed: `lib/upload.ts` knows a file's byte
 * size for an instant at upload time but never persists or aggregates it
 * (the same finding already recorded for the platform-wide Storage Used KPI,
 * §24 — true per-organisation for the identical reason); no tenant-facing
 * route issues or checks an API key, so API request counts don't exist
 * either; `documentLimitPerMonth` is a configured ceiling on the Plan with
 * no corresponding counter anywhere that increments it. The one real number
 * here is user count against the plan's own limit — already computable from
 * data this project holds everywhere else.
 */
export async function getOrganizationUsageLimits(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const [entitlements, activeUserCount, storageUsage] = await Promise.all([
        resolveEntitlements(subdomain),
        User.countDocuments({ tenantId: subdomain, status: ENTITY_STATUS.ACTIVE }),
        StorageUsage.findOne({ tenantId: subdomain }).lean(),
      ]);
      const maxUsers = entitlements.limits.maxUsers;
      const storageLimitBytes = entitlements.limits.storageGb * 1024 * 1024 * 1024;
      const storageUsedBytes = storageUsage?.totalBytes ?? 0;

      return {
        users: {
          used: activeUserCount,
          limit: maxUsers,
          percent: maxUsers > 0 ? Math.round((activeUserCount / maxUsers) * 100) : null,
        },
        // Phase 12 Part 0.2 — Storage Used, re-triaged to buildable.
        // `storageUsage` is null the instant this org has never uploaded
        // anything since instrumentation began (Sept 2026) — shown as a
        // real zero, not an unavailable field, since the mechanism is now
        // genuinely real for every org from this point forward.
        storage: {
          usedBytes: storageUsedBytes,
          limitBytes: storageLimitBytes,
          percent: storageLimitBytes > 0 ? Math.round((storageUsedBytes / storageLimitBytes) * 100) : null,
          countingSince: "2026-09 (the point storage instrumentation began — no backfill of earlier uploads)",
        },
        unavailable: [
          { field: "API requests", reason: "No tenant-facing route issues or checks an API key in this codebase — there is no request stream to count." },
          { field: "Document counts", reason: "Plan.documentLimitPerMonth is a configured ceiling with no corresponding counter anywhere that increments it." },
        ],
      };
    },
  });
}
