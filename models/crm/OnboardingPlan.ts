import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOnboardingPlan extends Document {
  tenantId: string;
  account_id: mongoose.Types.ObjectId;
  opportunity_id?: mongoose.Types.ObjectId;
  owner_id: mongoose.Types.ObjectId;
  status: "Pending" | "Kickoff Scheduled" | "In Progress" | "Training" | "Go Live" | "Completed" | "Blocked";
  progress: number;
  kickoff_date?: Date;
  go_live_date?: Date;
  completed_date?: Date;
  milestones: {
    title: string;
    status: "Pending" | "In Progress" | "Completed";
    dueDate: Date;
    completedAt?: Date;
  }[];
  createdBy: mongoose.Types.ObjectId;
}

const OnboardingPlanSchema = new Schema<IOnboardingPlan>(
  {
    tenantId: { type: String, required: true },
    account_id: { type: Schema.Types.ObjectId, ref: "CrmAccount", required: true },
    opportunity_id: { type: Schema.Types.ObjectId, ref: "CrmOpportunity" },
    owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["Pending", "Kickoff Scheduled", "In Progress", "Training", "Go Live", "Completed", "Blocked"],
      default: "Pending",
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    kickoff_date: { type: Date },
    go_live_date: { type: Date },
    completed_date: { type: Date },
    milestones: [
      {
        title: { type: String, required: true },
        status: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
        dueDate: { type: Date, required: true },
        completedAt: { type: Date },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

OnboardingPlanSchema.index({ tenantId: 1, status: 1 });
OnboardingPlanSchema.index({ tenantId: 1, account_id: 1 });

export default (mongoose.models.CrmOnboardingPlan as Model<IOnboardingPlan>) ||
  mongoose.model<IOnboardingPlan>("CrmOnboardingPlan", OnboardingPlanSchema);
