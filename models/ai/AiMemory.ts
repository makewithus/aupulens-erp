import mongoose, { Schema, Document, Model } from "mongoose";
import type { AiModule } from "./ChatHistory";

/** "ai_nl_session" (Chunk 9, Part D — docs/ai/BRIEF-09-VERIFICATION.md) holds AI-NL's per-
 *  conversation working memory (result sets, pending clarification/proposal, applied modifiers —
 *  see lib/aiRuntime/nl/conversationMemory.ts). Deliberately NOT added to
 *  `app/api/ai/memory/route.ts`'s own `VALID_SCOPES` array (a separate, hand-maintained list, not
 *  derived from this one) — that route is a generic user-facing "remember this fact" surface with
 *  no `userId` dimension, and session state must never be listable/overwritable through it. This
 *  is "extend an existing model," not "build a third store": same collection, a scope value the
 *  generic memory API simply never validates. */
export type AiMemoryScope = "global" | "ai_nl_session" | AiModule;

export interface IAiMemory extends Document {
  tenantId: string;
  scope: AiMemoryScope;
  key: string;
  value: string;
  updatedAt: Date;
}

const AI_MEMORY_SCOPES: AiMemoryScope[] = [
  "global",
  "ai_nl_session",
  "admin",
  "finance",
  "hr",
  "sales",
  "inventory",
  "manufacturing",
];

const AiMemorySchema: Schema<IAiMemory> = new Schema(
  {
    tenantId: { type: String, required: true },
    scope: { type: String, enum: AI_MEMORY_SCOPES, required: true },
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { timestamps: true }
);

// Golden Rule #7: unique indexes must always be compound with tenantId
AiMemorySchema.index({ tenantId: 1, scope: 1, key: 1 }, { unique: true });
// Fast list of all memories for a tenant+scope
AiMemorySchema.index({ tenantId: 1, scope: 1 });

const AiMemory: Model<IAiMemory> =
  (mongoose.models?.AiMemory as Model<IAiMemory>) ||
  mongoose.model<IAiMemory>("AiMemory", AiMemorySchema);

export default AiMemory;
