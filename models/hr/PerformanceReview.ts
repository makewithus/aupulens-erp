import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPerformanceReview extends Document {
  tenantId: string;
  employeeId: mongoose.Types.ObjectId;
  employeeName: string;
  reviewPeriod: string;
  rating: number;
  goals: string;
  achievements: string;
  areasOfImprovement: string;
  managerComments: string;
  reviewedBy?: mongoose.Types.ObjectId;
}

const PerformanceReviewSchema = new Schema<IPerformanceReview>(
  {
    tenantId: { type: String, required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    employeeName: { type: String, required: true },
    reviewPeriod: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, default: 3 },
    goals: { type: String, default: "" },
    achievements: { type: String, default: "" },
    areasOfImprovement: { type: String, default: "" },
    managerComments: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// One review per employee per period — re-saving the same period updates it
// (matches the page's "Add Review" / "Update Review" toggle behaviour).
PerformanceReviewSchema.index({ tenantId: 1, employeeId: 1, reviewPeriod: 1 }, { unique: true });

export default (mongoose.models.PerformanceReview as Model<IPerformanceReview>) ||
  mongoose.model<IPerformanceReview>("PerformanceReview", PerformanceReviewSchema);
