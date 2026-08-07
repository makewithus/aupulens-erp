import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Marketplace (6.12) — shareable configuration packages.
 *
 * A tenant can PUBLISH a reusable config (an automation workflow, an approval
 * policy, or a print-format preset) built with the Visual Builder / approval /
 * print-format tools, and any tenant can BROWSE and INSTALL it into their own
 * workspace (installing creates fresh, tenant-owned records — see
 * lib/marketplace/install.ts). The `payload` is SANITIZED config only — no
 * tenant/user ids — so nothing cross-tenant leaks when a package is shared.
 */
export type MarketplaceCategory = "workflow" | "approval-policy" | "print-format";

export interface IMarketplacePackage extends Document {
  publisherTenantId: string;
  publisherName: string;
  name: string;
  description?: string;
  category: MarketplaceCategory;
  payload: Record<string, unknown>;
  installCount: number;
  published: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MarketplacePackageSchema = new Schema<IMarketplacePackage>(
  {
    publisherTenantId: { type: String, required: true, index: true },
    publisherName: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    category: { type: String, enum: ["workflow", "approval-policy", "print-format"], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    installCount: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

MarketplacePackageSchema.index({ published: 1, category: 1, installCount: -1 });

export default (mongoose.models.MarketplacePackage as Model<IMarketplacePackage>) ||
  mongoose.model<IMarketplacePackage>("MarketplacePackage", MarketplacePackageSchema);
