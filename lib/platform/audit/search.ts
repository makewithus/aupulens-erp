import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import {
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_TYPE,
  PlatformEventCategory,
  PlatformSeverity,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { withCrossTenantRead } from "@/lib/platform/tenancy/crossTenant";

export interface AuditLogSearchQuery {
  page?: number;
  pageSize?: number;
  tenantId?: string;
  eventCategory?: PlatformEventCategory;
  severity?: PlatformSeverity;
  actorId?: string;
}

const MAX_PAGE_SIZE = 100;

/**
 * The global, cross-tenant audit log viewer (source doc §19's audit surface).
 * Goes through the gateway like every other cross-tenant read — viewing the
 * audit log is itself audited (source doc §6's "access should itself be
 * logged" applies here too, not just to organisation data).
 */
export async function searchPlatformAuditLogs(actor: AdminActor, reason: string, query: AuditLogSearchQuery) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_AUDIT_LOGS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    entityType: "PlatformAuditLog",
    run: async () => {
      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 50));

      const filter: Record<string, unknown> = {};
      if (query.tenantId) filter.tenantId = query.tenantId;
      if (query.eventCategory) filter.eventCategory = query.eventCategory;
      if (query.severity) filter.severity = query.severity;
      if (query.actorId) filter.actorId = query.actorId;

      const [total, rows] = await Promise.all([
        PlatformAuditLog.countDocuments(filter),
        PlatformAuditLog.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
      ]);

      return {
        page,
        pageSize,
        total,
        rows: rows.map((r) => ({
          id: String(r._id),
          tenantId: r.tenantId,
          actorId: r.actorId,
          actorType: r.actorType,
          actorRole: r.actorRole,
          eventCategory: r.eventCategory,
          eventType: r.eventType,
          severity: r.severity,
          entityType: r.entityType,
          entityId: r.entityId,
          metadata: r.metadata,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  });
}
