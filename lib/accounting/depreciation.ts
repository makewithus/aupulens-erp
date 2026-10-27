import type { IAsset } from "@/models/finance/Asset";

/**
 * Straight-line monthly depreciation — extracted from
 * app/api/finance/assets/compute/route.ts's inline calculation (docs/ai/BRIEF-03-BATCH-B.md
 * B.3: "wraps the existing compute endpoint's logic — wrap, don't reimplement"). That route now
 * calls this function too, so both paths are guaranteed to agree — this is a pure refactor, the
 * route's own behaviour/response is unchanged (same input, same output).
 */
export function computeMonthlyDepreciation(asset: Pick<IAsset, "originalValue" | "salvageValue" | "durationYears"> & { method?: "linear" | "degressive" }): number {
  if (asset.method === "degressive") {
    const n = asset.durationYears || 1;
    const s = asset.salvageValue > 0 ? asset.salvageValue : 1;
    const rate = asset.salvageValue > 0 && asset.salvageValue < asset.originalValue
      ? Math.min(0.9, Math.max(0.01, 1 - Math.pow(s / asset.originalValue, 1 / n)))
      : Math.min(0.9, 2 / n);
    const firstYearAnnual = asset.originalValue * rate;
    return firstYearAnnual / 12;
  }
  const annualDepreciation = (asset.originalValue - (asset.salvageValue || 0)) / (asset.durationYears || 1);
  return annualDepreciation / 12;
}
