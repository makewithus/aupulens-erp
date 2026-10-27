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
import { seedSarvamCostRates } from "../lib/platform/ai/seedSarvamCostRates";

export { seedSarvamCostRates };

if (require.main === module) {
  seedSarvamCostRates()
    .then(() => mongoose.connection.close())
    .catch((err) => { console.error(err); process.exit(1); });
}
