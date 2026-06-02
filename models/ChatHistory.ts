import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface IChatHistory extends Document {
  tenantId: string; // NEW: Multi-tenant support
  userId: mongoose.Types.ObjectId;
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

const ChatHistorySchema: Schema<IChatHistory> = new Schema(
  {
    tenantId: { type: String, required: true, index: true }, // Added to root
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    messages: [ChatMessageSchema],
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Index for faster queries
ChatHistorySchema.index({ userId: 1, createdAt: -1 });
ChatHistorySchema.index({ userId: 1, isArchived: 1 });

const ChatHistory: Model<IChatHistory> =
  (mongoose.models?.ChatHistory as Model<IChatHistory>) ||
  mongoose.model<IChatHistory>("ChatHistory", ChatHistorySchema);

export default ChatHistory;
