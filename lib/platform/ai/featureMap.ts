import { AI_USAGE_FEATURE_BUCKET, AiUsageFeatureBucket } from "@/lib/constants/statuses";
import { AiFeature } from "@/lib/ai/featureLimits";

/**
 * Maps every real lib/ai/featureLimits.ts::AiFeature key to one of source
 * doc §14's 5 usage buckets. Documented in docs/admin/AI_FEATURE_MAP.md per
 * the brief's own instruction — "record the mapping because the breakdown
 * is meaningless if the buckets are guessed." Checked by
 * tests/platform/aiFeatureMap.test.ts's source-grep test: every AiFeature
 * key must appear here, so a newly-added feature can't silently fall
 * through unmapped.
 */
export const AI_FEATURE_TO_BUCKET: Record<AiFeature, AiUsageFeatureBucket> = {
  chat: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT,
  rag: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT,
  intent: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT,
  draft: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT,
  summary: AI_USAGE_FEATURE_BUCKET.AI_REPORTS,
  suggestion: AI_USAGE_FEATURE_BUCKET.AI_REPORTS,
  anomaly: AI_USAGE_FEATURE_BUCKET.AI_REPORTS,
};

const ALL_BUCKETS: Set<string> = new Set(Object.values(AI_USAGE_FEATURE_BUCKET));

/**
 * A call site may pass either a legacy `AiFeature` key (looked up in the
 * table above) or, additively, one of the 5 bucket names directly — the
 * latter for a real feature this table's 7 keys structurally cannot express
 * (source doc §14, Phase 9 Group B: `lib/docIntel/` calls the chokepoint
 * with `feature: "document_processing"` directly, since none of the 7
 * `AiFeature` keys — all chat/RAG/report-generation shaped — has any
 * business mapping to "a document was extracted"). Anything recognized as
 * neither falls through to AI_ASSISTANT, same safe default as before.
 */
export function mapFeatureToBucket(feature: AiFeature | string): AiUsageFeatureBucket {
  if (ALL_BUCKETS.has(feature)) return feature as AiUsageFeatureBucket;
  return (AI_FEATURE_TO_BUCKET as Record<string, AiUsageFeatureBucket>)[feature] ?? AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT;
}
