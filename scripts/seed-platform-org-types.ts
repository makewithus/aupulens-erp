/**
 * Idempotent upsert of the 8 organisation types (source doc §4) and their
 * default configuration. Safe to re-run — each type's defaultConfig is
 * fully replaced, not merged.
 *
 * Usage: npx tsx scripts/seed-platform-org-types.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import OrganizationType from "../models/platform/OrganizationType";
import { ORGANIZATION_TYPE, ORGANIZATION_TYPE_LABELS } from "../lib/constants/statuses";

const DEFAULTS: Record<
  string,
  { description: string; enabledModules: string[]; maxUsers: number; aiCallsPerMonth: number }
> = {
  [ORGANIZATION_TYPE.SME]: {
    description: "Small/medium business — core finance and sales modules.",
    enabledModules: ["finance", "sales", "inventory"],
    maxUsers: 10,
    aiCallsPerMonth: 200,
  },
  [ORGANIZATION_TYPE.ENTERPRISE]: {
    description: "Large organisation — full module set, higher limits.",
    enabledModules: ["finance", "sales", "inventory", "hr", "manufacturing", "crm"],
    maxUsers: 200,
    aiCallsPerMonth: 5000,
  },
  [ORGANIZATION_TYPE.STARTUP]: {
    description: "Early-stage company — lean module set.",
    enabledModules: ["finance", "sales", "crm"],
    maxUsers: 15,
    aiCallsPerMonth: 300,
  },
  [ORGANIZATION_TYPE.ACCOUNTANT_CA_FIRM]: {
    description: "Accounting/CA firm managing multiple clients.",
    enabledModules: ["finance"],
    maxUsers: 25,
    aiCallsPerMonth: 500,
  },
  [ORGANIZATION_TYPE.MULTI_COMPANY_GROUP]: {
    description: "Group of related companies (each provisioned as its own tenant).",
    enabledModules: ["finance", "sales", "inventory", "hr", "manufacturing", "crm"],
    maxUsers: 100,
    aiCallsPerMonth: 2000,
  },
  [ORGANIZATION_TYPE.NON_PROFIT]: {
    description: "Non-profit organisation.",
    enabledModules: ["finance", "hr"],
    maxUsers: 15,
    aiCallsPerMonth: 200,
  },
  [ORGANIZATION_TYPE.EDUCATIONAL]: {
    description: "Educational institution.",
    enabledModules: ["finance", "hr"],
    maxUsers: 50,
    aiCallsPerMonth: 300,
  },
  [ORGANIZATION_TYPE.CUSTOM]: {
    description: "Custom configuration set individually by a Global Admin.",
    enabledModules: [],
    maxUsers: 5,
    aiCallsPerMonth: 100,
  },
};

async function main() {
  await connectDB();
  for (const [type, defaults] of Object.entries(DEFAULTS)) {
    await OrganizationType.findOneAndUpdate(
      { type },
      {
        $set: {
          type,
          label: ORGANIZATION_TYPE_LABELS[type as keyof typeof ORGANIZATION_TYPE_LABELS],
          description: defaults.description,
          defaultConfig: {
            enabledModules: defaults.enabledModules,
            maxUsers: defaults.maxUsers,
            aiCallsPerMonth: defaults.aiCallsPerMonth,
          },
        },
      },
      { upsert: true, new: true },
    );
    console.log(`Seeded OrganizationType ${type}`);
  }
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
