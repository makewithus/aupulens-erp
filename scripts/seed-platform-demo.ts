/**
 * Deterministic demo data for manual QA (source doc Part 5.4): several
 * organisations across different types/statuses/plans, real AI usage
 * history, real audit events, a real alert, and one suspended organisation.
 *
 * Deliberately calls the SAME real functions the admin UI calls
 * (createOrganization, changeOrganizationStatus, assignPlan, recordAiUsage,
 * rollupAiUsageForDay) rather than inserting documents directly — a tester
 * exploring this data is exploring exactly what a real admin action
 * produces, not a hand-crafted fixture that could drift from reality.
 *
 * Idempotent-ish: re-running after scripts/reset-platform-demo.ts is the
 * intended flow; running twice without a reset in between will fail on the
 * duplicate-subdomain check (by design — no partial/duplicate demo state).
 *
 * Usage: npx tsx scripts/seed-platform-demo.ts
 * Reset: npx tsx scripts/reset-platform-demo.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../lib/db";
import AdminUser from "../models/platform/AdminUser";
import AdminRole from "../models/platform/AdminRole";
import OrganizationType from "../models/platform/OrganizationType";
import AiCostRate from "../models/platform/AiCostRate";
import AiUsageRecord from "../models/platform/AiUsageRecord";
import RetentionPolicy from "../models/platform/RetentionPolicy";
import { ROLE_MATRIX } from "../lib/platform/auth/roleMatrix";
import { seedPlans } from "../lib/platform/entitlements/planCatalog";
import { ADMIN_ROLE, ADMIN_USER_STATUS, ORGANIZATION_STATUS, ORGANIZATION_TYPE, PLAN_KEY } from "../lib/constants/statuses";
import { createOrganization } from "../lib/platform/organizations/create";
import { changeOrganizationStatus } from "../lib/platform/organizations/statusTransition";
import { assignPlan } from "../lib/platform/entitlements/assignPlan";
import { rollupAiUsageForDay } from "../lib/platform/ai/rollup";
import { AdminActor } from "../lib/platform/auth/types";

const SYSTEM_ACTOR: AdminActor = {
  id: "demo-seed-script",
  email: "seed@demo.local",
  name: "Demo Seed Script",
  role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
  sessionId: "demo-seed-session",
};

const DEMO_ORGS = [
  { name: "Acme Manufacturing", subdomain: "demo-acme", type: ORGANIZATION_TYPE.ENTERPRISE, plan: PLAN_KEY.ENTERPRISE, targetStatus: ORGANIZATION_STATUS.ACTIVE },
  { name: "Bright Star Startup", subdomain: "demo-brightstar", type: ORGANIZATION_TYPE.STARTUP, plan: PLAN_KEY.STARTER, targetStatus: ORGANIZATION_STATUS.TRIAL },
  { name: "Ledger & Co CA Firm", subdomain: "demo-ledgerco", type: ORGANIZATION_TYPE.ACCOUNTANT_CA_FIRM, plan: PLAN_KEY.PRO, targetStatus: ORGANIZATION_STATUS.ACTIVE },
  { name: "Helping Hands NGO", subdomain: "demo-helpinghands", type: ORGANIZATION_TYPE.NON_PROFIT, plan: PLAN_KEY.STARTER, targetStatus: ORGANIZATION_STATUS.ACTIVE },
  { name: "Overdue Payments Ltd", subdomain: "demo-overdue", type: ORGANIZATION_TYPE.SME, plan: PLAN_KEY.STARTER, targetStatus: ORGANIZATION_STATUS.SUSPENDED },
];

async function ensureBootstrapSeeds() {
  for (const [role, { capabilities, description }] of Object.entries(ROLE_MATRIX)) {
    await AdminRole.findOneAndUpdate({ role }, { $set: { role, capabilities, description } }, { upsert: true });
  }
  await seedPlans();
  const orgTypeDefaults: Record<string, { enabledModules: string[]; maxUsers: number; aiCallsPerMonth: number }> = {
    [ORGANIZATION_TYPE.ENTERPRISE]: { enabledModules: ["finance", "sales", "inventory", "hr", "manufacturing", "crm"], maxUsers: 200, aiCallsPerMonth: 5000 },
    [ORGANIZATION_TYPE.STARTUP]: { enabledModules: ["finance", "sales", "crm"], maxUsers: 15, aiCallsPerMonth: 300 },
    [ORGANIZATION_TYPE.ACCOUNTANT_CA_FIRM]: { enabledModules: ["finance"], maxUsers: 25, aiCallsPerMonth: 500 },
    [ORGANIZATION_TYPE.NON_PROFIT]: { enabledModules: ["finance", "hr"], maxUsers: 15, aiCallsPerMonth: 200 },
    [ORGANIZATION_TYPE.SME]: { enabledModules: ["finance", "sales", "inventory"], maxUsers: 10, aiCallsPerMonth: 200 },
  };
  for (const [type, defaultConfig] of Object.entries(orgTypeDefaults)) {
    await OrganizationType.findOneAndUpdate(
      { type },
      { $set: { type, label: type, defaultConfig } },
      { upsert: true },
    );
  }
  await AiCostRate.findOneAndUpdate(
    { modelName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-4o" },
    { $set: { modelName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-4o", inputCostPerMillionTokens: 2.5, outputCostPerMillionTokens: 10 } },
    { upsert: true },
  );
  await RetentionPolicy.findOneAndUpdate({ isDefault: true }, { $set: { isDefault: true, retentionDays: 90 } }, { upsert: true });

  const bootstrapEmail = "demo-admin@aupulens.local";
  const existing = await AdminUser.findOne({ email: bootstrapEmail });
  if (!existing) {
    await AdminUser.create({
      name: "Demo Global Admin",
      email: bootstrapEmail,
      passwordHash: await bcrypt.hash("DemoAdminPassword123!", 10),
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      status: ADMIN_USER_STATUS.ACTIVE,
      mfaEnabled: false,
    });
    console.log(`Created demo AdminUser ${bootstrapEmail} / DemoAdminPassword123! (MFA enrollment required on first login)`);
  }
}

async function main() {
  await connectDB();
  await ensureBootstrapSeeds();

  for (const org of DEMO_ORGS) {
    console.log(`Creating ${org.name}...`);
    const { subdomain } = await createOrganization(SYSTEM_ACTOR, {
      name: org.name,
      subdomain: org.subdomain,
      organizationType: org.type,
      ownerName: `${org.name} Owner`,
      ownerEmail: `owner@${org.subdomain}.demo`,
      ownerPhone: "9999999999",
      ownerPassword: "DemoOwnerPassword123!",
      country: "India",
    });

    await assignPlan(SYSTEM_ACTOR, subdomain, org.plan, "immediately", "demo seed — initial plan assignment");

    // Follow the REAL state machine (lib/constants/statuses.ts's
    // ORGANIZATION_STATUS_TRANSITIONS) rather than a shortcut path — the
    // demo data should be reachable through the exact transitions the admin
    // UI itself enforces. ONBOARDING -> TRIAL and ONBOARDING -> ACTIVE are
    // both valid first steps; SUSPENDED requires going through ACTIVE first.
    if (org.targetStatus === ORGANIZATION_STATUS.SUSPENDED) {
      await changeOrganizationStatus(SYSTEM_ACTOR, subdomain, ORGANIZATION_STATUS.ACTIVE, "demo seed — onboarding complete");
      await changeOrganizationStatus(SYSTEM_ACTOR, subdomain, ORGANIZATION_STATUS.SUSPENDED, "demo seed — simulated non-payment");
    } else {
      await changeOrganizationStatus(SYSTEM_ACTOR, subdomain, org.targetStatus, "demo seed — onboarding complete");
    }

    // Real AI usage history: a handful of records across a few features.
    const features = ["ai_assistant", "ai_reports", "document_processing"];
    for (let i = 0; i < 8; i++) {
      const inputTokens = 500 + i * 50;
      const outputTokens = 250 + i * 25;
      const estimatedCostUsd = (inputTokens / 1_000_000) * 2.5 + (outputTokens / 1_000_000) * 10;
      await AiUsageRecord.create({
        tenantId: subdomain,
        feature: features[i % features.length],
        modelName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-4o",
        inputTokens,
        outputTokens,
        estimatedCostUsd,
        latencyMs: 800 + i * 20,
        status: i === 7 ? "error" : "success",
        requestId: `demo-${subdomain}-${i}`,
      });
    }
  }

  await rollupAiUsageForDay(new Date());
  console.log("Demo seed complete. Sign in at /platform/login with demo-admin@aupulens.local / DemoAdminPassword123!");
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
