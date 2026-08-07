/**
 * Scope A live verification: exercise all 10 Native ERP AI functionalities
 * against REAL gpt-4o, then force the global ceiling to prove each one falls
 * back cleanly (deterministic value, no exception) when AI is unavailable.
 *
 * AI-ON  mode: real Azure calls; expect LLM-derived output (insight.ok / aiUsed).
 * FALLBACK mode: AI_GLOBAL_MONTHLY_CAP forced to the current platform count so
 *   every callClaudeForTenant gates → expect deterministic output, never throw.
 *
 * Run: npx tsx scripts/verify-native-ai.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "default-tenant";

const sampleLead = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  lead_name: "Priya Sharma",
  company_name: "Nimbus Analytics",
  source: "Referral",
  budget_range: "50k-100k",
  expected_timeline: "",
  notes: "Referred by an existing customer. Evaluating for a Q3 rollout across 3 regional offices. Asked about SSO and India data residency.",
  email: "priya@nimbus.example",
  phone: "",
  status: "New",
};

const sampleOpp = {
  _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
  deal_name: "Nimbus — Platform License",
  stage: "Negotiation",
  amount: 750000,
  probability: 60,
  expected_close_date: new Date(Date.now() - 5 * 864e5), // 5 days overdue
  stage_entered_at: new Date(Date.now() - 40 * 864e5),
  stakeholders: [{ name: "CFO" }, { name: "IT Head" }],
};

const existingAccounts = [
  { _id: "cccccccccccccccccccccccc", company_name: "International Business Machines", website: "ibm.com" },
  { _id: "dddddddddddddddddddddddd", company_name: "Acme Corporation Pvt Ltd", website: "acme.example" },
  { _id: "eeeeeeeeeeeeeeeeeeeeeeee", company_name: "Zenith Foods", website: "zenith.example" },
];
const newAccount = { _id: "ffffffffffffffffffffffff", company_name: "IBM", website: "" };

async function run(label: string) {
  console.log(`\n========== ${label} ==========`);
  const { scoreLeadWithAi } = await import("../lib/crm/leadScoring");
  const { getNextBestActionWithAi } = await import("../lib/crm/ai/nextBestAction");
  const { estimateWinProbabilityWithAi } = await import("../lib/crm/winProbability");
  const { suggestLeadCompletions } = await import("../lib/crm/dataCompletion");
  const { detectDuplicatesWithAi } = await import("../lib/crm/ai/duplicateAssistant");
  const { summarizeAndStoreConversation } = await import("../lib/crm/ai/conversationSummary");
  const { getLlmCrmInsight } = await import("../lib/crm/ai/llmInsight");

  // 1. Lead scoring
  const ls = await scoreLeadWithAi(TENANT, sampleLead);
  console.log(`1. Lead scoring       -> score=${ls.score} aiUsed=${ls.insight.ok}${ls.insight.ok ? ` conf=${ls.insight.confidence}` : ""}`);

  // 2. Next best action + 6. follow-up message (draftMessage)
  const nba = await getNextBestActionWithAi(TENANT, "Lead", sampleLead);
  console.log(`2. Next best action   -> "${nba.actions[0]?.action?.slice(0, 70)}" (priority ${nba.actions[0]?.priority})`);
  console.log(`6. Follow-up message  -> ${nba.suggestedFollowUpMessage ? `"${String(nba.suggestedFollowUpMessage).slice(0, 70)}…"` : "(deterministic fallback: no draft)"}`);

  // 3. Deal risk
  const dr = await getLlmCrmInsight(TENANT, "Assess this sales opportunity's deal risk and suggest one concrete next action.", JSON.stringify(sampleOpp));
  console.log(`3. Deal risk          -> aiUsed=${dr.ok}${dr.ok ? ` risk="${dr.summary?.slice(0, 60)}"` : ` (fallback: ${(dr as any).error})`}`);

  // 4. Conversation summary + 5. call note summary
  const cs = await summarizeAndStoreConversation({ tenantId: TENANT, recordType: "Lead", recordId: sampleLead._id, activityType: "Meeting", noteText: sampleLead.notes });
  console.log(`4/5. Conversation/call summary -> ok=${cs.ok}${cs.gated ? " (gated → fallback: no summary stored)" : ""}`);

  // 7. Win probability
  const wp = await estimateWinProbabilityWithAi(TENANT, sampleOpp);
  console.log(`7. Win probability    -> ${wp.probability}% aiUsed=${wp.insight.ok}`);

  // 8. Churn risk (AI reasoning layer)
  const cr = await getLlmCrmInsight(TENANT, "Assess this account's churn risk and suggest one retention action.", JSON.stringify({ company_name: "Nimbus Analytics", daysSinceLastActivity: 65, openTickets: 3, lastNps: 4 }));
  console.log(`8. Churn risk         -> aiUsed=${cr.ok}${cr.ok ? ` action="${cr.suggestedAction?.slice(0, 50)}"` : ` (fallback)`}`);

  // 9. Duplicate detection (semantic: "IBM" vs "International Business Machines")
  const dup = await detectDuplicatesWithAi(TENANT, newAccount, existingAccounts, "Account");
  console.log(`9. Duplicate detection -> aiUsed=${dup.aiUsed} matches=${dup.duplicates.length}${dup.duplicates.length ? ` top=[${dup.duplicates[0].source}] ${dup.duplicates[0].confidence}%` : ""}`);

  // 10. Data completion (suggest values for missing fields)
  const dc = await suggestLeadCompletions(TENANT, sampleLead);
  const suggested = dc.suggestions.filter((s) => s.suggestion).map((s) => `${s.field}="${s.suggestion}"`);
  console.log(`10. Data completion   -> aiUsed=${dc.aiUsed} suggestions=[${suggested.join(", ") || "none inferred"}]`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { getAiPeriod, getGlobalAiUsageCount } = await import("../lib/ai/usage");

  // AI-ON
  process.env.AI_GLOBAL_MONTHLY_CAP = "17000";
  await run("AI-ON (real gpt-4o)");

  // FALLBACK: force the global ceiling to the current count so every call gates.
  const now = await getGlobalAiUsageCount(getAiPeriod());
  process.env.AI_GLOBAL_MONTHLY_CAP = String(now);
  await run(`FALLBACK (global ceiling forced to ${now} → all calls gated)`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
