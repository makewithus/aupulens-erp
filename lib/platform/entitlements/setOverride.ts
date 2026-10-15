import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { IPlanFeatures } from "@/models/platform/Plan";
import {
  ADMIN_CAPABILITY,
  PLAN_KEY,
  type PlanKeyType,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";
import { bridgeTierToPlanKey, invalidateEntitlementsCache } from "./resolve";

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
 * one" (docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part 2, Group A item 3). An
 * existing assignment is edited in place. For a legacy tenant whose plan is
 * resolved from Organization.tier, a module-only override materializes that
 * already-effective fallback as the base assignment. Other override types
 * still require an explicit plan assignment.
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
    const isModuleOnlyOverride = Object.keys(overrides).length === 1 && Array.isArray(overrides.modules);
    if (!isModuleOnlyOverride) {
      throw new SetOverrideError(
        "This organisation has no assigned plan yet. Only module overrides can be saved on its current tier fallback; assign a plan before changing other entitlements.",
        400,
      );
    }

    const organization = await Organization.findOne({ subdomain: tenantId }).select("tier").lean();
    if (!organization) throw new SetOverrideError("Organisation not found.", 404);
    const planKey: PlanKeyType = bridgeTierToPlanKey(organization.tier);
    const plan = await Plan.findOne({ key: planKey, active: true }).select("key").lean();
    if (!plan || planKey === PLAN_KEY.CUSTOM) {
      throw new SetOverrideError("The organisation's tier fallback does not resolve to an active base plan.", 409);
    }

    const moduleList = overrides.modules as string[];
    if (moduleList.some((module) => typeof module !== "string" || !module.trim())) {
      throw new SetOverrideError("The module override contains an invalid module name.", 400);
    }
    const created = await OrganizationEntitlement.findOneAndUpdate(
      { tenantId },
      {
        $set: { overrides: { modules: [...new Set(moduleList)] } },
        $setOnInsert: { planKey, assignedAt: new Date(), effectiveFrom: new Date() },
      },
      { upsert: true, new: true, runValidators: true },
    );
    if (!created) throw new SetOverrideError("Unable to save the module override.", 500);

    invalidateEntitlementsCache(tenantId);
    await emitPlatformAuditEvent({
      actor,
      tenantId,
      eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION,
      eventType: PLATFORM_EVENT_TYPE.ENTITLEMENT_OVERRIDDEN,
      severity: PLATFORM_SEVERITY.INFO,
      entityType: "Organization",
      entityId: tenantId,
      oldValue: { planKey, source: "tier_fallback", overrides: null },
      newValue: { planKey, overrides: created.overrides },
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { reason, source: "tier_fallback_materialized" },
    });
    return;
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
