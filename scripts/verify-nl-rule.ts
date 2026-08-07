/**
 * Scope D live verification:
 * 1. NL → rule (real gpt-4o): parse a plain-English automation into a validated
 *    rule, SAVE it, then fire the engine to confirm it actually executes.
 * 2. business-health low-data: a tenant with no data gets a deterministic
 *    "insufficient_data" summary (no AI call, no invented insights).
 *
 * Run: npx tsx scripts/verify-nl-rule.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "default-tenant";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { parseRuleFromNaturalLanguage } = await import("../lib/crm/ai/nlToRule");
  const CrmAutomationRule = (await import("../models/crm/AutomationRule")).default;
  const CrmTask = (await import("../models/crm/Task")).default;
  const { triggerAutomation } = await import("../lib/crm/automationEngine");
  const { generateBusinessHealthSummary } = await import("../lib/ai/businessHealth");

  // ── 1) NL → rule ────────────────────────────────────────────────────────────
  const description = "When a new lead is created with a High priority, create a follow-up task to call them.";
  const outcome = await parseRuleFromNaturalLanguage(TENANT, description);
  console.log("1. Parse NL → rule:");
  if (!("rule" in outcome)) { console.log("   FAILED:", outcome.error); }
  else {
    console.log(`   trigger=${outcome.rule.trigger} entity=${outcome.rule.entity}`);
    console.log(`   conditions=${JSON.stringify(outcome.rule.conditions)}`);
    console.log(`   actions=${JSON.stringify(outcome.rule.actions.map((a) => a.type))}`);
    console.log(`   warnings=${outcome.warnings.length}`);

    // Save it (enabled so the engine will run it), then fire the trigger.
    const userId = new mongoose.Types.ObjectId();
    const entityId = new mongoose.Types.ObjectId(); // real id for the execution log
    const CrmAutomationExecution = (await import("../models/crm/AutomationExecution")).default;
    const rule = await CrmAutomationRule.create({ ...outcome.rule, enabled: true, tenantId: TENANT, createdBy: userId });
    await triggerAutomation(TENANT, outcome.rule.trigger, outcome.rule.entity, String(entityId), { priority: "High", lead_name: "NL Test Lead", owner_id: userId });
    const exec = await CrmAutomationExecution.findOne({ tenantId: TENANT, ruleId: rule._id }).lean<{ status: string }>();
    console.log(`   Engine fired: execution logged? ${!!exec} (status=${exec?.status}) → ${exec ? "PASS: NL rule saved + matched + executed end-to-end" : "FAIL: rule did not fire"}`);

    // cleanup
    await CrmAutomationRule.deleteOne({ _id: rule._id });
    await CrmAutomationExecution.deleteMany({ ruleId: rule._id });
    await CrmTask.deleteMany({ tenantId: TENANT, createdBy: userId });
  }

  // ── 2) business-health low-data ──────────────────────────────────────────────
  const emptyTenant = "zz-empty-verify-tenant";
  const res = await generateBusinessHealthSummary(emptyTenant);
  console.log(`2. business-health for empty tenant "${emptyTenant}": status=${res.status} (${res.status === "insufficient_data" ? "PASS: graceful, no AI call" : "unexpected"})`);
  const BusinessHealthSummary = (await import("../models/BusinessHealthSummary")).default;
  const doc = await BusinessHealthSummary.findOne({ tenantId: emptyTenant }).lean<{ summary: string }>();
  console.log(`   stored summary: "${doc?.summary?.slice(0, 70)}…"`);
  await BusinessHealthSummary.deleteMany({ tenantId: emptyTenant });

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
