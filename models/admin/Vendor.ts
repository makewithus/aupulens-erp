import mongoose, { Model } from "mongoose";

export interface IVendor extends mongoose.Document {
  name: string;
  tenantId: string;
  category: string;
  contactEmail?: string;
  phone?: string;
  performanceMetrics?: {
    deliveryTime: number;
    qualityScore: number;
    costRating: number;
  };
  aiAnalysis?: {
    lastUpdated?: Date;
    summary?: string;
    rating?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const VendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide a vendor name"],
  },
  tenantId: {
    type: String,
    required: true,
    index: true,
  },
  category: {
    type: String,
    required: [true, "Please provide a category"],
  },
  contactEmail: {
    type: String,
  },
  phone: {
    type: String,
  },
  performanceMetrics: {
    deliveryTime: { type: Number, default: 0 }, // Average days
    qualityScore: { type: Number, default: 0 }, // 1-10
    costRating: { type: Number, default: 0 }, // 1-10 (10 is cheapest)
  },
  aiAnalysis: {
    lastUpdated: Date,
    summary: String,
    rating: String, // 'Excellent', 'Good', 'Fair', 'Poor'
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

VendorSchema.index({ tenantId: 1, createdAt: -1 });
VendorSchema.index({ tenantId: 1, category: 1 });

const Vendor: Model<IVendor> =
  (mongoose.models.Vendor as Model<IVendor>) ||
  mongoose.model<IVendor>("Vendor", VendorSchema);

export default Vendor;
