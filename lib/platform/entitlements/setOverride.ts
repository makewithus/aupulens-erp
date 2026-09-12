import connectDB from "@/lib/db";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { IPlanFeatures } from "@/models/platform/Plan";
import {
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";
import { invalidateEntitlementsCache } from "./resolve";

export class SetOverrideError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "SetOverrideError";
  }
}

/**
 * Source doc §11: "an override layer on top of a base plan, not a copy of
 * one" (docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part 2, Group A item 3). A
 * tenant must already have a base plan assigned (assignPlan.ts) before an
 * override can be layered on it — this function never creates the
 * OrganizationEntitlement row itself, only edits `overrides` on an existing
 * one, so "base plan" always means something real and visible on the
 * Subscription tab, never an implicit side effect of setting an override.
 *
 * Gated on the same capability as changing a tenant's plan (ASSIGN_PLAN) —
 * a custom override changes what a tenant is entitled to exactly like a
 * plan re-assignment does, and the §30 matrix draws no separate line for it.
 */
export async function setEntitlementOverride(
  actor: AdminActor,
  tenantId: string,
  overrides: Partial<IPlanFeatures>,
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.ASSIGN_PLAN);
  if (!reason || !reason.trim()) {
    throw new SetOverrideError("A reason is required to set a custom override.", 400);
  }

  await connectDB();
  const existing = await OrganizationEntitlement.findOne({ tenantId });
  if (!existing) {
    throw new SetOverrideError(
      "This organisation has no base plan assigned yet — assign one before layering a custom override on it.",
      400,
    );
  }

  const before = existing.overrides ?? {};
  existing.overrides = { ...before, ...overrides };
  await existing.save();

  invalidateEntitlementsCache(tenantId);

  await emitPlatformAuditEvent({
    actor,
    tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION,
    eventType: PLATFORM_EVENT_TYPE.ENTITLEMENT_OVERRIDDEN,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "Organization",
    entityId: tenantId,
    oldValue: { overrides: before },
    newValue: { overrides: existing.overrides, basePlanKey: existing.planKey },
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
}

/** Clears every override, reverting the tenant to its base plan's own
 *  definition exactly — the inverse of setEntitlementOverride, same
 *  capability, same audit trail shape. */
export async function clearEntitlementOverride(
  actor: AdminActor,
  tenantId: string,
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.ASSIGN_PLAN);
  if (!reason || !reason.trim()) {
    throw new SetOverrideError("A reason is required to clear a custom override.", 400);
  }

  await connectDB();
  const existing = await OrganizationEntitlement.findOne({ tenantId });
  if (!existing) {
    throw new SetOverrideError("This organisation has no base plan assigned yet.", 400);
  }

  const before = existing.overrides ?? {};
  // $unset, not an in-memory assignment + save() — matches assignPlan.ts's
  // own pattern for clearing this Mixed-type field, which Mongoose does not
  // reliably persist via a plain `doc.overrides = undefined; doc.save()`.
  await OrganizationEntitlement.updateOne({ tenantId }, { $unset: { overrides: "" } });

  invalidateEntitlementsCache(tenantId);

  await emitPlatformAuditEvent({
    actor,
    tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION,
    eventType: PLATFORM_EVENT_TYPE.ENTITLEMENT_OVERRIDDEN,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "Organization",
    entityId: tenantId,
    oldValue: { overrides: before },
    newValue: { overrides: null, basePlanKey: existing.planKey },
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason, action: "cleared" },
  });
}
