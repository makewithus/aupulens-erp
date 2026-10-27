import connectDB from "@/lib/db";
import AiCostRate from "@/models/platform/AiCostRate";

const TYPES = ["translate", "transliterate", "detect"] as const;

/** Unset or blank means "not configured" — never 0 (Number("") === 0 would silently seed a free rate). */
const readPrice = (env: NodeJS.ProcessEnv, name: string): number => {
  const raw = env[name];
  return raw === undefined || raw.trim() === "" ? NaN : Number(raw);
};

/** Exported so tests and CLI can run it in-process. Returns the rows it upserted. */
export async function seedSarvamCostRates(env: NodeJS.ProcessEnv = process.env): Promise<{ modelName: string; rate: number }[]> {
  const base = readPrice(env, "SARVAM_COST_PER_1K_CHARS_USD");
  await connectDB();
  const seeded: { modelName: string; rate: number }[] = [];
  for (const t of TYPES) {
    const override = readPrice(env, `SARVAM_COST_PER_1K_CHARS_USD_${t.toUpperCase()}`);
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
    seeded.push({ modelName: `sarvam-${t}`, rate });
  }
  return seeded;
}
