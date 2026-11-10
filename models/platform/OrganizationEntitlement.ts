import mongoose, { Schema, Document, Model } from "mongoose";
import { PLAN_KEY_VALUES, PlanKeyType } from "@/lib/constants/statuses";
import { IPlanFeatures } from "./Plan";

/**
 * A per-tenant plan assignment plus optional feature overrides (source doc
 * §11's "override layer on top of a base plan, not a copy of one"). This is
 * NOT a cache of the resolved entitlement (that would need invalidation
 * plumbing this phase doesn't need yet, and Part 2.4's caching is done
 * in-process in the resolver instead) — it is the source-of-truth
 * assignment record itself. One document per tenant.
 */
export interface IOrganizationEntitlement extends Document {
  tenantId: string;
  planKey: PlanKeyType;
  overrides?: Partial<IPlanFeatures>;
  assignedAt: Date;
  effectiveFrom: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationEntitlementSchema = new Schema<IOrganizationEntitlement>(
  {
    tenantId: { type: String, required: true, unique: true, immutable: true },
    planKey: { type: String, required: true, enum: PLAN_KEY_VALUES },
    overrides: { type: Schema.Types.Mixed },
    assignedAt: { type: Date, required: true, default: Date.now },
    effectiveFrom: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

// G4: a plan assignment / override change alters effective access for the tenant, so it bumps the
// owning Organization's entitlementVersion (the entitlement row lives in a separate collection).
async function bumpFor(tenantId: unknown) {
  const Organization = (await import("@/models/admin/Organization")).default;
  const filter = typeof tenantId === "string" ? { subdomain: tenantId } : {};
  await Organization.updateMany(filter, { $inc: { entitlementVersion: 1 } });
}
OrganizationEntitlementSchema.post("save", async function (doc) { await bumpFor(doc.tenantId); });
OrganizationEntitlementSchema.post(
  ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndDelete", "deleteOne", "deleteMany"] as any,
  async function (this: any) { await bumpFor(this.getFilter?.()?.tenantId); },
);

export default (mongoose.models.OrganizationEntitlement as Model<IOrganizationEntitlement>) ||
  mongoose.model<IOrganizationEntitlement>("OrganizationEntitlement", OrganizationEntitlementSchema);
