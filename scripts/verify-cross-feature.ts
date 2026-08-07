/**
 * Final readiness — cross-feature integration checks (Part C).
 *
 * C1: AI kill-switch ON → Lead scoring, Command Center intent, Calendar
 *     conflict AI, and RAG all degrade to their deterministic path, none throw.
 * C2: AI_GLOBAL_MONTHLY_CAP still gates a NEW AI call site (Calendar conflicts).
 * C4: Marketplace install → the installed workflow is a real, editable rule
 *     that shows up in the automations list.
 *
 * Run: npx tsx scripts/verify-cross-feature.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "default-tenant";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const Organization = (await import("../models/Organization")).default;
  const { getAiPeriod, getGlobalAiUsageCount } = await import("../lib/ai/usage");
  const { resolveTenantAiSettings, callClaudeForTenant } = await import("../lib/ai/tenantAi");

  // Snapshot + force the AI kill-switch ON for this tenant.
  const org = await Organization.findOne({ subdomain: TENANT }).lean<any>();
  const originalAi = org?.settings?.ai ?? {};
  await Organization.updateOne({ subdomain: TENANT }, { $set: { "settings.ai.disabled": true } });

  try {
    console.log("── C1: AI kill-switch ON — every AI feature must fall back cleanly ──");

    const { scoreLeadWithAi } = await import("../lib/crm/leadScoring");
    const ls = await scoreLeadWithAi(TENANT, { lead_name: "T", company_name: "C", source: "Referral", budget_range: "10k", email: "a@b.com", phone: "1" });
    console.log(`  Lead scoring: score=${ls.score} aiUsed=${ls.insight.ok} (expect deterministic, aiUsed=false)`);

    const { tier, aiSettings } = await resolveTenantAiSettings(TENANT);
    const cmd = await callClaudeForTenant(TENANT, tier, aiSettings, "find leads", { maxTokens: 50 });
    console.log(`  Command Center: gated=${!("text" in cmd)} code=${"text" in cmd ? "-" : (cmd as any).code} (expect gated AI_DISABLED)`);

    const { detectConflicts } = await import("../lib/calendar/aggregateEvents");
    const { prioritizeConflicts } = await import("../lib/calendar/conflictInsight");
    const day = new Date().toISOString();
    const conflicts = detectConflicts([
      { id: "t1", source: "task", type: "task", title: "A", start: day, allDay: true },
      { id: "l1", source: "leave", type: "leave", title: "Leave", start: day, allDay: true },
    ]);
    const cal = await prioritizeConflicts(TENANT, conflicts);
    console.log(`  Calendar AI conflicts: aiUsed=${cal.aiUsed} conflicts=${cal.conflicts.length} (expect deterministic summary, aiUsed=false)`);

    const { ragQuery } = await import("../lib/ai/rag");
    const rag = await ragQuery(TENANT, "what invoices are unpaid");
    console.log(`  RAG query: ok=${rag.ok} gated=${!!rag.gated} aiUsed via answer present=${!!rag.answer} (expect gated, no throw)`);

    const c1Pass = !ls.insight.ok && !("text" in cmd) && !cal.aiUsed && (rag.gated || rag.ok);
    console.log(c1Pass ? "  C1 PASS: all four degrade cleanly, none threw.\n" : "  C1 FAIL\n");
  } finally {
    // Restore the AI settings no matter what.
    await Organization.updateOne({ subdomain: TENANT }, { $set: { "settings.ai": originalAi } });
  }

  // ── C2: global cap gates the Calendar AI call site too ──
  console.log("── C2: AI_GLOBAL_MONTHLY_CAP gates the new Calendar AI site ──");
  const period = getAiPeriod();
  const globalNow = await getGlobalAiUsageCount(period);
  process.env.AI_GLOBAL_MONTHLY_CAP = String(globalNow); // count >= cap → blocked
  const { detectConflicts: dc2 } = await import("../lib/calendar/aggregateEvents");
  const { prioritizeConflicts: pc2 } = await import("../lib/calendar/conflictInsight");
  const day2 = new Date().toISOString();
  const conf2 = dc2([
    { id: "t1", source: "task", type: "task", title: "A", start: day2, allDay: true },
    { id: "t2", source: "task", type: "task", title: "B", start: day2, allDay: true },
    { id: "l1", source: "leave", type: "leave", title: "Leave", start: day2, allDay: true },
  ]);
  const capped = await pc2(TENANT, conf2);
  console.log(`  With ceiling forced to ${globalNow}: aiUsed=${capped.aiUsed} (expect false — global cap gated it), summary still present=${!!capped.summary}`);
  console.log(!capped.aiUsed && capped.summary ? "  C2 PASS: global cap covers the Calendar AI site, deterministic fallback intact.\n" : "  C2 FAIL\n");
  process.env.AI_GLOBAL_MONTHLY_CAP = "17000";

  // ── C4: marketplace install → editable rule in the automations list ──
  console.log("── C4: Marketplace install → real editable rule ──");
  const CrmAutomationRule = (await import("../models/crm/AutomationRule")).default;
  const { installPackage } = await import("../lib/marketplace/packages");
  const uid = new mongoose.Types.ObjectId();
  const payload = { name: "Readiness install test", entity: "Lead", trigger: "record_created", conditions: [{ field: "priority", operator: "equals", value: "High" }], actions: [{ type: "create_task", payload: { title: "Do it" } }] };
  const before = await CrmAutomationRule.countDocuments({ tenantId: TENANT, name: "Readiness install test" });
  const res = await installPackage("workflow", payload, TENANT, String(uid));
  const rule = await CrmAutomationRule.findOne({ tenantId: TENANT, _id: res.refId }).lean<any>();
  const editable = !!rule && rule.entity === "Lead" && rule.trigger === "record_created" && Array.isArray(rule.actions) && rule.actions[0]?.type === "create_task" && rule.enabled === false;
  console.log(`  Installed rule present=${!!rule}, appears in list query=${(await CrmAutomationRule.countDocuments({ tenantId: TENANT, name: "Readiness install test" })) > before}, editable-shape=${editable} (enabled=${rule?.enabled})`);
  console.log(editable ? "  C4 PASS: installed package is a real, editable, disabled rule.\n" : "  C4 FAIL\n");
  await CrmAutomationRule.deleteMany({ tenantId: TENANT, name: "Readiness install test" });

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
