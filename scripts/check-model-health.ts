/**
 * Deploy-time guardrail: LOUDLY flag any tenant whose settings.ai.model
 * override doesn't name a currently-deployed Azure chat deployment.
 *
 * Without this, such an override silently 400s ("DeploymentNotFound") on every
 * AI call for that tenant — a broken feature with no obvious cause. Run this in
 * CI / as a pre-deploy step: it exits NON-ZERO when any stale override exists,
 * so a bad config fails the deploy instead of shipping quietly.
 *
 * Run: npx tsx scripts/check-model-health.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { checkTenantModelOverrides } = await import("../lib/ai/modelHealth");

  const report = await checkTenantModelOverrides();
  console.log(`Deployed Azure chat deployment(s): ${report.deployedChatModels.join(", ") || "(NONE — AZURE_OPENAI_CHAT_DEPLOYMENT unset!)"}`);
  console.log(`Tenants with a model override: ${report.overrides.length}`);

  if (!report.configured) {
    console.error("\n❌ AZURE_OPENAI_CHAT_DEPLOYMENT is not set — cannot validate overrides.");
    await mongoose.disconnect();
    process.exit(2);
  }

  if (report.stale.length === 0) {
    console.log("\n✅ No stale/invalid model overrides. All good.");
    await mongoose.disconnect();
    return;
  }

  console.error(`\n❌ ${report.stale.length} tenant(s) have a STALE/INVALID model override (every AI call for them will 400):`);
  for (const s of report.stale) {
    console.error(`   - ${s.subdomain}${s.name ? ` (${s.name})` : ""}: "${s.model}" — ${s.reason}`);
  }
  console.error(`\nFix: clear the override (npx tsx scripts/migrate-clear-stale-ai-model.ts) or set it to a deployed deployment name.`);

  await mongoose.disconnect();
  process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
