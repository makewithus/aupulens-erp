import mongoose, { Model } from "mongoose";
import {
  TASK_STATUS,
  TASK_STATUS_VALUES,
  type TaskStatus,
} from "@/lib/constants/statuses";

export interface ITask extends mongoose.Document {
  tenantId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: Date;
  assignee?: mongoose.Types.ObjectId;
  assignmentType: "user" | "department" | "all";
  assignedDepartment?: string;
  project?: mongoose.Types.ObjectId;
  aiGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  title: {
    type: String,
    required: [true, "Please provide a task title"],
  },
  description: {
    type: String,
  },
  status: {
    type: String,
    enum: TASK_STATUS_VALUES,
    default: TASK_STATUS.TODO,
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },
  dueDate: {
    type: Date,
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  assignmentType: {
    type: String,
    enum: ["user", "department", "all"],
    default: "user",
  },
  assignedDepartment: {
    type: String,
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
  },
  aiGenerated: {
    type: Boolean,
    default: false,
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

TaskSchema.index({ tenantId: 1, createdAt: -1 });
TaskSchema.index({ tenantId: 1, status: 1 });

const Task: Model<ITask> =
  (mongoose.models.Task as Model<ITask>) ||
  mongoose.model<ITask>("Task", TaskSchema);

export default Task;
