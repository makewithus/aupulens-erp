import mongoose, { Schema, Document, Model } from "mongoose";

export interface IQuote extends Document {
  tenantId: string;
  quote_number: string;
  opportunity_id: mongoose.Types.ObjectId;
  account_id: mongoose.Types.ObjectId;
  owner_id: mongoose.Types.ObjectId;
  status: string;
  validity_date: Date;
  version: number;
  parent_quote_id: mongoose.Types.ObjectId;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  terms_and_conditions: string;
  template_id: mongoose.Types.ObjectId;
  approved_by_id: mongoose.Types.ObjectId;
  sent_at: Date;
  viewed_at: Date;
  createdBy: mongoose.Types.ObjectId;
}

const QuoteSchema = new Schema<IQuote>({
  tenantId: { type: String, required: true },
  quote_number: { type: String, required: true, unique: true },
  opportunity_id: { type: Schema.Types.ObjectId, ref: "Opportunity" },
  account_id: { type: Schema.Types.ObjectId, ref: "Account" },
  owner_id: { type: Schema.Types.ObjectId, ref: "User" },
  status: { type: String, default: "Draft" },
  validity_date: { type: Date },
  version: { type: Number, default: 1 },
  parent_quote_id: { type: Schema.Types.ObjectId, ref: "Quote" },
  discount_total: { type: Number },
  tax_total: { type: Number },
  grand_total: { type: Number },
  terms_and_conditions: { type: String },
  template_id: { type: Schema.Types.ObjectId },
  approved_by_id: { type: Schema.Types.ObjectId, ref: "User" },
  sent_at: { type: Date },
  viewed_at: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export default (mongoose.models.Quote as Model<IQuote>) || mongoose.model<IQuote>("Quote", QuoteSchema);
