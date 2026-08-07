/**
 * Scope B: verify the Command Center's LLM intent classification routes real
 * commands to search / explain_report / action correctly (real gpt-4o).
 * Exercises the classification prompt directly (the route wraps this + dispatch).
 *
 * Run: npx tsx scripts/verify-command-intents.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { resolveTenantAiSettings, callClaudeForTenant } = await import("../lib/ai/tenantAi");
  const { COMMAND_ACTION_TYPES } = await import("../lib/ai/commandActions");
  const { tier, aiSettings } = await resolveTenantAiSettings("default-tenant");

  const classify = async (command: string) => {
    const prompt = `You are the command dispatcher for Aupulens ERP. Classify the user's command into ONE intent and extract its parameters.

User command: "${command}"
Current page: "/dashboard"

Intents:
- "navigate": user wants to go to a page. Provide "url".
- "search": user wants to FIND records. Provide "searchTerm".
- "explain_report": user wants an EXPLANATION of a report/metric/trend. Provide "reportType" (pipeline|leads|sales).
- "action": user wants to CHANGE data. Provide "actionType" (${COMMAND_ACTION_TYPES.join(", ")}) and "actionParams".
- "unknown".

Return ONLY JSON: {"intent":"...","url":"...","searchTerm":"...","reportType":"...","actionType":"...","actionParams":{...},"message":"..."}`;
    const r = await callClaudeForTenant("default-tenant", tier, aiSettings, prompt, { maxTokens: 200 });
    if (!("text" in r)) return { gated: r.code };
    try { return JSON.parse(r.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim()); } catch { return { raw: r.text }; }
  };

  const cases = [
    "find leads at Nimbus",
    "explain my pipeline",
    "take me to the invoices page",
    "delete the lead John Smith",
    "create a task to call the CFO tomorrow",
  ];
  for (const c of cases) {
    const out = await classify(c);
    console.log(`"${c}"\n  -> intent=${out.intent}${out.searchTerm ? ` searchTerm="${out.searchTerm}"` : ""}${out.reportType ? ` reportType=${out.reportType}` : ""}${out.url ? ` url=${out.url}` : ""}${out.actionType ? ` actionType=${out.actionType} params=${JSON.stringify(out.actionParams)}` : ""}`);
  }

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
