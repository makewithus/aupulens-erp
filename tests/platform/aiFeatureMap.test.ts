import { describe, expect, it } from "vitest";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";
import { AI_FEATURE_TO_BUCKET, mapFeatureToBucket } from "@/lib/platform/ai/featureMap";
import { AI_USAGE_FEATURE_BUCKET_VALUES } from "@/lib/constants/statuses";

describe("AI_FEATURE_TO_BUCKET — every real AiFeature key must be mapped (docs/admin/AI_FEATURE_MAP.md)", () => {
  it("has an entry for every key in lib/ai/featureLimits.ts::AI_MAX_TOKENS", () => {
    const realFeatureKeys = Object.keys(AI_MAX_TOKENS);
    const mappedKeys = Object.keys(AI_FEATURE_TO_BUCKET);
    for (const key of realFeatureKeys) {
      expect(mappedKeys).toContain(key);
    }
  });

  it("every mapped value is a real bucket", () => {
    for (const bucket of Object.values(AI_FEATURE_TO_BUCKET)) {
      expect(AI_USAGE_FEATURE_BUCKET_VALUES).toContain(bucket);
    }
  });

  it("mapFeatureToBucket falls back to AI_ASSISTANT for an unrecognized key, never throws", () => {
    expect(mapFeatureToBucket("some-future-feature-not-yet-mapped")).toBe("ai_assistant");
  });
});
