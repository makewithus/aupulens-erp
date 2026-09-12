import Plan, { type IPlanFeatures } from "@/models/platform/Plan";
import { PLAN_KEY, PLAN_KEY_LABELS, SUPPORT_LEVEL } from "@/lib/constants/statuses";

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
  { priceMonthly: number; priceYearly: number; isCustom?: boolean; basedOnPlanKey?: string; features: IPlanFeatures }
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
      aiCreditsPerMonth: 20,
      aiRequestsPerMonth: 20,
      automationRunsPerMonth: 0,
      documentLimitPerMonth: 10,
      supportLevel: SUPPORT_LEVEL.COMMUNITY,
      featureFlags: {},
    },
  },
  // STARTER/PRO/ENTERPRISE modules and (maxUsers, AI call count) are corrected
  // to be BYTE-FOR-BYTE identical to the pre-existing, tested, live
  // lib/constants/tiers.ts values for the legacy tier of the same name
  // (docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part 1.1) — tiers.ts describes
  // what real tenants can do TODAY; this catalogue was a seeded default
  // invented during this project with no tenant attached to it, and its
  // original numbers here were unreviewed SaaS-pricing-page guesses that
  // silently diverged from production reality (STARTER's module SET was
  // completely different; PRO/ENTERPRISE kept the right module set but the
  // wrong maxUsers/AI-call ceiling). Fields tiers.ts does not define
  // (maxCompanies, storageGb, apiRequestsPerMonth, automationRunsPerMonth,
  // documentLimitPerMonth, supportLevel) are unaffected by this correction —
  // there is nothing in tiers.ts to contradict them.
  [PLAN_KEY.STARTER]: {
    priceMonthly: 999,
    priceYearly: 9990,
    features: {
      modules: ["admin", "hr", "inventory"],
      maxUsers: 5,
      maxCompanies: 1,
      storageGb: 5,
      apiRequestsPerMonth: 1000,
      aiCreditsPerMonth: 100,
      aiRequestsPerMonth: 100,
      automationRunsPerMonth: 20,
      documentLimitPerMonth: 100,
      supportLevel: SUPPORT_LEVEL.EMAIL,
      featureFlags: {},
    },
  },
  [PLAN_KEY.GROWTH]: {
    priceMonthly: 2999,
    priceYearly: 29990,
    features: {
      modules: ["admin", "finance", "sales", "inventory", "crm"],
      maxUsers: 15,
      maxCompanies: 1,
      storageGb: 25,
      apiRequestsPerMonth: 5000,
      aiCreditsPerMonth: 500,
      aiRequestsPerMonth: 500,
      automationRunsPerMonth: 100,
      documentLimitPerMonth: 500,
      supportLevel: SUPPORT_LEVEL.EMAIL,
      featureFlags: {},
    },
  },
  [PLAN_KEY.PRO]: {
    priceMonthly: 7999,
    priceYearly: 79990,
    features: {
      modules: ["admin", "hr", "inventory", "finance", "sales", "crm"],
      maxUsers: 25,
      maxCompanies: 3,
      storageGb: 100,
      apiRequestsPerMonth: 25000,
      aiCreditsPerMonth: 1000,
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
      modules: ["admin", "finance", "sales", "inventory", "crm", "hr", "manufacturing"],
      maxUsers: 150,
      maxCompanies: 10,
      storageGb: 500,
      apiRequestsPerMonth: 100000,
      aiCreditsPerMonth: 10000,
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
      modules: ["admin", "hr", "inventory", "finance", "sales", "crm", "manufacturing"],
      maxUsers: 100,
      maxCompanies: 50,
      storageGb: 2000,
      apiRequestsPerMonth: 1000000,
      aiCreditsPerMonth: 10000,
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
      modules: ["admin", "finance", "sales", "inventory", "crm", "hr", "manufacturing"],
      maxUsers: 150,
      maxCompanies: 10,
      storageGb: 500,
      apiRequestsPerMonth: 100000,
      aiCreditsPerMonth: 10000,
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
          name: PLAN_KEY_LABELS[key as keyof typeof PLAN_KEY_LABELS],
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          billingCycleOptions: ["monthly", "yearly"],
          isCustom: plan.isCustom ?? false,
          basedOnPlanKey: plan.basedOnPlanKey,
          features: plan.features,
          active: true,
        },
      },
      { upsert: true, new: true },
    );
  }
}
