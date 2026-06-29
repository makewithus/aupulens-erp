import mongoose, { Schema, Document, Model } from "mongoose";

export type AiModule =
  | "admin"
  | "finance"
  | "hr"
  | "sales"
  | "inventory"
  | "manufacturing";

export interface IChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface IChatHistory extends Document {
  tenantId: string;
  userId: mongoose.Types.ObjectId;
  /** Stable client-generated or server-assigned ID that groups turns together */
  conversationId: string;
  /** Which ERP module owns this conversation */
  module: AiModule;
  title: string;
  messages: IChatMessage[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, required: true },
});

const AI_MODULES: AiModule[] = [
  "admin", "finance", "hr", "sales", "inventory", "manufacturing",
];

const ChatHistorySchema: Schema<IChatHistory> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: String, required: true },
    module: { type: String, enum: AI_MODULES, required: true },
    title: { type: String, required: true },
    messages: [ChatMessageSchema],
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Existing query indexes (preserved)
ChatHistorySchema.index({ userId: 1, createdAt: -1 });
ChatHistorySchema.index({ userId: 1, isArchived: 1 });
// New: look up / upsert a conversation by its ID within a tenant
ChatHistorySchema.index({ tenantId: 1, conversationId: 1 }, { unique: true });
// Quickly list all conversations for a module within a tenant
ChatHistorySchema.index({ tenantId: 1, module: 1, createdAt: -1 });

const ChatHistory: Model<IChatHistory> =
  (mongoose.models?.ChatHistory as Model<IChatHistory>) ||
  mongoose.model<IChatHistory>("ChatHistory", ChatHistorySchema);

export default ChatHistory;
