import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDepartment extends Document {
  tenantId: string;
  name: string;
  code: string;
  description?: string;
  headOfDepartment?: mongoose.Types.ObjectId;
  parentDepartmentId?: mongoose.Types.ObjectId;
  costCenter?: string;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<IDepartment>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    headOfDepartment: { type: Schema.Types.ObjectId, ref: "Employee" },
    parentDepartmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    costCenter: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

DepartmentSchema.index({ tenantId: 1, code: 1 }, { unique: true });
DepartmentSchema.index({ tenantId: 1, name: 1 });

const Department: Model<IDepartment> =
  (mongoose.models.Department as Model<IDepartment>) ||
  mongoose.model<IDepartment>("Department", DepartmentSchema);

export default Department;
