import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Source doc §33: "AI cost is computed server-side from stored rates" —
 * never a client-sent value, never hardcoded per call site. One row per
 * model deployment name (Azure OpenAI deployment name, e.g. the value of
 * CLAUDE_DEFAULT_MODEL / AZURE_OPENAI_CHAT_DEPLOYMENT).
 */
export interface IAiCostRate extends Document {
  // Named modelName, not model — "model" collides with Mongoose Document's
  // own inherited .model() method and breaks the schema's TS types.
  modelName: string;
  inputCostPerMillionTokens: number;
  outputCostPerMillionTokens: number;
  effectiveFrom: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiCostRateSchema = new Schema<IAiCostRate>(
  {
    modelName: { type: String, required: true, unique: true },
    inputCostPerMillionTokens: { type: Number, required: true },
    outputCostPerMillionTokens: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

export default (mongoose.models.AiCostRate as Model<IAiCostRate>) ||
  mongoose.model<IAiCostRate>("AiCostRate", AiCostRateSchema);
