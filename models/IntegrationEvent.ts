import mongoose, { Model, Schema } from "mongoose";

/**
 * One row in the Aupulens Connect activity/health log — every inbound webhook,
 * outbound sync, and connection test lands here so the integrations dashboard
 * can show real-time health (success/failure counts, last activity).
 */

export const INTEGRATION_EVENT_DIRECTION = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
  TEST: "test",
} as const;

export const INTEGRATION_EVENT_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
} as const;

export interface IIntegrationEvent extends mongoose.Document {
  tenantId: string;
  integrationId: mongoose.Types.ObjectId;
  connectorId: string;
  direction: (typeof INTEGRATION_EVENT_DIRECTION)[keyof typeof INTEGRATION_EVENT_DIRECTION];
  eventType: string; // e.g. "payment.captured", "connection.test", "orders/create"
  status: (typeof INTEGRATION_EVENT_STATUS)[keyof typeof INTEGRATION_EVENT_STATUS];
  message?: string;
  /** SHA-256 digest of the raw payload — lets us show/ dedupe without storing PII. */
  payloadDigest?: string;
  createdAt: Date;
}

const IntegrationEventSchema = new Schema<IIntegrationEvent>(
  {
    tenantId: { type: String, required: true, index: true },
    integrationId: { type: Schema.Types.ObjectId, ref: "Integration", required: true, index: true },
    connectorId: { type: String, required: true },
    direction: { type: String, enum: Object.values(INTEGRATION_EVENT_DIRECTION), required: true },
    eventType: { type: String, default: "" },
    status: { type: String, enum: Object.values(INTEGRATION_EVENT_STATUS), required: true },
    message: { type: String },
    payloadDigest: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

IntegrationEventSchema.index({ tenantId: 1, createdAt: -1 });
IntegrationEventSchema.index({ tenantId: 1, integrationId: 1, createdAt: -1 });

const IntegrationEvent: Model<IIntegrationEvent> =
  (mongoose.models.IntegrationEvent as Model<IIntegrationEvent>) ||
  mongoose.model<IIntegrationEvent>("IntegrationEvent", IntegrationEventSchema);

export default IntegrationEvent;
