/**
 * One-off: gauge how many tenants are *identifiably active* so the
 * AI_GLOBAL_MONTHLY_CAP number is grounded in real data, not a guess.
 * "Active" heuristic: has any AI usage recorded, OR has CRM leads/opportunities,
 * OR has finance invoices. Prints tier distribution + active count.
 *
 * Run: npx tsx scripts/check-active-tenants.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;

  const Organization = (await import("../models/Organization")).default;
  const orgs = await Organization.find({}, { subdomain: 1, tier: 1, name: 1 }).lean<
    { subdomain: string; tier?: string; name?: string }[]
  >();

  const tierCounts: Record<string, number> = {};
  for (const o of orgs) tierCounts[o.tier ?? "starter"] = (tierCounts[o.tier ?? "starter"] ?? 0) + 1;

  // Collections that indicate real activity, checked by tenantId.
  const activityCols = ["leads", "opportunities", "invoices", "aiusages", "chathistories"];
  const active = new Set<string>();
  for (const o of orgs) {
    for (const col of activityCols) {
      try {
        const n = await db.collection(col).countDocuments({ tenantId: o.subdomain }, { limit: 1 });
        if (n > 0) { active.add(o.subdomain); break; }
      } catch { /* collection may not exist */ }
    }
  }

  console.log(`Total orgs: ${orgs.length}`);
  console.log(`Tier distribution:`, tierCounts);
  console.log(`Identifiably ACTIVE tenants (have leads/opps/invoices/ai-usage/chat): ${active.size}`);
  console.log(`Active subdomains:`, [...active].join(", ") || "(none)");

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
