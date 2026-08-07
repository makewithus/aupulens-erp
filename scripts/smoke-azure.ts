/**
 * Live Azure OpenAI smoke test (Go-Live Step A.3). Run: npx tsx scripts/smoke-azure.ts
 * Exercises the REAL lib/ai/claude.ts + lib/ai/tenantAi.ts against the live
 * endpoint (no mocks), and the embeddings path. Temporary — delete after go-live.
 */
import "dotenv/config";

async function main() {
  const { callClaude, embedText, CLAUDE_DEFAULT_MODEL, EMBEDDING_DEFAULT_MODEL } = await import("../lib/ai/claude");

  console.log("Chat deployment:", CLAUDE_DEFAULT_MODEL);
  console.log("Embedding deployment:", EMBEDDING_DEFAULT_MODEL);

  // 1. Finance-style completion
  console.log("\n[1] callClaude (finance-style) ...");
  const finance = await callClaude(
    "In one short sentence, what does a positive net income mean for a business?",
    { systemPrompt: "You are a precise finance analytics assistant.", maxTokens: 60 }
  );
  console.log("  RESPONSE:", finance);

  // 2. Lightweight (lead scoring shape — JSON)
  console.log("\n[2] callClaude (lead-scoring JSON) ...");
  const score = await callClaude(
    'Score this lead 0-100 and reply ONLY as JSON {"score":<n>,"confidence":<n>}. Data: {"source":"Referral","budget_range":"10k-50k"}',
    { maxTokens: 60 }
  );
  console.log("  RESPONSE:", score);

  // 3. Embeddings
  console.log("\n[3] embedText ...");
  const vec = await embedText("purchase orders awaiting approval");
  console.log("  EMBEDDING dims:", vec.length, "first3:", vec.slice(0, 3));

  // 4. Wrong deployment -> clear error, not silent
  console.log("\n[4] deliberately wrong deployment ...");
  try {
    await callClaude("hi", { model: "definitely-not-a-real-deployment", maxTokens: 5 });
    console.log("  UNEXPECTED: no error thrown");
  } catch (e: any) {
    console.log("  GOT EXPECTED ERROR:", e?.status || "", String(e?.message || e).slice(0, 160));
  }

  console.log("\nSMOKE TEST OK");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e?.status, e?.message || e);
  process.exit(1);
});
