import type { IAsset } from "@/models/finance/Asset";

/**
 * Straight-line monthly depreciation — extracted from
 * app/api/finance/assets/compute/route.ts's inline calculation (docs/ai/BRIEF-03-BATCH-B.md
 * B.3: "wraps the existing compute endpoint's logic — wrap, don't reimplement"). That route now
 * calls this function too, so both paths are guaranteed to agree — this is a pure refactor, the
 * route's own behaviour/response is unchanged (same input, same output).
 */
export function computeMonthlyDepreciation(asset: Pick<IAsset, "originalValue" | "salvageValue" | "durationYears">): number {
  const annualDepreciation = (asset.originalValue - asset.salvageValue) / asset.durationYears;
  return annualDepreciation / 12;
}
