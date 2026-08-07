/**
 * Verify AI response quality after the sanitizer + prompt rewrite:
 * the reported "how to create a lead" question must return clean, organised
 * how-to steps with NO internal IDs (no partnerId / ObjectId) in the answer.
 *
 * Run: npx tsx scripts/verify-ai-quality.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { resolveTenantAiSettings, callClaudeForTenant } = await import("../lib/ai/tenantAi");
  const { safeContextJson } = await import("../lib/ai/sanitizeContext");
  const { fetchAdminGeneralData } = await import("../lib/ai/adminDataFetcher");

  const TENANT = "default-tenant";
  const { tier, aiSettings } = await resolveTenantAiSettings(TENANT);
  const data = await fetchAdminGeneralData(TENANT);
  const summaryOnly = data && typeof data === "object" && "summary" in data ? { summary: (data as any).summary } : data;
  const safeData = safeContextJson(summaryOnly, { maxArray: 6 });

  console.log("Sanitized context sent to model (should have NO 24-hex IDs):");
  console.log("  contains ObjectId?", /[a-f0-9]{24}/i.test(safeData), "\n  ", safeData.slice(0, 200), "\n");

  const message = "how to create a lead in your system can you tell me";
  const prompt = `USER QUESTION: "${message}"

WORKSPACE SNAPSHOT (aggregate figures only — for answering data questions):
${safeData}

Decide what kind of question this is and answer accordingly:
• DATA/ANALYTICS question: answer using ONLY the figures above, never invent numbers, format money with ₹.
• HOW-TO/HELP question: give clear, numbered step-by-step guidance for using the Aupulens ERP app (which page/menu, what to fill). Do NOT reference the snapshot and do NOT show record values or codes.
Rules: never expose internal IDs; one-line summary then tight steps; no raw JSON.`;

  const res = await callClaudeForTenant(TENANT, tier, aiSettings, prompt, {
    systemPrompt: "You are Aupulens' precise ERP assistant. Organised, concise, accurate. For how-to questions give clear app navigation steps. NEVER print internal database IDs or raw JSON.",
    maxTokens: 700,
  });

  if (!("text" in res)) { console.log("Gated:", (res as any).code); await mongoose.disconnect(); return; }
  const answer = res.text;
  const hasObjectId = /[a-f0-9]{24}/i.test(answer);
  const mentionsPartnerId = /partnerId/i.test(answer);
  console.log("── ANSWER ──\n" + answer + "\n");
  console.log(`Answer contains an ObjectId? ${hasObjectId} (must be false)`);
  console.log(`Answer mentions raw 'partnerId'? ${mentionsPartnerId} (should be false)`);
  console.log(!hasObjectId && !mentionsPartnerId ? "PASS: clean, no leaked IDs" : "FAIL: still leaking IDs");

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
