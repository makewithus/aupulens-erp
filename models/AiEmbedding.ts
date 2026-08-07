import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Stored text embeddings for scoped RAG (Scope E — AI Studio knowledge base).
 *
 * Each row is one chunk of a tenant's own business data (an invoice, a CRM
 * note) plus its text-embedding-ada-002 vector (1536 dims). Retrieval is
 * tenant-scoped so one workspace's knowledge base can never leak into another's
 * answers. If a MongoDB Atlas Vector Search index named "ai_embedding_index"
 * exists on `embedding`, lib/ai/rag.ts uses $vectorSearch; otherwise it falls
 * back to in-memory cosine similarity over this collection (documented).
 */
export interface IAiEmbedding extends Document {
  tenantId: string;
  sourceType: "invoice" | "crm_note";
  sourceId: string;
  text: string;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

const AiEmbeddingSchema: Schema<IAiEmbedding> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    sourceType: { type: String, enum: ["invoice", "crm_note"], required: true },
    sourceId: { type: String, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true },
);

// One row per source doc per tenant — re-indexing upserts rather than duplicates.
AiEmbeddingSchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 }, { unique: true });

const AiEmbedding: Model<IAiEmbedding> =
  (mongoose.models.AiEmbedding as Model<IAiEmbedding>) ||
  mongoose.model<IAiEmbedding>("AiEmbedding", AiEmbeddingSchema);

export default AiEmbedding;
