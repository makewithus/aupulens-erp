import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMessageTemplate extends Document {
  tenantId: string;
  name: string; // e.g. "Follow Up", "Welcome Customer"
  channel: string; // Email, WhatsApp, SMS
  subject?: string;
  body: string; // e.g. "Hello {{name}}, welcome to {{company}}!"
  createdBy: mongoose.Types.ObjectId;
}

const MessageTemplateSchema = new Schema<IMessageTemplate>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true },
    channel: { type: String, required: true, enum: ["Email", "WhatsApp", "SMS"] },
    subject: { type: String },
    body: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

MessageTemplateSchema.index({ tenantId: 1, channel: 1 });

export default (mongoose.models.CrmMessageTemplate as Model<IMessageTemplate>) ||
  mongoose.model<IMessageTemplate>("CrmMessageTemplate", MessageTemplateSchema);
