import mongoose, { Schema, Document, Model } from "mongoose";

export interface INotification extends Document {
  tenantId: string;
  userId: mongoose.Types.ObjectId;
  type: string; // TaskAlert, LeadAlert, ApprovalAlert, SLAAlert, OnboardingAlert, RenewalAlert, AutomationAlert
  title: string;
  message: string;
  isRead: boolean;
  actionUrl?: string;
  relatedRecordType?: string;
  relatedRecordId?: mongoose.Types.ObjectId;
  deliveryMethod: "InApp" | "Email" | "SMS" | "WhatsApp";
  status: "Sent" | "Delivered" | "Failed";
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    tenantId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    actionUrl: { type: String },
    relatedRecordType: { type: String },
    relatedRecordId: { type: Schema.Types.ObjectId },
    deliveryMethod: { type: String, enum: ["InApp", "Email", "SMS", "WhatsApp"], default: "InApp" },
    status: { type: String, enum: ["Sent", "Delivered", "Failed"], default: "Sent" },
  },
  { timestamps: true }
);

NotificationSchema.index({ tenantId: 1, userId: 1, isRead: 1 });

export default (mongoose.models.CrmNotification as Model<INotification>) ||
  mongoose.model<INotification>("CrmNotification", NotificationSchema);
