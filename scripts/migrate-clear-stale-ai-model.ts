/**
 * One-time migration: clear stale Anthropic model overrides.
 * Orgs created before the Azure OpenAI migration have
 * settings.ai.model = "claude-sonnet-4-6" persisted, which now 400s every
 * AI call (invalid Azure deployment name). Unset it so they fall back to the
 * real Azure chat deployment. Idempotent — safe to re-run.
 *
 * Run: npx tsx scripts/migrate-clear-stale-ai-model.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const Organization = (await import("../models/Organization")).default;

  const res = await Organization.updateMany(
    { "settings.ai.model": { $regex: /^claude/i } },
    { $unset: { "settings.ai.model": "" } }
  );
  console.log(`Cleared stale claude-* model override on ${res.modifiedCount} org(s).`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
