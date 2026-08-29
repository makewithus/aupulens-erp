import mongoose, { Schema, Document, Model } from "mongoose";
import type { AiModule } from "./ChatHistory";

export type AiMemoryScope = "global" | AiModule;

export interface IAiMemory extends Document {
  tenantId: string;
  scope: AiMemoryScope;
  key: string;
  value: string;
  updatedAt: Date;
}

const AI_MEMORY_SCOPES: AiMemoryScope[] = [
  "global",
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
