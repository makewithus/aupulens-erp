import AiUsageRecord from "@/models/platform/AiUsageRecord";
import { AI_PROVIDER, AI_PROVIDER_VALUES, type AiProvider } from "@/lib/constants/statuses";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  [AI_PROVIDER.AZURE_OPENAI]: "Azure OpenAI",
  [AI_PROVIDER.SARVAM]: "Sarvam (translation)",
};

export interface ProviderRow {
  provider: AiProvider;
  label: string;
  requestCount: number;
  /** Sarvam is billed per character; Azure per token. Both columns are shown, the irrelevant one is 0. */
  characters: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  failedRequests: number;
}

/**
 * Per-provider split of AiUsageRecord since `since`. Historical rows have no `provider` and are
 * Azure OpenAI by definition ($ifNull). Every provider is listed even at zero. `combinedCostUsd`
 * is the figure a tenant's spend limit applies against (lib/platform/ai/spend.ts).
 */
export async function getProviderBreakdown(since: Date, tenantId?: string) {
  const rows = await AiUsageRecord.aggregate([
    { $match: { createdAt: { $gte: since }, ...(tenantId ? { tenantId } : {}) } },
    {
      $group: {
        _id: { $ifNull: ["$provider", AI_PROVIDER.AZURE_OPENAI] },
        requestCount: { $sum: 1 },
        characters: { $sum: { $ifNull: ["$characters", 0] } },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        estimatedCostUsd: { $sum: "$estimatedCostUsd" },
        failedRequests: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
      },
    },
  ]);
  const byProvider = new Map(rows.map((r) => [r._id as string, r]));
  const out: ProviderRow[] = AI_PROVIDER_VALUES.map((p) => {
    const r = byProvider.get(p);
    return {
      provider: p,
      label: AI_PROVIDER_LABELS[p],
      requestCount: r?.requestCount ?? 0,
      characters: r?.characters ?? 0,
      inputTokens: r?.inputTokens ?? 0,
      outputTokens: r?.outputTokens ?? 0,
      estimatedCostUsd: r?.estimatedCostUsd ?? 0,
      failedRequests: r?.failedRequests ?? 0,
    };
  });
  return {
    rows: out,
    combinedRequests: out.reduce((s, r) => s + r.requestCount, 0),
    combinedCostUsd: out.reduce((s, r) => s + r.estimatedCostUsd, 0),
  };
}
