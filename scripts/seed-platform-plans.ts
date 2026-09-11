/**
 * Idempotent upsert of the source-doc §8 plan catalogue. Safe to re-run —
 * each plan's `features` is fully replaced, not merged. CUSTOM is seeded as
 * a template (isCustom: true, basedOnPlanKey: BUSINESS) — real custom deals
 * are represented as an OrganizationEntitlement.overrides layer on top of
 * whichever plan an admin assigns as the base, not a second CUSTOM row per
 * customer.
 *
 * Usage: npx tsx scripts/seed-platform-plans.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import Plan, { type IPlanFeatures } from "../models/platform/Plan";
import { PLAN_KEY, PLAN_KEY_LABELS, SUPPORT_LEVEL } from "../lib/constants/statuses";

const PLANS: Record<
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
  [PLAN_KEY.STARTER]: {
    priceMonthly: 999,
    priceYearly: 9990,
    features: {
      modules: ["admin", "finance", "sales"],
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
      modules: ["admin", "finance", "sales", "inventory", "crm", "hr"],
      maxUsers: 50,
      maxCompanies: 3,
      storageGb: 100,
      apiRequestsPerMonth: 25000,
      aiCreditsPerMonth: 2000,
      aiRequestsPerMonth: 2000,
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
      modules: ["admin", "finance", "sales", "inventory", "crm", "hr", "manufacturing"],
      maxUsers: 1000,
      maxCompanies: 50,
      storageGb: 2000,
      apiRequestsPerMonth: 1000000,
      aiCreditsPerMonth: 50000,
      aiRequestsPerMonth: 50000,
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

async function main() {
  await connectDB();
  for (const [key, plan] of Object.entries(PLANS)) {
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
    console.log(`Seeded Plan ${key}`);
  }
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
