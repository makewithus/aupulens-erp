import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import ActivityLog from "@/models/admin/ActivityLog";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import { getAiPeriod } from "@/lib/ai/usage";
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
import { LAST_MEANINGFUL_ACTIVITY_DEFINITION } from "./types";

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

export async function getOrganizationActivity(actor: AdminActor, reason: string, subdomain: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
    entityType: "Organization",
    entityId: subdomain,
    tenantId: subdomain,
    run: async () => {
      const logs = await ActivityLog.find({ tenantId: subdomain })
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();
      return {
        definitionNote: LAST_MEANINGFUL_ACTIVITY_DEFINITION,
        entries: logs.map((l) => ({
          activity: l.activity,
          details: l.details,
          userName: l.userName,
          userRole: l.userRole,
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
      const [rows, entitlements] = await Promise.all([
        AiUsageMonthly.find({ tenantId: subdomain, period }).lean(),
        resolveEntitlements(subdomain),
      ]);

      const used = rows.reduce((sum, r) => sum + r.requestCount, 0);
      const allocation = entitlements.limits.aiRequestsPerMonth;
      const byFeature = new Map(rows.map((r) => [r.feature, r]));

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
