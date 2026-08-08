import mongoose, { Model, Schema } from "mongoose";

/**
 * A configured connector instance for one tenant (Aupulens Connect / iPaaS).
 *
 * Credential VALUES are stored encrypted (AES-256-GCM via lib/crypto) in
 * `credentials` as { fieldKey: "iv:tag:cipher" }. They are never returned to the
 * client — API responses expose only which fields are set, not their values.
 */

export const INTEGRATION_STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTED: "connected",
  ERROR: "error",
} as const;

export type IntegrationStatus =
  (typeof INTEGRATION_STATUS)[keyof typeof INTEGRATION_STATUS];

export interface IIntegration extends mongoose.Document {
  tenantId: string;
  connectorId: string; // -> registry.ts id
  name: string;
  status: IntegrationStatus;
  enabled: boolean;
  /** fieldKey -> encrypted value. Secret fields encrypted; non-secret stored plain. */
  credentials: Record<string, string>;
  /** Random per-connection token embedded in the inbound webhook URL path. */
  webhookToken: string;
  lastTestAt?: Date;
  lastEventAt?: Date;
  lastError?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IntegrationSchema = new Schema<IIntegration>(
  {
    tenantId: { type: String, required: true, index: true },
    connectorId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(INTEGRATION_STATUS),
      default: INTEGRATION_STATUS.DISCONNECTED,
    },
    enabled: { type: Boolean, default: true },
    credentials: { type: Schema.Types.Mixed, default: {} },
    webhookToken: { type: String, required: true, index: true },
    lastTestAt: { type: Date },
    lastEventAt: { type: Date },
    lastError: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

IntegrationSchema.index({ tenantId: 1, createdAt: -1 });

const Integration: Model<IIntegration> =
  (mongoose.models.Integration as Model<IIntegration>) ||
  mongoose.model<IIntegration>("Integration", IntegrationSchema);

export default Integration;
