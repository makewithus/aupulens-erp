import crypto from "crypto";
import connectDB from "@/lib/db";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import AiCostRate from "@/models/platform/AiCostRate";
import { AI_USAGE_REQUEST_STATUS, AI_PROVIDER, AiUsageFeatureBucket } from "@/lib/constants/statuses";
import type { ProviderCall } from "@/lib/ai/language/types";
import { mapFeatureToBucket } from "./featureMap";

export interface RecordAiUsageInput {
  tenantId: string;
  feature: string; // an AiFeature key, or any string for a not-yet-typed call site
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: "success" | "error";
}

/**
 * Cost is computed HERE, server-side, from stored AiCostRate documents —
 * never sent from a client, never hardcoded per call site (source doc §33 /
 * Hard Rule 9's cost-integrity requirement). No rate row for the model
 * means cost is reported as 0, not guessed from another model's rate.
 */
async function computeCostUsd(model: string, inputTokens: number, outputTokens: number): Promise<number> {
  const rate = await AiCostRate.findOne({ modelName: model }).lean();
  if (!rate) return 0;
  return (
    (inputTokens / 1_000_000) * rate.inputCostPerMillionTokens +
    (outputTokens / 1_000_000) * rate.outputCostPerMillionTokens
  );
}

/**
 * The single instrumentation point, called from lib/ai/tenantAi.ts right
 * after (or in place of, on failure) the pre-existing incrementAiUsage()
 * call. Additive, must never throw back into the AI call it's observing —
 * same defensive shape as lib/platform/audit/emit.ts.
 */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<void> {
  try {
    await connectDB();
    const estimatedCostUsd =
      input.status === "success"
        ? await computeCostUsd(input.model, input.inputTokens, input.outputTokens)
        : 0;

    await AiUsageRecord.create({
      tenantId: input.tenantId,
      feature: mapFeatureToBucket(input.feature) as AiUsageFeatureBucket,
      modelName: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostUsd,
      latencyMs: input.latencyMs,
      status: input.status === "success" ? AI_USAGE_REQUEST_STATUS.SUCCESS : AI_USAGE_REQUEST_STATUS.ERROR,
      requestId: crypto.randomUUID(),
    });
  } catch (err) {
    console.error("[ai-usage] failed to record AiUsageRecord", {
      tenantId: input.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Sarvam is a second provider (Part 7). Cost comes from the AiCostRate row whose modelName is
 * `sarvam-<callType>` (e.g. sarvam-translate), priced per 1,000 characters — never hardcoded.
 * No rate row => cost 0, exactly like a missing model rate above. Same never-throw contract.
 */
export async function recordSarvamUsage(input: { tenantId: string; feature: string; call: ProviderCall }): Promise<void> {
  try {
    await connectDB();
    const modelName = `sarvam-${input.call.type}`;
    let cost = 0;
    if (input.call.ok) {
      const rate = await AiCostRate.findOne({ modelName, provider: AI_PROVIDER.SARVAM }).lean();
      if (rate?.costPerThousandCharacters) cost = (input.call.characters / 1000) * rate.costPerThousandCharacters;
    }
    await AiUsageRecord.create({
      tenantId: input.tenantId,
      feature: mapFeatureToBucket(input.feature) as AiUsageFeatureBucket,
      modelName,
      provider: AI_PROVIDER.SARVAM,
      callType: input.call.type,
      characters: input.call.characters,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: cost,
      latencyMs: input.call.latencyMs,
      status: input.call.ok ? AI_USAGE_REQUEST_STATUS.SUCCESS : AI_USAGE_REQUEST_STATUS.ERROR,
      requestId: crypto.randomUUID(),
    });
  } catch (err) {
    console.error("[ai-usage] failed to record Sarvam usage", {
      tenantId: input.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
