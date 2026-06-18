import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICommunication extends Document {
  tenantId: string;
  recordType: string;
  recordId: mongoose.Types.ObjectId;
  channel: string; // Email, WhatsApp, SMS, Phone Call, Meeting Note, Internal Comment, Web Chat
  direction: string; // inbound, outbound, internal
  subject?: string;
  message: string;
  attachments: string[]; // URLs or file IDs
  sender: string;
  recipient: string;
  status: string; // Draft, Scheduled, Sent, Delivered, Read, Failed
  scheduledAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  createdBy: mongoose.Types.ObjectId;
}

const CommunicationSchema = new Schema<ICommunication>(
  {
    tenantId: { type: String, required: true },
    recordType: { type: String, required: true },
    recordId: { type: Schema.Types.ObjectId, required: true },
    channel: {
      type: String,
      required: true,
      enum: ["Email", "WhatsApp", "SMS", "Phone Call", "Meeting Note", "Internal Comment", "Web Chat"],
    },
    direction: { type: String, enum: ["inbound", "outbound", "internal"], required: true },
    subject: { type: String },
    message: { type: String, required: true },
    attachments: [{ type: String }],
    sender: { type: String, required: true },
    recipient: { type: String, required: true },
    status: {
      type: String,
      enum: ["Draft", "Scheduled", "Sent", "Delivered", "Read", "Failed"],
      default: "Draft",
    },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

CommunicationSchema.index({ tenantId: 1, recordType: 1, recordId: 1 });
CommunicationSchema.index({ tenantId: 1, status: 1 });
CommunicationSchema.index({ tenantId: 1, scheduledAt: 1 });

export default (mongoose.models.CrmCommunication as Model<ICommunication>) ||
  mongoose.model<ICommunication>("CrmCommunication", CommunicationSchema);
