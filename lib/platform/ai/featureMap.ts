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

export function mapFeatureToBucket(feature: AiFeature | string): AiUsageFeatureBucket {
  return (AI_FEATURE_TO_BUCKET as Record<string, AiUsageFeatureBucket>)[feature] ?? AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT;
}
