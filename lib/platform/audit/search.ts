import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import {
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
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

function mapAuditRow(r: {
  _id: unknown;
  tenantId?: string;
  actorId: string;
  actorType: string;
  actorRole: string;
  eventCategory: string;
  eventType: string;
  severity: string;
  entityType?: string;
  entityId?: string;
  metadata?: unknown;
  createdAt: Date;
}) {
  return {
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
  };
}

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

      return { page, pageSize, total, rows: rows.map(mapAuditRow) };
    },
  });
}

export interface SecurityEventSearchQuery {
  page?: number;
  pageSize?: number;
  tenantId?: string;
  severity?: string;
  eventType?: string;
  actorRole?: string;
}

/**
 * Phase 11 Part 1.4 (docs/admin/DECISIONS.md #1): the "security log" §21/§31
 * name is this — a dedicated view over the SAME `PlatformAuditLog` store,
 * never a second collection, so the append-only guarantee (Hard Rule 7)
 * never needs proving twice. A row qualifies if EITHER its `eventCategory`
 * is SECURITY or its `severity` is SECURITY — the two are independent
 * (e.g. `resolveEntitlements()`'s own error fallback writes
 * `eventCategory: SUBSCRIPTION` with `severity: SECURITY`; missing either
 * arm of the OR would silently drop a genuinely security-relevant row).
 * Gated on VIEW_SECURITY_LOGS specifically, not VIEW_AUDIT_LOGS — a
 * distinct capability in the §30 matrix even though every role that has one
 * currently has both.
 */
export async function searchSecurityEvents(actor: AdminActor, reason: string, query: SecurityEventSearchQuery) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_SECURITY_LOGS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    entityType: "PlatformAuditLog",
    run: async () => {
      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 50));

      const filter: Record<string, unknown> = {
        $or: [{ eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY }, { severity: PLATFORM_SEVERITY.SECURITY }],
      };
      if (query.tenantId) filter.tenantId = query.tenantId;
      if (query.severity) filter.severity = query.severity;
      if (query.eventType) filter.eventType = query.eventType;
      if (query.actorRole) filter.actorRole = query.actorRole;

      const [total, rows] = await Promise.all([
        PlatformAuditLog.countDocuments(filter),
        PlatformAuditLog.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
      ]);

      return { page, pageSize, total, rows: rows.map(mapAuditRow) };
    },
  });
}
