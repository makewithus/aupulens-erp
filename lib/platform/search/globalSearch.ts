import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import AdminUser from "@/models/platform/AdminUser";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import ApiKey from "@/models/platform/ApiKey";
import { ADMIN_CAPABILITY, PLATFORM_EVENT_TYPE } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { withCrossTenantRead } from "@/lib/platform/tenancy/crossTenant";

export interface GlobalSearchResult {
  type:
    | "organization"
    | "user"
    | "admin_user"
    | "audit_event"
    | "subscription_event"
    | "ai_usage_record"
    | "api_key";
  id: string;
  label: string;
  detail: string;
  link: string;
}

const RESULT_LIMIT_PER_TYPE = 5;

/**
 * Source doc §23: cross-tenant, therefore through the gateway, therefore
 * audited. Searches every type the source doc lists that has a real
 * corresponding record in this codebase (docs/admin/SYSTEM_INVENTORY_DELTA.md
 * §3 — there is no platform-level invoice/transaction-ID concept, so
 * "invoice ID"/"transaction ID" search maps to nothing real and is not
 * faked here; "audit event ID" maps to PlatformAuditLog's own _id and
 * entityId).
 */
export async function globalSearch(actor: AdminActor, reason: string, query: string): Promise<GlobalSearchResult[]> {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.GLOBAL_SEARCH,
    reason,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    entityType: "GlobalSearch",
    entityId: query,
    run: async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const re = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const [orgs, users, adminUsers, auditEvents, subscriptionEvents, aiUsageRecords, apiKeys] = await Promise.all([
        Organization.find({ $or: [{ name: re }, { subdomain: re }] }).limit(RESULT_LIMIT_PER_TYPE).lean(),
        User.find({ email: re }).limit(RESULT_LIMIT_PER_TYPE).lean(),
        AdminUser.find({ $or: [{ name: re }, { email: re }] }).limit(RESULT_LIMIT_PER_TYPE).lean(),
        PlatformAuditLog.find({ entityId: trimmed }).limit(RESULT_LIMIT_PER_TYPE).lean(),
        SubscriptionEvent.find({ tenantId: re }).limit(RESULT_LIMIT_PER_TYPE).lean(),
        AiUsageRecord.find({ requestId: trimmed }).limit(RESULT_LIMIT_PER_TYPE).lean(),
        ApiKey.find({ label: re }).limit(RESULT_LIMIT_PER_TYPE).lean(),
      ]);

      const results: GlobalSearchResult[] = [
        ...orgs.map((o) => ({
          type: "organization" as const,
          id: String(o._id),
          label: o.name,
          detail: o.subdomain,
          link: `/platform/organizations/${o.subdomain}`,
        })),
        ...users.map((u) => ({
          type: "user" as const,
          id: String(u._id),
          label: u.email,
          detail: `tenant: ${u.tenantId}`,
          link: `/platform/organizations/${u.tenantId}?tab=users`,
        })),
        ...adminUsers.map((a) => ({
          type: "admin_user" as const,
          id: String(a._id),
          label: a.name,
          detail: a.email,
          link: `/platform/admin-users`,
        })),
        ...auditEvents.map((e) => ({
          type: "audit_event" as const,
          id: String(e._id),
          label: e.eventType,
          detail: `${e.entityType ?? ""}:${e.entityId ?? ""}`,
          link: `/platform/audit-logs?tenantId=${e.tenantId ?? ""}`,
        })),
        ...subscriptionEvents.map((s) => ({
          type: "subscription_event" as const,
          id: String(s._id),
          label: `${s.type} — ${s.tenantId}`,
          detail: s.tier,
          link: `/platform/organizations/${s.tenantId}?tab=subscription`,
        })),
        ...aiUsageRecords.map((r) => ({
          type: "ai_usage_record" as const,
          id: String(r._id),
          label: r.requestId,
          detail: `${r.tenantId} · ${r.feature}`,
          link: `/platform/organizations/${r.tenantId}?tab=ai-usage`,
        })),
        ...apiKeys.map((k) => ({
          type: "api_key" as const,
          id: String(k._id),
          label: k.label,
          detail: `tenant: ${k.tenantId}`,
          link: `/platform/api-monitoring`,
        })),
      ];

      return results;
    },
  });
}
