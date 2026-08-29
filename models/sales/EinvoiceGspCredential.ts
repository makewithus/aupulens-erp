import mongoose, { Schema, Document, Model } from "mongoose";
import {
  GSP_CONNECTION_STATUS_VALUES,
  GSP_CONNECTION_STATUS,
  type GspConnectionStatus,
} from "@/lib/constants/statuses";

// Our configured GSP provider name (shown pre-selected in the connect wizard).
// TODO: replace with the real GSP provider name once finalized with the business/legal team.
export const DEFAULT_GSP_PROVIDER = "Aupulens GSP";

export interface IEinvoiceGspCredential extends Document {
  tenantId: string;
  provider: string;
  username: string;
  encryptedPassword: string; // AES-256-GCM ciphertext, see lib/crypto.ts
  status: GspConnectionStatus;
  connectedAt?: Date;
  lastError?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EinvoiceGspCredentialSchema: Schema<IEinvoiceGspCredential> = new Schema(
  {
    tenantId: { type: String, required: true },
    provider: { type: String, required: true, default: DEFAULT_GSP_PROVIDER, trim: true },
    username: { type: String, required: true, trim: true },
    encryptedPassword: { type: String, required: true },
    status: {
      type: String,
      enum: GSP_CONNECTION_STATUS_VALUES,
      default: GSP_CONNECTION_STATUS.NOT_CONNECTED,
    },
    connectedAt: { type: Date },
    lastError: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// One GSP connection per tenant (matches the wizard's single-provider flow).
EinvoiceGspCredentialSchema.index({ tenantId: 1 }, { unique: true });

const EinvoiceGspCredential: Model<IEinvoiceGspCredential> =
  (mongoose.models.EinvoiceGspCredential as Model<IEinvoiceGspCredential>) ||
  mongoose.model<IEinvoiceGspCredential>("EinvoiceGspCredential", EinvoiceGspCredentialSchema);

export default EinvoiceGspCredential;
