/**
 * Idempotent upsert of AiCostRate for the platform's real Azure OpenAI
 * deployment (CLAUDE_DEFAULT_MODEL / AZURE_OPENAI_CHAT_DEPLOYMENT — see
 * lib/ai/claude.ts's naming note; despite the name it's GPT-4o). Rates are
 * per-million-tokens, matching GPT-4o's published pricing at time of
 * writing — an operator should update this row (via a future admin UI or
 * directly) if pricing changes; the application never hardcodes a rate.
 *
 * Usage: npx tsx scripts/seed-platform-ai-cost-rates.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import AiCostRate from "../models/platform/AiCostRate";

async function main() {
  const model = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-4o";
  await connectDB();
  await AiCostRate.findOneAndUpdate(
    { modelName: model },
    {
      $set: {
        modelName: model,
        inputCostPerMillionTokens: 2.5,
        outputCostPerMillionTokens: 10,
        effectiveFrom: new Date(),
      },
    },
    { upsert: true },
  );
  console.log(`Seeded AiCostRate for model "${model}"`);
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
