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
import { PLAN_SEAT_BANDS, type SeatBandPlanKey } from "@/lib/billing/seatBands";

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
  availableForPurchase?: boolean;
  meteredUsers?: boolean;
  includedUsers?: number;
  additionalUserPriceMonthly?: number;
  additionalUserPriceYearly?: number;
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
  if (input.availableForPurchase !== undefined) plan.availableForPurchase = input.availableForPurchase;
  if (input.meteredUsers !== undefined) plan.meteredUsers = input.meteredUsers;
  if (input.includedUsers !== undefined) plan.includedUsers = input.includedUsers;
  if (input.additionalUserPriceMonthly !== undefined) plan.additionalUserPriceMonthly = input.additionalUserPriceMonthly;
  if (input.additionalUserPriceYearly !== undefined) plan.additionalUserPriceYearly = input.additionalUserPriceYearly;
  if (input.features) {
    for (const field of ["aiCreditsPerMonth", "aiCreditsPerSession", "aiCreditsPerWeek"] as const) {
      const value = input.features[field];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        throw new ManagePlanError(`${field} must be a non-negative whole number of AI credit units.`, 400);
      }
    }
    plan.features = { ...plan.features, ...input.features } as IPlanFeatures;
  }
  // Customer-facing seat bands and rates are fixed product specifications.
  // Keep them server-side even if a plan edit request changes these fields.
  const seatSpec = PLAN_SEAT_BANDS[planKey as SeatBandPlanKey];
  if (seatSpec) {
    plan.name = seatSpec.displayName;
    plan.description = seatSpec.description;
    plan.priceMonthly = seatSpec.baseMonthly;
    plan.priceYearly = seatSpec.baseYearly;
    plan.includedUsers = seatSpec.minimum;
    plan.features.maxUsers = seatSpec.maximum;
    plan.meteredUsers = planKey !== "starter";
    plan.additionalUserPriceMonthly = seatSpec.extraMonthly;
    plan.additionalUserPriceYearly = seatSpec.extraYearly;
  }
  if (input.features?.maxUsers !== undefined && input.includedUsers === undefined && (plan.includedUsers ?? 1) > plan.features.maxUsers) {
    plan.includedUsers = plan.features.maxUsers;
  }
  if (!Number.isSafeInteger(plan.includedUsers ?? plan.features.maxUsers) || (plan.includedUsers ?? plan.features.maxUsers) < 1 || (plan.includedUsers ?? plan.features.maxUsers) > plan.features.maxUsers) {
    throw new ManagePlanError("Included users must be a whole number between 1 and the plan's maximum users.", 400);
  }
  for (const [label, value] of [
    ["Monthly extra user price", plan.additionalUserPriceMonthly],
    ["Annual extra user price", plan.additionalUserPriceYearly],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new ManagePlanError(`${label} must be zero or greater.`, 400);
    }
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
      availableForPurchase: before.availableForPurchase,
      meteredUsers: before.meteredUsers,
      includedUsers: before.includedUsers,
      additionalUserPriceMonthly: before.additionalUserPriceMonthly,
      additionalUserPriceYearly: before.additionalUserPriceYearly,
      features: before.features,
    },
    newValue: {
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      active: plan.active,
      availableForPurchase: plan.availableForPurchase,
      meteredUsers: plan.meteredUsers,
      includedUsers: plan.includedUsers,
      additionalUserPriceMonthly: plan.additionalUserPriceMonthly,
      additionalUserPriceYearly: plan.additionalUserPriceYearly,
      features: plan.features,
    },
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
}
