import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import ActivityLog from "@/models/admin/ActivityLog";
import AiUsage from "@/models/admin/AiUsage";
import { getAiPeriod } from "@/lib/ai/usage";
import {
  ADMIN_CAPABILITY,
  ENTITY_STATUS,
  ORGANIZATION_STATUS,
  PLATFORM_EVENT_TYPE,
  type OrganizationStatus,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { withCrossTenantRead } from "@/lib/platform/tenancy/crossTenant";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import { OrganizationListRow, LAST_MEANINGFUL_ACTIVITY_DEFINITION } from "./types";

export type { OrganizationListRow };
export { LAST_MEANINGFUL_ACTIVITY_DEFINITION };

export interface OrganizationListQuery {
  page?: number;
  pageSize?: number;
  status?: OrganizationStatus;
  organizationType?: string;
  planKey?: string;
  search?: string;
  sortBy?: "createdAt" | "name" | "status";
  sortDir?: "asc" | "desc";
}

export interface OrganizationListResult {
  rows: OrganizationListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 100;

// "Last meaningful activity" (source doc §3): the most recent
// models/admin/ActivityLog entry for the tenant, falling back to the
// Organization's own `updatedAt`. Definition text lives in ./types.ts
// (shared with the client-side tooltip) so it can never drift out of sync.

export async function listOrganizations(
  actor: AdminActor,
  reason: string,
  query: OrganizationListQuery,
): Promise<OrganizationListResult> {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    entityType: "Organization",
    run: async () => {
      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 25));

      const filter: Record<string, unknown> = {};
      if (query.status) filter.status = query.status;
      if (query.organizationType) filter.organizationType = query.organizationType;
      // Note: planKey filters the raw legacy tier field on the Organization.
      // Filtering natively on resolveEntitlements() would require a memory scan.
      if (query.planKey) filter.tier = query.planKey;
      if (query.search) {
        filter.$or = [
          { name: { $regex: query.search, $options: "i" } },
          { subdomain: { $regex: query.search, $options: "i" } },
        ];
      }

      const sortField = query.sortBy ?? "createdAt";
      const sortDir = query.sortDir === "asc" ? 1 : -1;

      // Server-side pagination throughout — never load the full collection
      // into memory to filter/sort in application code (Hard Rule, §3).
      const [total, orgs] = await Promise.all([
        Organization.countDocuments(filter),
        Organization.find(filter)
          .sort({ [sortField]: sortDir })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
      ]);

      const subdomains = orgs.map((o) => o.subdomain);
      const period = getAiPeriod();

      const [userCounts, lastActivityByTenant, aiUsageByTenant, entitlementsByTenant] = await Promise.all([
        User.aggregate([
          { $match: { tenantId: { $in: subdomains }, status: ENTITY_STATUS.ACTIVE } },
          { $group: { _id: "$tenantId", count: { $sum: 1 } } },
        ]),
        ActivityLog.aggregate([
          { $match: { tenantId: { $in: subdomains } } },
          { $group: { _id: "$tenantId", lastActivity: { $max: "$timestamp" } } },
        ]),
        AiUsage.aggregate([
          { $match: { tenantId: { $in: subdomains }, period } },
          { $group: { _id: "$tenantId", count: { $sum: "$count" } } },
        ]),
        // Same fix as the Subscription tab (Phase 9 Part 2.1 finding, closed
        // here): the list must resolve through resolveEntitlements(), never
        // the raw legacy Organization.tier, or the two surfaces silently
        // disagree for any organisation with an assigned plan/override.
        // Parallelised across the page (bounded to MAX_PAGE_SIZE, not the
        // full collection) rather than a sequential loop; resolveEntitlements()
        // itself carries a 60s in-process cache so a re-rendered page is
        // effectively free. See docs/admin/verification/PERFORMANCE.md for
        // the measured cost at scale.
        Promise.all(subdomains.map((tenantId) => resolveEntitlements(tenantId))),
      ]);

      const userCountMap = new Map(userCounts.map((r) => [r._id, r.count as number]));
      const lastActivityMap = new Map(
        lastActivityByTenant.map((r) => [r._id, r.lastActivity as Date]),
      );
      const aiUsageMap = new Map(aiUsageByTenant.map((r) => [r._id, r.count as number]));
      const entitlementsMap = new Map(subdomains.map((tenantId, i) => [tenantId, entitlementsByTenant[i]]));

      const rows: OrganizationListRow[] = orgs.map((org) => {
        const lastActivity = lastActivityMap.get(org.subdomain);
        const aiUsage = aiUsageMap.get(org.subdomain) ?? 0;
        const cap = org.aiCallsPerMonth || null;
        return {
          id: String(org._id),
          name: org.name,
          subdomain: org.subdomain,
          organizationType: org.organizationType,
          country: org.settings?.country,
          region: org.region,
          timezone: org.settings?.timezone,
          planKey: entitlementsMap.get(org.subdomain)?.planKey ?? org.tier,
          status: (org.status as OrganizationStatus) ?? ORGANIZATION_STATUS.ACTIVE,
          activeUserCount: userCountMap.get(org.subdomain) ?? 0,
          currentPeriodAiUsage: aiUsage,
          aiUsagePercent: cap ? Math.round((aiUsage / cap) * 100) : null,
          createdAt: org.createdAt.toISOString(),
          lastMeaningfulActivityAt: (lastActivity ?? org.updatedAt)?.toISOString() ?? null,
        };
      });

      return { rows, total, page, pageSize };
    },
  });
}
