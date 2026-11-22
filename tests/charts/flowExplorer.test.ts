import { describe, expect, it } from "vitest";
import {
  DAY_MS, FLOW_MODULES, aggregate, clampView, generateFlowDataset, panView, zoomView, type ModuleKey,
} from "@/lib/charts/flowExplorer";

const all = new Set(FLOW_MODULES.map((m) => m.key)) as Set<ModuleKey>;
const ds = generateFlowDataset(new Date(2026, 10, 21), 400, 3);

describe("flowExplorer aggregation", () => {
  it("conserves totals across intervals and show-by modes", () => {
    const sum = (rows: { total: number }[]) => rows.reduce((a, r) => a + r.total, 0);
    const daily = aggregate(ds, "day", all, all, "source");
    expect(daily).toHaveLength(400);
    expect(sum(aggregate(ds, "month", all, all, "source"))).toBe(sum(daily));
    expect(sum(aggregate(ds, "week", all, all, "destination"))).toBe(sum(daily));
    // row total equals the sum of its stacked series
    const r = daily[123];
    expect(FLOW_MODULES.reduce((a, m) => a + (r[m.key] ?? 0), 0)).toBe(r.total);
  });

  it("filters by source module", () => {
    const only = aggregate(ds, "day", new Set<ModuleKey>(["sales"]), all, "source");
    expect(only.every((r) => r.finance === 0 && r.total === r.sales)).toBe(true);
  });
});

describe("flowExplorer view window", () => {
  const lo = 0, hi = 100 * DAY_MS, min = 7 * DAY_MS;
  it("zooms around the anchor and respects bounds + min span", () => {
    const v = zoomView({ from: 20 * DAY_MS, to: 60 * DAY_MS }, 0.5, 0.5, lo, hi, min);
    expect(v).toEqual({ from: 30 * DAY_MS, to: 50 * DAY_MS });
    expect(zoomView(v, 0.01, 0.5, lo, hi, min).to - zoomView(v, 0.01, 0.5, lo, hi, min).from).toBe(min);
    expect(zoomView(v, 100, 0.5, lo, hi, min)).toEqual({ from: lo, to: hi });
  });
  it("pans without leaving the data range", () => {
    expect(panView({ from: 10 * DAY_MS, to: 30 * DAY_MS }, -1, lo, hi, min)).toEqual({ from: 0, to: 20 * DAY_MS });
    expect(panView({ from: 70 * DAY_MS, to: 90 * DAY_MS }, 1, lo, hi, min)).toEqual({ from: 80 * DAY_MS, to: hi });
    expect(clampView({ from: -5, to: 2 }, lo, hi, min)).toEqual({ from: 0, to: min });
  });
});
