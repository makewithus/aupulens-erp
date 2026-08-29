/**
 * One-off migration, run once before wiring module-tier gating into
 * middleware.ts (QA_GAP_REPORT.md item #8 / Phase 2 SaaS Hardening Step 5).
 *
 * TIER_LIMITS.starter.enabledModules is only ["admin", "hr", "inventory"] —
 * every Organization in this database was created before module gating was
 * ever enforced, so every one of them is on tier="starter" (or has no tier
 * field at all, which resolves to starter via getTierLimits' fallback) while
 * in practice using Finance/Sales/CRM/Manufacturing every day. Enforcing the
 * gate without this migration would immediately 403 every existing tenant
 * out of those modules — a severe regression, not a new restriction.
 *
 * This grandfathers every EXISTING org to tier="enterprise" (the tier whose
 * enabledModules list is the superset of every module the middleware gates),
 * preserving their current de facto full access. It does NOT touch
 * org.settings.enabledModules (the separate, org-level opt-in narrowing —
 * left empty/as-is, which module-gate.ts treats as "no restriction" anyway).
 *
 * From this point forward, only orgs created via the self-service signup
 * flow (`POST /api/auth/org/create`, which defaults new orgs to starter) get
 * real tier enforcement — this migration is a one-time grandfather clause,
 * not a permanent policy.
 *
 * Safe to run multiple times (only touches orgs not already on a tier that
 * grants full access).
 *
 * Usage: npx tsx scripts/migrate-grandfather-tenant-tiers.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import Organization from "../models/admin/Organization";
import { ORGANIZATION_TIER } from "../lib/constants/statuses";

async function main() {
  await connectDB();

  const toGrandfather = await Organization.find({
    tier: { $ne: ORGANIZATION_TIER.ENTERPRISE },
  }).lean();

  if (toGrandfather.length === 0) {
    console.log("No organizations need grandfathering. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Grandfathering ${toGrandfather.length} existing organization(s) to tier="enterprise":`);
  for (const org of toGrandfather) {
    console.log(`  ${org.subdomain} (was tier="${(org as any).tier ?? "unset"}")`);
  }

  const res = await Organization.updateMany(
    { tier: { $ne: ORGANIZATION_TIER.ENTERPRISE } },
    { $set: { tier: ORGANIZATION_TIER.ENTERPRISE } },
  );

  console.log(`Updated ${res.modifiedCount} organization(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
