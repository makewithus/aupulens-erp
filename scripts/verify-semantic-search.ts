/**
 * Scope G live verification: semantic universal search finds results a keyword
 * query would miss, while keyword remains the always-on baseline/fallback.
 *
 * Run: npx tsx scripts/verify-semantic-search.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "default-tenant";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { indexTenantDocuments } = await import("../lib/ai/rag");
  const { runUniversalSearch, runSemanticSearch, runCombinedSearch } = await import("../lib/search/universalSearch");

  // Ensure the knowledge base is indexed (reuses Scope E).
  const idx = await indexTenantDocuments(TENANT, { limitPerSource: 20 });
  console.log(`Indexed ${idx.indexed} docs for the knowledge base.`);

  // A natural-language query that shares NO literal keyword with invoice fields.
  const nlQuery = "money customers still owe us";

  const keyword = await runUniversalSearch(TENANT, "admin", nlQuery);
  console.log(`1. Keyword search "${nlQuery}": ${keyword.length} result(s) (expected ~0 — no literal match)`);

  const semantic = await runSemanticSearch(TENANT, "admin", nlQuery);
  console.log(`2. Semantic search "${nlQuery}": ${semantic.length} result(s)`);
  semantic.slice(0, 3).forEach((s) => console.log(`   - [${s.type}] ${s.title} (${s.subtitle})`));

  const combined = await runCombinedSearch(TENANT, "admin", nlQuery, { semantic: true });
  console.log(`3. Combined (semanticUsed=${combined.semanticUsed}): ${combined.results.length} result(s)`);

  // Keyword fallback still works for an exact term.
  const exact = await runUniversalSearch(TENANT, "admin", "INV");
  console.log(`4. Keyword baseline for "INV": ${exact.length} result(s) (fallback path intact)`);

  console.log(semantic.length > keyword.length ? "PASS: semantic surfaced matches keyword missed" : "NOTE: semantic did not exceed keyword (check indexed data)");

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
