// Pure data + view-window logic for the AnalyticsExplorerChart (no React, so it is unit-testable).
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";

export const DAY_MS = 86_400_000;
export type Interval = "day" | "week" | "month";

export const FLOW_MODULES = [
  { key: "sales", name: "Sales", color: "#9CA3AF" },
  { key: "finance", name: "Finance", color: "#A77DFF" },
  { key: "purchase", name: "Purchase", color: "#6CADF5" },
  { key: "inventory", name: "Inventory", color: "#8AE06C" },
  { key: "hr", name: "HR & Payroll", color: "#F1DF38" },
  { key: "crm", name: "CRM", color: "#F56868" },
  { key: "manufacturing", name: "Manufacturing", color: "#F472B6" },
  { key: "projects", name: "Projects", color: "#5EEAD4" },
  { key: "gst", name: "GST / Tax", color: "#FDBA74" },
  { key: "other", name: "Others", color: "#818CF8" },
] as const;
export type ModuleKey = (typeof FLOW_MODULES)[number]["key"];
const N = FLOW_MODULES.length;

export interface FlowDataset {
  start: number; // ms of day 0 (local midnight)
  days: number;
  /** cells[day][src * N + dst] = transactions that day from src module to dst module */
  cells: Float64Array[];
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dummy data: quiet baseline with weekday rhythm plus a few bursty campaigns (year-end close, audits…). */
export function generateFlowDataset(end = new Date(), days = 3 * 365, seed = 7): FlowDataset {
  const r = rng(seed);
  const start = startOfDay(end).getTime() - (days - 1) * DAY_MS;
  // each source splits its volume across destinations with fixed random weights
  const split = FLOW_MODULES.map(() => {
    const w = FLOW_MODULES.map(() => r() ** 2);
    const s = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / s);
  });
  const base = FLOW_MODULES.map(() => 40 + r() * 260);
  const bursts = Array.from({ length: 22 }, () => ({
    at: Math.floor(r() * days), width: 1 + r() * 5, amp: 4000 + r() ** 3 * 110_000, src: Math.floor(r() * N),
  }));
  const cells: Float64Array[] = [];
  for (let d = 0; d < days; d++) {
    const dow = new Date(start + d * DAY_MS).getDay();
    const weekday = dow === 0 || dow === 6 ? 0.35 : 1;
    const row = new Float64Array(N * N);
    for (let s = 0; s < N; s++) {
      let v = base[s] * weekday * (0.6 + r() * 0.8);
      for (const b of bursts) {
        const z = (d - b.at) / b.width;
        if (Math.abs(z) < 3) v += Math.exp(-z * z) * b.amp * (b.src === s ? 1 : 0.05) * (0.5 + r());
      }
      for (let t = 0; t < N; t++) row[s * N + t] = Math.round(v * split[s][t]);
    }
    cells.push(row);
  }
  return { start, days, cells };
}

export function bucketStart(t: number, interval: Interval): number {
  const d = new Date(t);
  if (interval === "week") return startOfWeek(d).getTime();
  if (interval === "month") return startOfMonth(d).getTime();
  return startOfDay(d).getTime();
}

export type FlowRow = { t: number; total: number } & Partial<Record<ModuleKey, number>>;

/** Sum daily cells into interval buckets, keyed by source or destination module, filtered by src/dst sets. */
export function aggregate(
  ds: FlowDataset, interval: Interval, src: Set<ModuleKey>, dst: Set<ModuleKey>, showBy: "source" | "destination",
): FlowRow[] {
  const rows: FlowRow[] = [];
  let cur: FlowRow | null = null;
  for (let d = 0; d < ds.days; d++) {
    const t = bucketStart(ds.start + d * DAY_MS, interval);
    if (!cur || cur.t !== t) {
      cur = { t, total: 0 };
      for (const m of FLOW_MODULES) cur[m.key] = 0;
      rows.push(cur);
    }
    const row = ds.cells[d];
    for (let s = 0; s < N; s++) {
      if (!src.has(FLOW_MODULES[s].key)) continue;
      for (let k = 0; k < N; k++) {
        if (!dst.has(FLOW_MODULES[k].key)) continue;
        const v = row[s * N + k];
        const key = FLOW_MODULES[showBy === "source" ? s : k].key;
        cur[key] = (cur[key] ?? 0) + v;
        cur.total += v;
      }
    }
  }
  return rows;
}

export interface View { from: number; to: number }

export function minSpan(interval: Interval): number {
  return (interval === "month" ? 90 : interval === "week" ? 28 : 7) * DAY_MS;
}

/** Keep a view inside the data bounds without changing its span (unless the span itself is too big). */
export function clampView(v: View, lo: number, hi: number, min: number): View {
  const span = Math.min(Math.max(v.to - v.from, min), hi - lo);
  let from = Math.max(lo, Math.min(v.from, hi - span));
  return { from, to: from + span };
}

/** Zoom by factor (<1 in, >1 out) keeping the time under `anchor` (0..1 across the plot) fixed. */
export function zoomView(v: View, factor: number, anchor: number, lo: number, hi: number, min: number): View {
  const span = v.to - v.from;
  const next = Math.min(Math.max(span * factor, min), hi - lo);
  const pivot = v.from + span * anchor;
  return clampView({ from: pivot - next * anchor, to: pivot - next * anchor + next }, lo, hi, min);
}

/** Shift by a fraction of the current span (negative = into the past). */
export function panView(v: View, fraction: number, lo: number, hi: number, min: number): View {
  const dt = (v.to - v.from) * fraction;
  return clampView({ from: v.from + dt, to: v.to + dt }, lo, hi, min);
}
