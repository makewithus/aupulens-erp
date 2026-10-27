import mongoose, { Schema, Document, Model } from "mongoose";
import type { AiModule } from "./ChatHistory";

export type AiMemoryScope = "user" | "global" | AiModule;

export interface IAiMemory extends Document {
  tenantId: string;
  scope: AiMemoryScope;
  key: string;
  value: string;
  ownerUserId?: mongoose.Types.ObjectId;
  category?: "preference" | "project" | "decision" | "ongoing_task" | "other";
  sourceConversationId?: string;
  sourceMessageId?: string;
  approved?: boolean;
  deletedAt?: Date;
  updatedAt: Date;
}

const AI_MEMORY_SCOPES: AiMemoryScope[] = [
  "user",
  "global",
  "admin",
  "finance",
  "hr",
  "sales",
  "inventory",
  "manufacturing",
  "crm",
];

const AiMemorySchema: Schema<IAiMemory> = new Schema(
  {
    tenantId: { type: String, required: true, immutable: true },
    scope: { type: String, enum: AI_MEMORY_SCOPES, required: true },
    key: { type: String, required: true },
    value: { type: String, required: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
    category: { type: String, enum: ["preference", "project", "decision", "ongoing_task", "other"], default: "other" },
    sourceConversationId: { type: String, maxlength: 100 },
    sourceMessageId: { type: String, maxlength: 100 },
    // Legacy records were created only through the authenticated memory API;
    // preserve their existing behavior while new user memories are explicitly
    // approved by the save action.
    approved: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Golden Rule #7: unique indexes must always be compound with tenantId
AiMemorySchema.index({ tenantId: 1, scope: 1, key: 1 }, { unique: true });
// Fast list of all memories for a tenant+scope
AiMemorySchema.index({ tenantId: 1, scope: 1 });
AiMemorySchema.index({ tenantId: 1, ownerUserId: 1, scope: 1, updatedAt: -1 });

const AiMemory: Model<IAiMemory> =
  (mongoose.models?.AiMemory as Model<IAiMemory>) ||
  mongoose.model<IAiMemory>("AiMemory", AiMemorySchema);

export default AiMemory;
