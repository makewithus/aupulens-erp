import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Enterprise Organization Management — 8-level hierarchy (6.8).
 *
 * A single self-referential tree models the full hierarchy:
 *   Company → Region → Branch → Office → Warehouse → Department → Team → Employee
 * (one model with a `level` field rather than 8 near-identical models).
 *
 * ADDITIVE by design: this is an OVERLAY. It doesn't replace the existing
 * Department/Employee models — a node may LINK to an existing Department or
 * Employee (linkedDepartmentId / linkedEmployeeId), so current data and every
 * module query that uses those models keep working unchanged. A migration
 * script can seed nodes from existing Departments/Employees (opt-in).
 *
 * `path` is a materialized path (ordered ancestor ids) so a node's whole
 * subtree is one indexed query — the basis for consolidated cross-entity
 * reporting. `localization` is resolved with inheritance: a node's effective
 * currency/language/timezone/taxRegime is its own value, else the nearest
 * ancestor that sets it (see lib/org/hierarchy.ts).
 */
export const ORG_LEVELS = ["Company", "Region", "Branch", "Office", "Warehouse", "Department", "Team", "Employee"] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

export interface OrgLocalization {
  currency?: string;   // ISO 4217, e.g. "INR", "USD"
  language?: string;   // BCP-47, e.g. "en-IN"
  timezone?: string;   // IANA, e.g. "Asia/Kolkata"
  taxRegime?: string;  // e.g. "GST-IN", "VAT-UK"
}

export interface IOrgUnit extends Document {
  tenantId: string;
  name: string;
  code?: string;
  level: OrgLevel;
  parentId?: mongoose.Types.ObjectId | null;
  path: mongoose.Types.ObjectId[]; // ancestor ids, root-first (excludes self)
  localization: OrgLocalization;
  linkedDepartmentId?: mongoose.Types.ObjectId;
  linkedEmployeeId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OrgUnitSchema = new Schema<IOrgUnit>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    level: { type: String, enum: ORG_LEVELS, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: "OrgUnit", default: null },
    path: [{ type: Schema.Types.ObjectId, ref: "OrgUnit" }],
    localization: {
      currency: { type: String },
      language: { type: String },
      timezone: { type: String },
      taxRegime: { type: String },
    },
    linkedDepartmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    linkedEmployeeId: { type: Schema.Types.ObjectId, ref: "Employee" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

OrgUnitSchema.index({ tenantId: 1, parentId: 1 });
OrgUnitSchema.index({ tenantId: 1, path: 1 }); // subtree lookups
OrgUnitSchema.index({ tenantId: 1, level: 1 });

export default (mongoose.models.OrgUnit as Model<IOrgUnit>) ||
  mongoose.model<IOrgUnit>("OrgUnit", OrgUnitSchema);
