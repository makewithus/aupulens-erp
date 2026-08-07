/** Budget guardrail inspection (Go-Live Step A.4). npx tsx scripts/check-ai-budget.ts */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { getTierLimits } = await import("../lib/constants/tiers");
  const Organization = (await import("../models/Organization")).default;

  const orgs = await Organization.find({}, { name: 1, subdomain: 1, tier: 1, "settings.ai": 1 }).lean();
  console.log(`Found ${orgs.length} organizations:\n`);
  let flagged = 0;
  for (const o of orgs as any[]) {
    const tier = o.tier ?? "starter";
    const cap = getTierLimits(tier).aiCallsPerMonth;
    const maxTokens = o.settings?.ai?.maxTokensPerCall ?? 1024;
    const disabled = o.settings?.ai?.disabled ?? false;
    const risky = maxTokens > 4096; // conservative trial ceiling
    if (risky) flagged++;
    console.log(
      `- ${o.subdomain} (${tier}): monthlyCap=${cap} maxTokensPerCall=${maxTokens} aiDisabled=${disabled}${risky ? "  <-- HIGH maxTokensPerCall" : ""}`
    );
  }
  console.log(`\nMonthly caps are tier-derived (never unset). Flagged high-token tenants: ${flagged}`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
