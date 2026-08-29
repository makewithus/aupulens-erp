import mongoose, { Schema, Document, Model } from "mongoose";
import {
  PROJECT_STATUS,
  PROJECT_STATUS_VALUES,
  type ProjectStatus,
} from "@/lib/constants/statuses";

export interface IProject extends Document {
  tenantId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: "Low" | "Medium" | "High";
  progress: number; // 0-100
  ownerId?: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  startDate?: Date;
  dueDate?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    tenantId: { type: String, required: true, index: true },
    name: {
      type: String,
      required: [true, "Please provide a project name"],
      maxlength: [120, "Name cannot be more than 120 characters"],
    },
    description: {
      type: String,
      maxlength: [2000, "Description cannot be more than 2000 characters"],
    },
    status: {
      type: String,
      enum: PROJECT_STATUS_VALUES,
      default: PROJECT_STATUS.PLANNING,
    },
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    startDate: { type: Date },
    dueDate: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ProjectSchema.index({ tenantId: 1, status: 1 });

const Project: Model<IProject> =
  (mongoose.models.Project as Model<IProject>) ||
  mongoose.model<IProject>("Project", ProjectSchema);

export default Project;
