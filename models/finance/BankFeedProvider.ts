import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Global (non-tenant-scoped) catalog of bank-feed providers — the same
 * directory every tenant sees when connecting a bank/card account, mirroring
 * a platform reference table rather than tenant data. Seeded once via
 * lib/accounting/bankFeedProviderSeeder.ts.
 */
export interface IBankFeedProvider extends Document {
  name: string;
  type: "partner_direct" | "aggregator";
  supportsCreditCard: boolean;
  country: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const BankFeedProviderSchema: Schema<IBankFeedProvider> = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ["partner_direct", "aggregator"], required: true },
    supportsCreditCard: { type: Boolean, default: false },
    country: { type: String, default: "IN" },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const BankFeedProvider: Model<IBankFeedProvider> =
  (mongoose.models.BankFeedProvider as Model<IBankFeedProvider>) ||
  mongoose.model<IBankFeedProvider>("BankFeedProvider", BankFeedProviderSchema);

export default BankFeedProvider;
