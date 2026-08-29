import mongoose, { Schema, Document, Model } from "mongoose";

// Minimal, generic email-template store shared by Reminders, Dunning Management,
// and Subscription Email Notifications (Sales module revamp Part 4) — no
// per-feature template infrastructure existed before this, so one small
// reusable model backs all three rather than three separate ones. `key` is a
// caller-chosen namespaced string, e.g. "reminder:<reminderId>",
// "dunning:<ruleId>:on-success", "notification:trial_expiring".
export interface IEmailTemplate extends Document {
  tenantId: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    tenantId: { type: String, required: true },
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, default: "" },
    body: { type: String, required: true, default: "" },
  },
  { timestamps: true },
);

EmailTemplateSchema.index({ tenantId: 1, key: 1 }, { unique: true });

const EmailTemplate: Model<IEmailTemplate> =
  (mongoose.models.EmailTemplate as Model<IEmailTemplate>) ||
  mongoose.model<IEmailTemplate>("EmailTemplate", EmailTemplateSchema);

export default EmailTemplate;
