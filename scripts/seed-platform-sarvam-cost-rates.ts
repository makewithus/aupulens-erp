/**
 * Idempotent upsert of AiCostRate rows for Sarvam (provider "sarvam"), one per call type
 * (sarvam-translate, sarvam-transliterate, sarvam-detect). Price per 1,000 characters comes from
 * the environment — NEVER hardcoded here. Take the figure from your Sarvam dashboard/pricing page.
 *
 * Usage: SARVAM_COST_PER_1K_CHARS_USD=0.0025 npx tsx scripts/seed-platform-sarvam-cost-rates.ts
 * Optional per-type overrides: SARVAM_COST_PER_1K_CHARS_USD_TRANSLATE / _TRANSLITERATE / _DETECT
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import AiCostRate from "../models/platform/AiCostRate";

const TYPES = ["translate", "transliterate", "detect"] as const;

/** Unset or blank means "not configured" — never 0 (Number("") === 0 would silently seed a free rate). */
const readPrice = (name: string): number => {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? NaN : Number(raw);
};

async function main() {
  const base = readPrice("SARVAM_COST_PER_1K_CHARS_USD");
  await connectDB();
  for (const t of TYPES) {
    const override = readPrice(`SARVAM_COST_PER_1K_CHARS_USD_${t.toUpperCase()}`);
    const rate = Number.isFinite(override) && override >= 0 ? override : base;
    if (!Number.isFinite(rate) || rate < 0) {
      console.error(`Skipping sarvam-${t}: set SARVAM_COST_PER_1K_CHARS_USD (USD per 1,000 characters).`);
      continue;
    }
    await AiCostRate.findOneAndUpdate(
      { modelName: `sarvam-${t}` },
      { $set: { modelName: `sarvam-${t}`, provider: "sarvam", inputCostPerMillionTokens: 0, outputCostPerMillionTokens: 0, costPerThousandCharacters: rate, effectiveFrom: new Date() } },
      { upsert: true },
    );
    console.log(`Seeded AiCostRate sarvam-${t} = $${rate} / 1k chars`);
  }
  await mongoose.connection.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
