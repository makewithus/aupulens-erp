import mongoose, { Schema, Document, Model } from "mongoose";
import {
  AI_EVENT_STATUS_VALUES,
  AI_EVENT_STATUS,
  type AiEventStatus,
} from "@/lib/constants/statuses";

/**
 * The AI runtime's event outbox (docs/ai/BRIEF-01-FOUNDATION.md Part 2.5).
 *
 * No internal domain-event bus existed anywhere in this codebase before this
 * (verified — see docs/ai/SYSTEM_INVENTORY.md). emitEvent() writes a row here
 * and attempts inline dispatch in the same request (there is no persistent
 * worker to rely on — Vercel Cron only). Anything left `pending`/`failed`
 * after inline dispatch is drained by app/api/cron/ai/runtime-sweep on an
 * hourly schedule, with a retry cap before `dead_letter`.
 */

export interface IAiEvent extends Document {
  tenantId: string;
  eventKey: string;
  payload: Record<string, unknown>;
  status: AiEventStatus;
  /** Optional caller-supplied key to prevent duplicate emission of the same logical event. */
  dedupeKey?: string;
  attempts: number;
  lastError?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiEventSchema: Schema<IAiEvent> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    eventKey: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: AI_EVENT_STATUS_VALUES, default: AI_EVENT_STATUS.PENDING },
    dedupeKey: { type: String },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    processedAt: { type: Date },
  },
  { timestamps: true },
);

AiEventSchema.index({ tenantId: 1, eventKey: 1, dedupeKey: 1 }, { unique: true, sparse: true });
AiEventSchema.index({ status: 1, createdAt: 1 });

const AiEvent: Model<IAiEvent> =
  (mongoose.models.AiEvent as Model<IAiEvent>) ||
  mongoose.model<IAiEvent>("AiEvent", AiEventSchema);

export default AiEvent;
