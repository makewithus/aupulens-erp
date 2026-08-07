/**
 * Scoped RAG for AI Studio (Scope E).
 *
 * Pipeline:
 *   1. index  — embed a tenant's own invoices + CRM notes (text-embedding-ada-002)
 *               and upsert into the AiEmbedding collection.
 *   2. retrieve — embed the question, then fetch the top-k most similar chunks.
 *               Uses MongoDB Atlas Vector Search ($vectorSearch) when an index
 *               named "ai_embedding_index" exists; otherwise falls back to
 *               in-memory cosine similarity over the tenant's stored vectors.
 *   3. answer — gpt-4o answers grounded STRICTLY in the retrieved chunks, and is
 *               told to say it doesn't know rather than invent facts.
 *
 * Everything is tenant-scoped end to end — retrieval always filters by tenantId,
 * so one workspace's knowledge base can never surface in another's answer.
 */
import dbConnect from "@/lib/db";
import AiEmbedding from "@/models/AiEmbedding";
import { SalesInvoice } from "@/models/SalesInvoice";
import CrmActivity from "@/models/crm/Activity";
import { embedText, EMBEDDING_DEFAULT_MODEL } from "@/lib/ai/claude";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";

const VECTOR_INDEX = "ai_embedding_index";

export interface IndexResult {
  indexed: number;
  bySource: { invoice: number; crm_note: number };
  embeddingConfigured: boolean;
}

/** Build/refresh the tenant's knowledge base. Bounded per source to cap cost. */
export async function indexTenantDocuments(tenantId: string, opts: { limitPerSource?: number } = {}): Promise<IndexResult> {
  await dbConnect();
  if (!EMBEDDING_DEFAULT_MODEL) return { indexed: 0, bySource: { invoice: 0, crm_note: 0 }, embeddingConfigured: false };

  const limit = opts.limitPerSource ?? 50;

  const [invoices, notes] = await Promise.all([
    (SalesInvoice as any).find({ tenantId }).sort({ createdAt: -1 }).limit(limit).lean(),
    CrmActivity.find({ tenantId, $or: [{ description: { $exists: true, $ne: "" } }, { subject: { $exists: true, $ne: "" } }] }).sort({ createdAt: -1 }).limit(limit).lean(),
  ]);

  let invoiceCount = 0;
  let noteCount = 0;

  for (const inv of invoices as any[]) {
    const text = `Invoice ${inv.number ?? ""} dated ${inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : "?"}: total ${inv.totalAmount ?? inv.amount ?? 0}, status ${inv.status ?? "?"}.${inv.notes ? ` Notes: ${inv.notes}` : ""}`;
    await upsertEmbedding(tenantId, "invoice", String(inv._id), text);
    invoiceCount++;
  }
  for (const a of notes as any[]) {
    const text = `${a.type ?? "Note"}: ${a.subject ?? ""}${a.description ? ` — ${a.description}` : ""}`.trim();
    if (text.length < 3) continue;
    await upsertEmbedding(tenantId, "crm_note", String(a._id), text);
    noteCount++;
  }

  return { indexed: invoiceCount + noteCount, bySource: { invoice: invoiceCount, crm_note: noteCount }, embeddingConfigured: true };
}

async function upsertEmbedding(tenantId: string, sourceType: "invoice" | "crm_note", sourceId: string, text: string) {
  const embedding = await embedText(text);
  await AiEmbedding.findOneAndUpdate(
    { tenantId, sourceType, sourceId },
    { $set: { text, embedding } },
    { upsert: true },
  );
}

export interface RetrievedChunk { sourceType: string; sourceId: string; text: string; score: number }

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Retrieve the top-k chunks for a query. Tries Atlas $vectorSearch first; on any
 * error (no index configured, unsupported deployment) falls back to cosine over
 * the tenant's stored vectors. Returns which path was used for transparency.
 */
export async function retrieve(tenantId: string, queryVector: number[], k = 5): Promise<{ chunks: RetrievedChunk[]; method: "vector_search" | "cosine_fallback" }> {
  await dbConnect();
  // Attempt Atlas Vector Search.
  try {
    const docs = await AiEmbedding.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: "embedding",
          queryVector,
          numCandidates: 100,
          limit: k,
          filter: { tenantId },
        },
      },
      { $project: { sourceType: 1, sourceId: 1, text: 1, score: { $meta: "vectorSearchScore" } } },
    ]);
    if (Array.isArray(docs) && docs.length > 0) {
      return { chunks: docs.map((d: any) => ({ sourceType: d.sourceType, sourceId: d.sourceId, text: d.text, score: d.score })), method: "vector_search" };
    }
    // Empty result may just mean no index / no matches — fall through to cosine.
  } catch {
    // No Atlas Vector Search index on this cluster — use the documented fallback.
  }

  // Cosine fallback: load this tenant's vectors and rank in memory.
  const all = await AiEmbedding.find({ tenantId }, { sourceType: 1, sourceId: 1, text: 1, embedding: 1 }).lean<
    { sourceType: string; sourceId: string; text: string; embedding: number[] }[]
  >();
  const ranked = all
    .map((d) => ({ sourceType: d.sourceType, sourceId: d.sourceId, text: d.text, score: cosine(queryVector, d.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return { chunks: ranked, method: "cosine_fallback" };
}

export interface RagAnswer {
  ok: boolean;
  answer?: string;
  chunks?: RetrievedChunk[];
  method?: "vector_search" | "cosine_fallback";
  gated?: boolean;
  error?: string;
}

/** Full RAG query: embed question → retrieve → grounded gpt-4o answer. */
export async function ragQuery(tenantId: string, question: string): Promise<RagAnswer> {
  if (!EMBEDDING_DEFAULT_MODEL) return { ok: false, error: "Embeddings are not configured (AZURE_OPENAI_EMBEDDING_DEPLOYMENT)." };
  if (!question || question.trim().length < 3) return { ok: false, error: "Please ask a question." };

  let queryVector: number[];
  try {
    queryVector = await embedText(question);
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to embed the question." };
  }

  const { chunks, method } = await retrieve(tenantId, queryVector, 5);
  if (chunks.length === 0) {
    return { ok: true, answer: "I don't have any indexed data yet for this workspace. Build the knowledge base first.", chunks: [], method };
  }

  const context = chunks.map((c, i) => `[${i + 1}] (${c.sourceType}) ${c.text}`).join("\n");
  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
  const result = await callClaudeForTenant(
    tenantId,
    tier,
    aiSettings,
    `Answer the user's question using ONLY the context below. If the context does not contain the answer, say you don't have that information — never invent figures or facts.\n\nContext:\n${context}\n\nQuestion: ${question}`,
    { systemPrompt: "You are a retrieval-grounded assistant. Use only the provided context. Cite the bracket numbers you used. Reply concisely.", maxTokens: AI_MAX_TOKENS.rag },
  );

  if (!("text" in result)) return { ok: false, gated: true, error: result.error, chunks, method };
  return { ok: true, answer: result.text, chunks, method };
}
