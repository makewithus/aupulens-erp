import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import {
  ADMIN_CAPABILITY,
  AdminCapability,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { AdminForbiddenError, hasCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

/**
 * THE ONLY PLACE IN THIS CODEBASE THAT QUERIES TENANT DATA WITHOUT A
 * tenantId FILTER. Source doc §32 / brief Part 2.3.
 *
 * Every other line of application code in this repo follows Golden Rule #1
 * ("every DB query must include tenantId") — that is this platform's core
 * security property. Global Admin's whole reason to exist requires breaking
 * that rule on purpose, in exactly one place, with every use:
 *   1. capability-checked against the calling AdminActor's role,
 *   2. required to state a `reason` (source doc §6 — access is logged with
 *      why, not just that),
 *   3. audited BEFORE returning, including when the read is denied and
 *      including when it succeeds (source doc §6: "Global Admin access
 *      should itself be logged" — read-only access is not exempt),
 *   4. returning a projection the caller specifies, not a raw document, so a
 *      tenant's full record never flows into control-plane code by accident.
 *
 * This file must never be imported from app/api/<module>/** (tenant-facing
 * routes) or from any component outside app/platform/**, lib/platform/**,
 * or app/api/platform/** — enforced by tests/platform/sourceGrep.test.ts.
 * If you feel the pull to add "if admin, skip the tenant filter" to an
 * existing tenant route instead of calling through here, that is the
 * precise failure mode this file exists to prevent (Part 2.3's own words).
 */

export interface CrossTenantReadOptions<T> {
  actor: AdminActor;
  capability: AdminCapability;
  reason: string;
  eventType: (typeof PLATFORM_EVENT_TYPE)[keyof typeof PLATFORM_EVENT_TYPE];
  tenantId?: string;
  entityType?: string;
  entityId?: string;
  run: () => Promise<T>;
}

export async function withCrossTenantRead<T>(
  opts: CrossTenantReadOptions<T>,
): Promise<T> {
  const allowed = await hasCapability(opts.actor, opts.capability);
  if (!allowed) {
    await emitPlatformAuditEvent({
      actor: opts.actor,
      eventCategory: PLATFORM_EVENT_CATEGORY.ORGANISATION,
      eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ_DENIED,
      severity: PLATFORM_SEVERITY.WARNING,
      tenantId: opts.tenantId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      ipAddress: opts.actor.ip,
      userAgent: opts.actor.userAgent,
      metadata: { reason: opts.reason, requiredCapability: opts.capability },
    });
    throw new AdminForbiddenError(opts.capability);
  }

  await connectDB();
  const result = await opts.run();

  await emitPlatformAuditEvent({
    actor: opts.actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.ORGANISATION,
    eventType: opts.eventType,
    severity: PLATFORM_SEVERITY.INFO,
    tenantId: opts.tenantId,
    entityType: opts.entityType,
    entityId: opts.entityId,
    ipAddress: opts.actor.ip,
    userAgent: opts.actor.userAgent,
    metadata: { reason: opts.reason },
  });

  return result;
}

/**
 * Phase-1 proof-of-life consumer: a single real, non-static number for the
 * empty dashboard shell (Hard Rule 3 — no static data, ever, even in an
 * otherwise-empty phase). Later phases (2, 6) add richer gateway calls
 * (organisation list with projections, global search, org detail tabs)
 * beside this one, never by relaxing the tenant filter anywhere else.
 */
export async function countOrganizations(
  actor: AdminActor,
  reason: string,
): Promise<number> {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
    reason,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    entityType: "Organization",
    run: () => Organization.countDocuments({}),
  });
}
