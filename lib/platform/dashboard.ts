import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import SchedulerJobRun from "@/models/platform/SchedulerJobRun";
import PlatformAlert from "@/models/platform/PlatformAlert";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import Plan from "@/models/platform/Plan";
import StorageUsage from "@/models/platform/StorageUsage";
import { isAiUsageRollupStale } from "@/lib/platform/ai/rollupFreshness";
import { getAiPeriod } from "@/lib/ai/usage";
import { PLAN_RANK } from "@/lib/platform/alerts/conditions";
import { bridgeTierToPlanKey } from "@/lib/platform/entitlements/resolve";
import {
  ADMIN_CAPABILITY,
  ENTITY_STATUS,
  ORGANIZATION_STATUS,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  SUBSCRIPTION_EVENT_TYPE,
  SUBSCRIPTION_STATUS,
  type PlanKeyType,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { withCrossTenantRead } from "@/lib/platform/tenancy/crossTenant";

/**
 * Phase 11 Part 1.5, source doc §24: the 18 named dashboard KPIs. 14 are
 * computable from data this project already holds; 4 (MRR, ARR, Storage
 * Used, API Usage) are DECLARED_NOT_POSSIBLE (Addendum C Part 0.2, verified
 * again here — nothing has changed since). One `withCrossTenantRead` call
 * for the whole set (one audit row per dashboard load, not fourteen) and
 * every query run in parallel via `Promise.all` — Part 3's own explicit
 * warning ("fourteen separate queries unless parallelised or aggregated").
 */
export async function getDashboardKpis(actor: AdminActor, reason: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_DASHBOARD,
    reason,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    entityType: "PlatformDashboard",
    run: async () => {
      await connectDB();
      const period = getAiPeriod();
      const monthStart = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4, 6)) - 1, 1));

      // `status` is optional on Organization (added after many pre-existing
      // orgs already existed) and every other reader in this codebase
      // (list.ts, detail.ts) treats a MISSING status as ACTIVE, never as
      // "doesn't count" — found live against real data: a plain
      // `{status: ACTIVE}` count silently excluded every org whose status
      // was never set, undercounting Active Organisations while still
      // including those same orgs in Total Organisations. Reused for MRR
      // below too, for the identical reason — "active" must mean the same
      // thing in both places.
      const activeOrgFilter = { $or: [{ status: ORGANIZATION_STATUS.ACTIVE }, { status: { $exists: false } }] };

      const [
        totalOrganisations,
        activeOrganisations,
        trialOrganisations,
        suspendedOrganisations,
        totalUsers,
        activeUsers,
        activeSubscriptions,
        planChangeEvents,
        systemErrors,
        securityAlerts,
        rollupStale,
        activeOrgsForMrr,
        allEntitlements,
        allPlans,
        storageAgg,
      ] = await Promise.all([
        Organization.countDocuments({}),
        Organization.countDocuments(activeOrgFilter),
        Organization.countDocuments({ status: ORGANIZATION_STATUS.TRIAL }),
        Organization.countDocuments({ status: ORGANIZATION_STATUS.SUSPENDED }),
        User.countDocuments({}),
        User.countDocuments({ status: ENTITY_STATUS.ACTIVE }),
        Organization.countDocuments({ subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE }),
        // Two independent real code paths write a plan/tier change today
        // (source doc §24's "silently excludes a real code path" trap this
        // is deliberately checking for): the legacy master-admin tenant
        // editor pre-classifies as UPGRADED/DOWNGRADED by Organization.tier
        // rank; the newer assignPlan() writes PLAN_ASSIGNED with
        // {fromPlanKey, toPlanKey} in meta, unclassified — classified here
        // by the same PLAN_RANK table checkLargeDowngrade() already uses,
        // never a second, divergent ranking.
        SubscriptionEvent.find({
          occurredAt: { $gte: monthStart },
          type: { $in: [SUBSCRIPTION_EVENT_TYPE.UPGRADED, SUBSCRIPTION_EVENT_TYPE.DOWNGRADED, SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED] },
        })
          .select("type meta")
          .lean(),
        // SchedulerJobRun is one document PER JOB (current state, not a run
        // log) — this counts jobs CURRENTLY in a failed state, not "error
        // events today". Labelled precisely in the KPI's own description
        // rather than overclaiming a history this model doesn't keep.
        SchedulerJobRun.countDocuments({ lastRunStatus: "error" }),
        PlatformAlert.countDocuments({ severity: PLATFORM_SEVERITY.SECURITY, resolvedAt: { $exists: false } }),
        isAiUsageRollupStale(),
        // MRR/ARR (Phase 12 Part 0.2, re-triaged from DECLARED_NOT_POSSIBLE):
        // batched, not resolveEntitlements() per organisation — one query for
        // the active orgs' own tier (the tier-fallback case), one for every
        // OrganizationEntitlement row among them, one for the small, fixed
        // Plan catalogue, then joined in memory below.
        Organization.find(activeOrgFilter).select("subdomain tier").lean(),
        OrganizationEntitlement.find({}).select("tenantId planKey").lean(),
        Plan.find({}).select("key priceMonthly").lean(),
        StorageUsage.aggregate([{ $group: { _id: null, totalBytes: { $sum: "$totalBytes" } } }]),
      ]);

      let upgrades = 0;
      let downgrades = 0;
      for (const event of planChangeEvents) {
        if (event.type === SUBSCRIPTION_EVENT_TYPE.UPGRADED) {
          upgrades += 1;
        } else if (event.type === SUBSCRIPTION_EVENT_TYPE.DOWNGRADED) {
          downgrades += 1;
        } else if (event.type === SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED) {
          const meta = event.meta as { fromPlanKey?: PlanKeyType | null; toPlanKey?: PlanKeyType } | undefined;
          if (!meta?.fromPlanKey || !meta.toPlanKey) continue; // initial assignment — neither an upgrade nor a downgrade
          if (!(meta.fromPlanKey in PLAN_RANK) || !(meta.toPlanKey in PLAN_RANK)) continue; // CUSTOM or unrecognised — not rank-comparable
          if (PLAN_RANK[meta.toPlanKey] > PLAN_RANK[meta.fromPlanKey]) upgrades += 1;
          else if (PLAN_RANK[meta.toPlanKey] < PLAN_RANK[meta.fromPlanKey]) downgrades += 1;
        }
      }

      // AI Requests / AI Cost / AI Credits Used: this month, platform-wide.
      // "AI Credits Used" has no unit distinct from cost anywhere in this
      // codebase (the AI-limits editor itself labels its cost fields
      // "credits (₹)" — credits ARE currency-denominated here, not a
      // separate abstract unit) — shown as the same real figure, not a
      // fabricated second number, with that mapping stated explicitly.
      let aiRequestsThisMonth: number;
      let aiCostThisMonth: number;
      if (rollupStale) {
        const liveRows = await AiUsageRecord.aggregate([
          { $match: { createdAt: { $gte: monthStart } } },
          { $group: { _id: null, requests: { $sum: 1 }, cost: { $sum: "$estimatedCostUsd" } } },
        ]);
        aiRequestsThisMonth = liveRows[0]?.requests ?? 0;
        aiCostThisMonth = liveRows[0]?.cost ?? 0;
      } else {
        const rollupRows = await AiUsageMonthly.aggregate([
          { $match: { period } },
          { $group: { _id: null, requests: { $sum: "$requestCount" }, cost: { $sum: "$estimatedCostUsd" } } },
        ]);
        aiRequestsThisMonth = rollupRows[0]?.requests ?? 0;
        aiCostThisMonth = rollupRows[0]?.cost ?? 0;
      }

      // MRR: for every ACTIVE organisation, its assigned plan's real priceMonthly
      // — from OrganizationEntitlement when one exists, else the same tier-
      // fallback bridgeTierToPlanKey() resolveEntitlements() itself uses, so
      // this can never disagree with what the Subscription tab shows for the
      // same organisation. "Contracted", never "collected" — no payment is
      // ever taken anywhere in this codebase (Hard Rule: never label a number
      // as something it structurally cannot be).
      const planPriceByKey = new Map(allPlans.map((p) => [p.key, p.priceMonthly]));
      const entitlementByTenant = new Map(allEntitlements.map((e) => [e.tenantId, e.planKey]));
      let contractedMrr = 0;
      for (const org of activeOrgsForMrr) {
        const planKey = entitlementByTenant.get(org.subdomain) ?? bridgeTierToPlanKey(org.tier);
        contractedMrr += planPriceByKey.get(planKey) ?? 0;
      }
      const contractedArr = contractedMrr * 12;
      const storageUsedBytesTotal = storageAgg[0]?.totalBytes ?? 0;

      return {
        totalOrganisations,
        activeOrganisations,
        trialOrganisations,
        suspendedOrganisations,
        totalUsers,
        activeUsers,
        activeSubscriptions,
        upgrades,
        downgrades,
        aiRequestsThisMonth,
        aiCostThisMonth,
        aiCreditsUsedThisMonth: aiCostThisMonth,
        systemErrorsCurrentlyFailing: systemErrors,
        securityAlertsUnresolved: securityAlerts,
        aiDataSource: rollupStale ? ("live" as const) : ("rollup" as const),
        // Phase 12 Part 0.2 — re-triaged from DECLARED_NOT_POSSIBLE to real.
        // Both explicitly labelled "contracted", not "collected"/"revenue" —
        // no payment is ever taken anywhere in this codebase, and a reader
        // mistaking one for the other is exactly the Part 5.4 adversarial
        // case this project was asked to check for.
        contractedMrr,
        contractedArr,
        mrrLabel: "Contracted MRR — the sum of assigned plan prices for active organisations. No payments are collected; this is not realised revenue.",
        storageUsedBytesTotal,
        unavailable: [
          { field: "API Usage", reason: "No tenant-facing route issues or checks an API key in this codebase — there is no request stream to count." },
        ],
      };
    },
  });
}

// Purely informational, extremely high-volume event types — every organisation-detail page
// view emits one of these. A "recent actions" panel exists to show what an admin DID, not
// every read; excluding just these two keeps every genuine state-changing event visible.
const READ_ONLY_EVENT_TYPES = [PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED, PLATFORM_EVENT_TYPE.CROSS_TENANT_READ];

/**
 * Phase 11 Part 1.5 — the 3 of 6 §24 panels this project didn't already
 * have (the pre-existing "Alerts" panel already covers AI Usage Alerts /
 * Security Alerts once split by type/severity client-side; Scheduled Jobs
 * already covers System Errors). One more `withCrossTenantRead` call,
 * again parallelised.
 */
export async function getDashboardPanels(actor: AdminActor, reason: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_DASHBOARD,
    reason,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    entityType: "PlatformDashboard",
    run: async () => {
      await connectDB();
      const [recentOrganisations, recentSubscriptionChanges, recentAdminActions] = await Promise.all([
        Organization.find({}).sort({ createdAt: -1 }).limit(10).select("name subdomain status createdAt").lean(),
        SubscriptionEvent.find({}).sort({ occurredAt: -1 }).limit(10).select("tenantId type tier occurredAt").lean(),
        PlatformAuditLog.find({ actorType: "admin", eventType: { $nin: READ_ONLY_EVENT_TYPES } })
          .sort({ createdAt: -1 })
          .limit(10)
          .select("actorRole eventType tenantId entityType entityId createdAt")
          .lean(),
      ]);

      return {
        recentOrganisations: recentOrganisations.map((o) => ({
          id: String(o._id),
          name: o.name,
          subdomain: o.subdomain,
          status: o.status ?? ORGANIZATION_STATUS.ACTIVE,
          createdAt: o.createdAt.toISOString(),
        })),
        recentSubscriptionChanges: recentSubscriptionChanges.map((e) => ({
          id: String(e._id),
          tenantId: e.tenantId,
          type: e.type,
          tier: e.tier,
          occurredAt: e.occurredAt.toISOString(),
        })),
        recentAdminActions: recentAdminActions.map((a) => ({
          id: String(a._id),
          actorRole: a.actorRole,
          eventType: a.eventType,
          tenantId: a.tenantId,
          entityType: a.entityType,
          entityId: a.entityId,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    },
  });
}
