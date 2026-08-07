/**
 * Scope E live verification: scoped RAG over real tenant data.
 * 1. index default-tenant's invoices + CRM notes (real text-embedding-ada-002)
 * 2. ask a grounded question (real gpt-4o) — answer cites retrieved context
 * 3. cross-tenant scoping: a different tenant retrieves 0 of A's chunks
 *
 * Run: npx tsx scripts/verify-rag.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "default-tenant";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { indexTenantDocuments, ragQuery, retrieve } = await import("../lib/ai/rag");
  const { embedText } = await import("../lib/ai/claude");

  // 1) index
  const idx = await indexTenantDocuments(TENANT, { limitPerSource: 15 });
  console.log(`1. Indexed: ${idx.indexed} docs (${idx.bySource.invoice} invoices, ${idx.bySource.crm_note} notes), embeddingConfigured=${idx.embeddingConfigured}`);

  if (idx.indexed === 0) {
    console.log("   (no invoices/notes for this tenant to index — skipping query)");
  } else {
    // 2) grounded query
    const q = "What invoices do we have and what is their status?";
    const ans = await ragQuery(TENANT, q);
    console.log(`2. RAG query "${q}"`);
    console.log(`   method=${ans.method} chunks=${ans.chunks?.length}`);
    console.log(`   answer: "${ans.answer?.slice(0, 160)}…"`);

    // 3) cross-tenant scoping
    const qv = await embedText("invoices");
    const otherTenant = await retrieve("zz-nonexistent-tenant", qv, 5);
    console.log(`3. Cross-tenant retrieve for a different tenant: ${otherTenant.chunks.length} chunk(s) (must be 0) → ${otherTenant.chunks.length === 0 ? "PASS: knowledge base is tenant-scoped" : "FAIL"}`);
  }

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
