import connectDB from "@/lib/db";
import Plan, { IPlanFeatures } from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import Organization from "@/models/admin/Organization";
import {
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  PlanKeyType,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";
import { getLegacyTierForPlanKey, invalidateEntitlementsCache } from "./resolve";

export class ManagePlanError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ManagePlanError";
  }
}

export interface PlanImpactCount {
  explicitlyAssigned: number;
  legacyTier: string | null;
  implicitlyBridged: number;
}

/**
 * Source doc §8, Group A item 2 (docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part
 * 2): "editing a plan changes every organisation on it at once" — this is
 * the count an admin must see before saving. Two populations, reported
 * separately rather than summed, because they arrived at this plan through
 * different mechanisms (a deliberate admin assignment vs. the legacy
 * tier-bridge fallback) and a reader should be able to tell them apart:
 * - explicitlyAssigned: a real OrganizationEntitlement row names this plan.
 * - implicitlyBridged: no entitlement row exists, but the tenant's legacy
 *   `Organization.tier` bridges to this plan key by default (only possible
 *   for STARTER/PRO/ENTERPRISE — see lib/platform/entitlements/resolve.ts's
 *   bridgeTierToPlanKey). Zero for GROWTH/BUSINESS/CUSTOM/FREE, which have
 *   no legacy-tier counterpart.
 */
export async function getPlanImpactCount(planKey: PlanKeyType): Promise<PlanImpactCount> {
  await connectDB();
  const explicitlyAssigned = await OrganizationEntitlement.countDocuments({ planKey });
  const legacyTier = getLegacyTierForPlanKey(planKey);
  let implicitlyBridged = 0;
  if (legacyTier) {
    const explicitTenantIds = await OrganizationEntitlement.distinct("tenantId", {});
    implicitlyBridged = await Organization.countDocuments({
      tier: legacyTier,
      subdomain: { $nin: explicitTenantIds },
    });
  }
  return { explicitlyAssigned, legacyTier, implicitlyBridged };
}

export interface PlanEditInput {
  name?: string;
  description?: string;
  priceMonthly?: number;
  priceYearly?: number;
  features?: Partial<IPlanFeatures>;
  active?: boolean;
}

/**
 * The one write path for a plan's own configuration (as distinct from
 * assignPlan.ts, which changes which plan a TENANT is on). A privileged,
 * multi-tenant-impact action: reason required, audited with the full before/
 * after feature diff, and the entitlement cache is cleared globally (not
 * per-tenant) since every tenant resolving to this plan key is affected at
 * once, not just one.
 */
export async function updatePlan(
  actor: AdminActor,
  planKey: PlanKeyType,
  input: PlanEditInput,
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_PLANS);
  if (!reason || !reason.trim()) {
    throw new ManagePlanError("A reason is required to edit a plan.", 400);
  }

  await connectDB();
  const plan = await Plan.findOne({ key: planKey });
  if (!plan) {
    throw new ManagePlanError(`Plan "${planKey}" does not exist.`, 404);
  }

  const before = plan.toObject();

  if (input.name !== undefined) plan.name = input.name;
  if (input.description !== undefined) plan.description = input.description;
  if (input.priceMonthly !== undefined) plan.priceMonthly = input.priceMonthly;
  if (input.priceYearly !== undefined) plan.priceYearly = input.priceYearly;
  if (input.active !== undefined) plan.active = input.active;
  if (input.features) {
    plan.features = { ...plan.features, ...input.features } as IPlanFeatures;
  }
  await plan.save();

  // A plan's own definition changed — every tenant that resolves to it
  // (explicitly assigned or legacy-tier-bridged) must see fresh limits on
  // their very next request, not up to 60s of stale cache.
  invalidateEntitlementsCache();

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION,
    eventType: PLATFORM_EVENT_TYPE.PLAN_UPDATED,
    severity: PLATFORM_SEVERITY.WARNING, // impacts every tenant on this plan at once
    entityType: "Plan",
    entityId: planKey,
    oldValue: {
      name: before.name,
      priceMonthly: before.priceMonthly,
      priceYearly: before.priceYearly,
      active: before.active,
      features: before.features,
    },
    newValue: {
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      active: plan.active,
      features: plan.features,
    },
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
}
