import mongoose, { Schema, Document, Model } from "mongoose";

export interface IQuoteLineItem {
  item_name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_total?: number;
}

export interface IQuote extends Document {
  tenantId: string;
  quote_number: string;
  opportunity_id: mongoose.Types.ObjectId;
  account_id: mongoose.Types.ObjectId;
  owner_id: mongoose.Types.ObjectId;
  status: string;
  validity_date: Date;
  version: number;
  parent_quote_id?: mongoose.Types.ObjectId;
  line_items: IQuoteLineItem[];
  discount_total: number;
  tax_total: number;
  grand_total: number;
  terms_and_conditions?: string;
  template_id?: mongoose.Types.ObjectId;
  approved_by_id?: mongoose.Types.ObjectId;
  sent_at?: Date;
  viewed_at?: Date;
  campaign_id?: mongoose.Types.ObjectId;
  source?: string;
  createdBy: mongoose.Types.ObjectId;
}

const QuoteSchema = new Schema<IQuote>({
  tenantId: { type: String, required: true },
  quote_number: { type: String, required: true, unique: true },
  opportunity_id: { type: Schema.Types.ObjectId, ref: 'CrmOpportunity', required: true },
  account_id: { type: Schema.Types.ObjectId, ref: 'CrmAccount', required: true },
  owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { 
    type: String, 
    enum: ['Draft','Pending Approval','Approved','Sent','Viewed','Revised','Accepted','Rejected','Expired'], 
    default: 'Draft' 
  },
  validity_date: { type: Date, required: true },
  version: { type: Number, default: 1 },
  parent_quote_id: { type: Schema.Types.ObjectId, ref: 'CrmQuote' },
  line_items: [{
    item_name: { type: String, required: true },
    description: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true, min: 0 },
    discount_percent: { type: Number, default: 0, min: 0, max: 100 },
    tax_percent: { type: Number, default: 0, min: 0 },
    line_total: { type: Number }
  }],
  discount_total: { type: Number, default: 0 },
  tax_total: { type: Number, default: 0 },
  grand_total: { type: Number, default: 0 },
  terms_and_conditions: { type: String },
  template_id: { type: Schema.Types.ObjectId },
  approved_by_id: { type: Schema.Types.ObjectId, ref: 'User' },
  sent_at: { type: Date },
  viewed_at: { type: Date },
  campaign_id: { type: Schema.Types.ObjectId, ref: 'CrmCampaign' },
  source: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

QuoteSchema.index({ tenantId: 1 });

QuoteSchema.pre("save", function(next) {
  let discountTotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;

  if (this.line_items && this.line_items.length > 0) {
    this.line_items.forEach(item => {
      const lineBase = item.quantity * item.unit_price;
      const discountAmt = lineBase * (item.discount_percent / 100);
      const afterDiscount = lineBase - discountAmt;
      const taxAmt = afterDiscount * (item.tax_percent / 100);
      const lineTotal = afterDiscount + taxAmt;
      
      item.line_total = lineTotal;
      
      discountTotal += discountAmt;
      taxTotal += taxAmt;
      grandTotal += lineTotal;
    });
  }

  this.discount_total = discountTotal;
  this.tax_total = taxTotal;
  this.grand_total = grandTotal;

  next();
});

export default (mongoose.models.CrmQuote as Model<IQuote>) || mongoose.model<IQuote>("CrmQuote", QuoteSchema);
