import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A per-tenant, human-configurable account-role mapping (docs/ai/BRIEF-08b-FINAL.md 0.2).
 *
 * Before this model existed, two real reconciliation/reporting paths resolved an account ROLE
 * (e.g. "which account is inventory", "which accounts are suspense/clearing") via a heuristic —
 * a hard-coded Chart-of-Accounts code (`lib/accounting/inventory.ts`'s `preferredAccountCodes`)
 * or a name regex (`/suspense|clearing/i` in AI-22's `suspense_clearing` definition). Both are
 * **latent false-completion paths**: a tenant whose Chart of Accounts doesn't follow that exact
 * code/naming convention gets silently wrong (or missing) results with no way to correct them
 * short of renaming their own accounts to match the heuristic.
 *
 * This model lets a human (or a future governed-promotion flow, never automatically) state the
 * mapping explicitly per tenant. `lib/aiRuntime/accountMapping/resolve.ts::resolveMappedAccounts()`
 * is the ONE place that reads this — checked FIRST, falling back to the existing heuristic only
 * when nothing is configured for that `{tenantId, role}`. The heuristic itself is untouched
 * (still there, still correct on its own terms) — this only adds an override in front of it.
 */

export type AiAccountMappingSource = "configured" | "heuristic_fallback";

export interface IAiAccountMapping extends Document {
  tenantId: string;
  role: string; // e.g. "inventory", "inventory_grni", "inventory_cogs", "suspense_clearing"
  accountIds: mongoose.Types.ObjectId[];
  source: AiAccountMappingSource;
  basis: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiAccountMappingSchema: Schema<IAiAccountMapping> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    role: { type: String, required: true },
    accountIds: { type: [Schema.Types.ObjectId], ref: "Account", default: [] },
    source: { type: String, enum: ["configured", "heuristic_fallback"], required: true },
    basis: { type: String, required: true },
  },
  { timestamps: true },
);

AiAccountMappingSchema.index({ tenantId: 1, role: 1 }, { unique: true });

const AiAccountMapping: Model<IAiAccountMapping> =
  (mongoose.models.AiAccountMapping as Model<IAiAccountMapping>) || mongoose.model<IAiAccountMapping>("AiAccountMapping", AiAccountMappingSchema);

export default AiAccountMapping;
