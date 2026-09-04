import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A drafted collection communication (docs/ai/BRIEF-05-BATCH-D.md, AI-05 algorithm step 4) —
 * content only, never sent. Sending is `NEVER_AUTONOMOUS` this batch (A.4): no `send_reminder`
 * tool is registered, and nothing in this model or its tool
 * (`draft_communication`, `lib/aiRuntime/tools/receivablesTools.ts`) can dispatch it. A human
 * reads it here (or via a future chunk's send tool) and acts through the existing Reminder/email
 * machinery in `lib/sales/reminderEngine.ts` if they choose to.
 *
 * `models/ai/**` scope — internal_state tool category (Task 0.3).
 */

export const AI_COMMUNICATION_STAGE = {
  PRE_DUE: "pre_due",
  GENTLE: "gentle",
  FIRM: "firm",
  FINAL: "final",
} as const;
export type AiCommunicationStage = (typeof AI_COMMUNICATION_STAGE)[keyof typeof AI_COMMUNICATION_STAGE];

export interface IAiCommunicationDraft extends Document {
  tenantId: string;
  workflowId: string;
  runId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  invoiceIds: mongoose.Types.ObjectId[];
  stage: AiCommunicationStage;
  subject: string;
  body: string;
  status: "drafted";
  createdAt: Date;
  updatedAt: Date;
}

const AiCommunicationDraftSchema: Schema<IAiCommunicationDraft> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    invoiceIds: [{ type: Schema.Types.ObjectId, ref: "SalesInvoice" }],
    stage: { type: String, enum: Object.values(AI_COMMUNICATION_STAGE), required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    status: { type: String, default: "drafted" },
  },
  { timestamps: true },
);

AiCommunicationDraftSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });

const AiCommunicationDraft: Model<IAiCommunicationDraft> =
  (mongoose.models.AiCommunicationDraft as Model<IAiCommunicationDraft>) ||
  mongoose.model<IAiCommunicationDraft>("AiCommunicationDraft", AiCommunicationDraftSchema);

export default AiCommunicationDraft;
