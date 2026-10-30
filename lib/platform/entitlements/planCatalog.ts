import Plan, { type IPlanFeatures } from "@/models/platform/Plan";
import { PLAN_KEY, PLAN_KEY_LABELS, SUPPORT_LEVEL } from "@/lib/constants/statuses";
import { PLAN_SEAT_BANDS } from "@/lib/billing/seatBands";

/**
 * Source doc §8's plan catalogue — the single source of truth read by both
 * `scripts/seed-platform-plans.ts` and `scripts/seed-platform-demo.ts`
 * (never duplicated between them). CUSTOM is seeded as a template
 * (isCustom: true, basedOnPlanKey: BUSINESS) — real custom deals are an
 * `OrganizationEntitlement.overrides` layer on top of whichever plan an
 * admin assigns as the base, not a second CUSTOM row per customer.
 */
export const PLAN_DEFINITIONS: Record<
  string,
  { name?: string; priceMonthly: number; priceYearly: number; isCustom?: boolean; availableForPurchase?: boolean; meteredUsers?: boolean; includedUsers?: number; additionalUserPriceMonthly?: number; additionalUserPriceYearly?: number; basedOnPlanKey?: string; description?: string; features: IPlanFeatures }
> = {
  [PLAN_KEY.FREE]: {
    priceMonthly: 0,
    priceYearly: 0,
    features: {
      modules: ["admin"],
      maxUsers: 2,
      maxCompanies: 1,
      storageGb: 1,
      apiRequestsPerMonth: 0,
      aiCreditsPerMonth: 500,
      aiCreditsPerSession: 20,
      aiCreditsPerWeek: 100,
      aiRequestsPerMonth: 20,
      automationRunsPerMonth: 0,
      documentLimitPerMonth: 10,
      supportLevel: SUPPORT_LEVEL.COMMUNITY,
      featureFlags: {},
    },
  },
  // Module sets and AI limits remain aligned with the legacy tier catalogue.
  // Customer-facing seat capacities and incremental rates are defined in
  // seatBands.ts; Scale intentionally supports up to 500 users even though
  // the older tier table has a lower professional-tier cap.
  [PLAN_KEY.STARTER]: {
    name: PLAN_SEAT_BANDS.starter.displayName,
    priceMonthly: PLAN_SEAT_BANDS.starter.baseMonthly,
    priceYearly: PLAN_SEAT_BANDS.starter.baseYearly,
    availableForPurchase: true,
    meteredUsers: true,
    includedUsers: PLAN_SEAT_BANDS.starter.minimum,
    description: PLAN_SEAT_BANDS.starter.description,
    features: {
      modules: ["admin", "hr", "inventory"],
      maxUsers: PLAN_SEAT_BANDS.starter.maximum,
      maxCompanies: 1,
      storageGb: 5,
      apiRequestsPerMonth: 1000,
      aiCreditsPerMonth: 100,
      aiCreditsPerSession: 20,
      aiCreditsPerWeek: 100,
      aiRequestsPerMonth: 100,
      automationRunsPerMonth: 20,
      documentLimitPerMonth: 100,
      supportLevel: SUPPORT_LEVEL.EMAIL,
      featureFlags: {},
    },
  },
  [PLAN_KEY.GROWTH]: {
    name: PLAN_SEAT_BANDS.growth.displayName,
    priceMonthly: PLAN_SEAT_BANDS.growth.baseMonthly,
    priceYearly: PLAN_SEAT_BANDS.growth.baseYearly,
    availableForPurchase: true,
    meteredUsers: true,
    includedUsers: PLAN_SEAT_BANDS.growth.minimum,
    additionalUserPriceMonthly: PLAN_SEAT_BANDS.growth.extraMonthly,
    additionalUserPriceYearly: PLAN_SEAT_BANDS.growth.extraYearly,
    description: PLAN_SEAT_BANDS.growth.description,
    features: {
      modules: ["admin", "finance", "sales", "inventory", "crm", "manufacturing", "hr", "project"],
      maxUsers: PLAN_SEAT_BANDS.growth.maximum,
      maxCompanies: 1,
      storageGb: 25,
      apiRequestsPerMonth: 5000,
      aiCreditsPerMonth: 500,
      aiCreditsPerSession: 50,
      aiCreditsPerWeek: 250,
      aiRequestsPerMonth: 500,
      automationRunsPerMonth: 100,
      documentLimitPerMonth: 500,
      supportLevel: SUPPORT_LEVEL.EMAIL,
      featureFlags: {},
    },
  },
  [PLAN_KEY.PRO]: {
    name: PLAN_SEAT_BANDS.pro.displayName,
    priceMonthly: PLAN_SEAT_BANDS.pro.baseMonthly,
    priceYearly: PLAN_SEAT_BANDS.pro.baseYearly,
    availableForPurchase: true,
    meteredUsers: true,
    includedUsers: PLAN_SEAT_BANDS.pro.minimum,
    additionalUserPriceMonthly: PLAN_SEAT_BANDS.pro.extraMonthly,
    additionalUserPriceYearly: PLAN_SEAT_BANDS.pro.extraYearly,
    description: PLAN_SEAT_BANDS.pro.description,
    features: {
      modules: ["admin", "hr", "inventory", "finance", "sales", "crm"],
      maxUsers: PLAN_SEAT_BANDS.pro.maximum,
      maxCompanies: 3,
      storageGb: 100,
      apiRequestsPerMonth: 25000,
      aiCreditsPerMonth: 1000,
      aiCreditsPerSession: 100,
      aiCreditsPerWeek: 500,
      aiRequestsPerMonth: 1000,
      automationRunsPerMonth: 500,
      documentLimitPerMonth: 2000,
      supportLevel: SUPPORT_LEVEL.PRIORITY,
      featureFlags: {},
    },
  },
  [PLAN_KEY.BUSINESS]: {
    priceMonthly: 19999,
    priceYearly: 199990,
    features: {
      modules: ["admin", "finance", "sales", "inventory", "crm", "hr", "project", "manufacturing"],
      maxUsers: 150,
      maxCompanies: 10,
      storageGb: 500,
      apiRequestsPerMonth: 100000,
      aiCreditsPerMonth: 6000,
      aiCreditsPerSession: 250,
      aiCreditsPerWeek: 1500,
      aiRequestsPerMonth: 10000,
      automationRunsPerMonth: 2000,
      documentLimitPerMonth: 10000,
      supportLevel: SUPPORT_LEVEL.PRIORITY,
      featureFlags: {},
    },
  },
  [PLAN_KEY.ENTERPRISE]: {
    priceMonthly: 49999,
    priceYearly: 499990,
    features: {
      modules: ["admin", "hr", "inventory", "finance", "sales", "crm", "project", "manufacturing"],
      maxUsers: 100,
      maxCompanies: 50,
      storageGb: 2000,
      apiRequestsPerMonth: 1000000,
      aiCreditsPerMonth: 12000,
      aiCreditsPerSession: 500,
      aiCreditsPerWeek: 3000,
      aiRequestsPerMonth: 10000,
      automationRunsPerMonth: 10000,
      documentLimitPerMonth: 100000,
      supportLevel: SUPPORT_LEVEL.DEDICATED,
      featureFlags: {},
    },
  },
  [PLAN_KEY.CUSTOM]: {
    priceMonthly: 0,
    priceYearly: 0,
    isCustom: true,
    basedOnPlanKey: PLAN_KEY.BUSINESS,
    features: {
      modules: ["admin", "finance", "sales", "inventory", "crm", "hr", "project", "manufacturing"],
      maxUsers: 150,
      maxCompanies: 10,
      storageGb: 500,
      apiRequestsPerMonth: 100000,
      aiCreditsPerMonth: 6000,
      aiCreditsPerSession: 250,
      aiCreditsPerWeek: 1500,
      aiRequestsPerMonth: 10000,
      automationRunsPerMonth: 2000,
      documentLimitPerMonth: 10000,
      supportLevel: SUPPORT_LEVEL.DEDICATED,
      featureFlags: {},
    },
  },
};

/** Pure seeding logic — no connectDB()/connection-close of its own, so
 *  callers (scripts, each managing their own connection lifecycle) can
 *  compose it safely without side effects on import. */
export async function seedPlans(): Promise<void> {
  for (const [key, plan] of Object.entries(PLAN_DEFINITIONS)) {
    await Plan.findOneAndUpdate(
      { key },
      {
        $set: {
          key,
          name: plan.name ?? PLAN_KEY_LABELS[key as keyof typeof PLAN_KEY_LABELS],
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          billingCycleOptions: ["monthly", "yearly"],
          isCustom: plan.isCustom ?? false,
          basedOnPlanKey: plan.basedOnPlanKey,
          description: plan.description ?? "",
          features: plan.features,
          active: true,
          availableForPurchase: plan.availableForPurchase ?? false,
          meteredUsers: plan.meteredUsers ?? false,
          includedUsers: plan.includedUsers ?? plan.features.maxUsers,
          additionalUserPriceMonthly: plan.additionalUserPriceMonthly ?? 0,
          additionalUserPriceYearly: plan.additionalUserPriceYearly ?? 0,
        },
      },
      { upsert: true, new: true },
    );
  }
}
