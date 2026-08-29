import { Schema } from "mongoose";
import "@/models/finance/Account";
import "@/models/sales/Customer";

// Standardizes every debit/credit move across the ERP
export const JournalLineSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  partnerId: { type: Schema.Types.ObjectId, ref: "Customer" }, // Optional: for tracking debt
  label: String, // e.g., "Payment for SO001"
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  maturityDate: { type: Date }, // Due date for receivable/payable aging
  sourceDocument: { type: String },
  sourceId: { type: Schema.Types.ObjectId },
  taxId: { type: Schema.Types.ObjectId, ref: "Tax" }, // Assuming a Tax model exists or will exist
  reconciled: { type: Boolean, default: false }, // Used for Bank Reconciliation
});

// Standardizes how we store totals
export const MonetarySummarySchema = new Schema(
  {
    currencyId: { type: String, default: "INR" },
    amountUntaxed: { type: Number, default: 0 },
    amountTax: { type: Number, default: 0 },
    amountTotal: { type: Number, default: 0 },
  },
  { _id: false },
);
