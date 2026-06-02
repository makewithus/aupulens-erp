import mongoose, { Schema, Document, Model } from "mongoose";
import {
  PROJECT_STATUS,
  PROJECT_STATUS_VALUES,
  type ProjectStatus,
} from "@/lib/constants/statuses";

export interface IProject extends Document {
  tenantId: string; // NEW: Multi-tenant support
  name: string;
  description?: string;
  status: ProjectStatus;
  members: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>({
  tenantId: { type: String, required: true, index: true }, // NEW: Multi-tenant support
  name: {
    type: String,
    required: [true, "Please provide a project name"],
    maxlength: [60, "Name cannot be more than 60 characters"],
  },
  description: {
    type: String,
    maxlength: [200, "Description cannot be more than 200 characters"],
  },
  status: {
    type: String,
    enum: PROJECT_STATUS_VALUES,
    default: PROJECT_STATUS.ACTIVE,
  },
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ProjectSchema.index({ status: 1 });

const Project: Model<IProject> =
  (mongoose.models.Project as Model<IProject>) ||
  mongoose.model<IProject>("Project", ProjectSchema);

export default Project;
