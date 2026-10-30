"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { cn, toLocalDateString } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

export interface DailyDataPoint {
  date?: string | Date;
  value?: number;
  label?: string;
  secondaryValue?: number;
  category?: string;
  [key: string]: any;
}

export interface DailyBrickBarChartProps {
  data?: any[];
  dateKey?: string;
  valueKey?: string;
  height?: number | string;
  title?: string;
  subtitle?: string;
  metricLabel?: string;
  yAxisFormatter?: (value: number) => string;
  tooltipValueFormatter?: (value: number) => string;
  showYAxis?: boolean;
  showXAxis?: boolean;
  showToolbar?: boolean;
  isDark?: boolean;
  /** @deprecated Bars are rendered solid; retained for caller compatibility. */
  brickHeight?: number;
  /** @deprecated Bars are rendered solid; retained for caller compatibility. */
  brickGap?: number;
  className?: string;
  seedDemonstration?: boolean;
  onHover?: (point: DailyDataPoint | null) => void;
  year?: number;
  initialDays?: number;
  colorTheme?: "purple" | "brand-purple" | "white" | "silver-mono" | "emerald" | "violet" | "blue" | "amber";
  unit?: "currency" | "number" | "percentage";
}

// ── Seeded PRNG for authentic deterministic generation ──
function createRng(seed = 42) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Realistic 730-day (2-year) seed data matching the reference image ──
export function generate365DailyData(
  year: number = 2026,
  options: {
    base?: number;
    variance?: number;
    seed?: number;
    totalDays?: number;
  } = {}
): DailyDataPoint[] {
  const { base = 18000, variance = 8000, seed = 1337, totalDays = 730 } = options;

  const rng = createRng(seed);
  const result: DailyDataPoint[] = [];

  const today = new Date();
  const endDate = today.getFullYear() === year ? today : new Date(year, today.getMonth(), today.getDate());
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (totalDays - 1));

  for (let d = 0; d < totalDays; d++) {
    const curDate = new Date(startDate);
    curDate.setDate(startDate.getDate() + d);

    let val = base + rng() * variance;

    // Seasonal oscillations over time
    const dayOfYear = d % 365;

    // Early Jan mini-spike (day ~10-18)
    if (dayOfYear >= 10 && dayOfYear <= 18) {
      const p = 1 - Math.abs(dayOfYear - 14) / 5;
      val += Math.max(0, p) * 35000 * (0.7 + rng() * 0.5);
    }

    // February mid oscillation
    if (dayOfYear >= 40 && dayOfYear <= 55) {
      val += (rng() - 0.2) * 16000;
    }

    // Huge March peak (day ~68-82) matching the reference spike
    if (dayOfYear >= 66 && dayOfYear <= 82) {
      const p = 1 - Math.abs(dayOfYear - 73) / 8;
      val += Math.max(0, p) * 145000 * (0.8 + rng() * 0.4);
    }

    if (dayOfYear >= 83 && dayOfYear <= 95) val += rng() * 22000;
    if (dayOfYear >= 100 && dayOfYear <= 125 && dayOfYear % 6 === 0) val += 18000 * rng();
    if (dayOfYear >= 135 && dayOfYear <= 175) val += Math.sin(dayOfYear * 0.3) * 6000 + rng() * 12000;
    if (dayOfYear >= 190 && dayOfYear <= 202) {
      const p = 1 - Math.abs(dayOfYear - 196) / 6;
      val += Math.max(0, p) * 38000 * (0.7 + rng() * 0.5);
    }
    if (dayOfYear >= 220 && dayOfYear <= 240) val += rng() * 19000;
    if (dayOfYear >= 250 && dayOfYear <= 290) {
      val += 12000 + rng() * 24000;
      if (dayOfYear === 268 || dayOfYear === 282) val += 32000 * rng();
    }
    if (dayOfYear >= 310 && dayOfYear <= 330) val += 15000 + rng() * 32000;
    if (dayOfYear >= 340 && dayOfYear <= 360) val += rng() * 26000;

    val = Math.max(2500, Math.round(val));

    result.push({
      date: toLocalDateString(curDate),
      value: val,
      label: curDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    });
  }

  return result;
}

export function generateZeroDailyData(totalDays = 90): DailyDataPoint[] {
  const result: DailyDataPoint[] = [];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (totalDays - 1));

  for (let d = 0; d < totalDays; d++) {
    const curDate = new Date(startDate);
    curDate.setDate(startDate.getDate() + d);
    result.push({
      date: toLocalDateString(curDate),
      value: 0,
      label: curDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    });
  }
  return result;
}

export function plainNumberFmtY(v: number): string {
  if (v >= 10000000) return (v / 10000000).toFixed(1) + "Cr";
  if (v >= 100000) return (v / 100000).toFixed(0) + "L";
  if (v >= 1000) return (v / 1000).toFixed(0) + "K";
  return v.toString();
}

export function plainNumberFmtTooltip(v: number): string {
  return v.toLocaleString("en-IN");
}

function defaultFmtY(v: number): string {
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(1) + "Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(0) + "L";
  if (v >= 1000) return "₹" + (v / 1000).toFixed(0) + "K";
  return "₹" + v.toString();
}

function defaultFmtTooltip(v: number): string {
  return "₹" + v.toLocaleString("en-IN");
}

const PRESET_DAYS = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
  { label: "1Y", days: 365 },
  { label: "ALL", days: 730 },
];

export function DailyBrickBarChart({
  data,
  dateKey = "date",
  valueKey = "value",
  height = 320,
  title,
  subtitle,
  metricLabel = "Volume",
  unit = "currency",
  yAxisFormatter,
  tooltipValueFormatter,
  showYAxis = true,
  showXAxis = true,
  showToolbar = true,
  isDark: propIsDark,
  className,
  seedDemonstration = false,
  onHover,
  year = 2026,
  initialDays = 90,
  colorTheme = "emerald",
}: DailyBrickBarChartProps) {
  const storeTheme = useThemeStore((state) => state.theme);
  const isDark = propIsDark !== undefined ? propIsDark : storeTheme !== "light";
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isCountMetric = unit === "number" || ["orders", "count", "quantity", "units", "items", "number"].includes(metricLabel.toLowerCase());
  const effectiveYAxisFormatter = yAxisFormatter || (isCountMetric ? plainNumberFmtY : defaultFmtY);
  const effectiveTooltipFormatter = tooltipValueFormatter || (isCountMetric ? plainNumberFmtTooltip : defaultFmtTooltip);

  // Normalize incoming chart data
  const chartData = useMemo<DailyDataPoint[]>(() => {
    if (data && Array.isArray(data)) {
      if (data.length === 0) {
        return seedDemonstration
          ? generate365DailyData(year, { base: 18000, variance: 8000, seed: 1337, totalDays: initialDays })
          : [];
      }
      return data
        .map((item, idx) => {
          const rawDate = item[dateKey] || item.date;
          let dStr = "";
          if (rawDate instanceof Date || typeof rawDate === "string") {
            dStr = toLocalDateString(rawDate);
          } else {
            dStr = `Day ${idx + 1}`;
          }

          const val = Number(item[valueKey] ?? item.value ?? item.count ?? item.amount ?? 0);
          return {
            ...item,
            date: dStr,
            value: isNaN(val) ? 0 : val,
            label: item.label || dStr,
          };
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }

    if (seedDemonstration) {
      return generate365DailyData(year);
    }

    return seedDemonstration ? generate365DailyData(year, { totalDays: initialDays }) : [];
  }, [data, dateKey, valueKey, seedDemonstration, year, initialDays]);

  // View window within chartData: [startIdx, endIdx]
  // Default to the last initialDays so the user can immediately zoom IN or zoom OUT
  const [viewRange, setViewRange] = useState<[number, number]>(() => {
    const total = chartData.length;
    const start = Math.max(0, total - initialDays);
    return [start, total];
  });
  const [activePreset, setActivePreset] = useState<string>("90D");
  const [customDaysInput, setCustomDaysInput] = useState<string>("");

  // Keep viewRange valid if chartData changes
  useEffect(() => {
    setViewRange(([s, e]) => {
      const total = chartData.length;
      if (e > total || s < 0) {
        return [Math.max(0, total - initialDays), total];
      }
      return [s, e];
    });
  }, [chartData.length, initialDays]);

  const viewRangeRef = useRef<[number, number]>(viewRange);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    viewRangeRef.current = viewRange;
  }, [viewRange]);

  // Sliced visible data for current zoom/pan window
  const [startIdx, endIdx] = viewRange;
  const visibleData = useMemo(() => {
    const s = Math.max(0, Math.min(startIdx, chartData.length - 1));
    const e = Math.max(s + 1, Math.min(endIdx, chartData.length));
    return chartData.slice(s, e);
  }, [chartData, startIdx, endIdx]);

  // Drag-panning state
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef<[number, number]>([0, 0]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const [tooltipState, setTooltipState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    point: DailyDataPoint | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    point: null,
  });

  // ERP Color System Definitions (Theme-aware, enterprise styling with brand colors)
  const themeColors = useMemo(() => {
    switch (colorTheme) {
      case "purple":
      case "brand-purple":
      case "violet":
        if (isDark) {
          return {
            primaryBrick: "#a855f7",
            secondaryBrick: "#6b21a8",
            accentBrick: "#d8b4fe",
            hoverGlow: "#f5d0fe",
            borderBadge: "rgba(168, 85, 247, 0.4)",
            textBadge: "#c084fc",
            btnActive: "bg-purple-500/25 text-purple-200 border-purple-400/50 shadow-sm",
            btnApply: "bg-purple-500/25 text-purple-200 border-purple-400/50 hover:bg-purple-500/35",
          };
        } else {
          return {
            primaryBrick: "#9333ea",
            secondaryBrick: "#c084fc",
            accentBrick: "#6b21a8",
            hoverGlow: "#581c87",
            borderBadge: "rgba(147, 51, 234, 0.3)",
            textBadge: "#7c3aed",
            btnActive: "bg-purple-600 text-white border-purple-700 shadow-sm",
            btnApply: "bg-purple-600 text-white hover:bg-purple-700 border-purple-700",
          };
        }
      case "emerald":
        if (isDark) {
          return {
            primaryBrick: "#10b981",
            secondaryBrick: "#047857",
            accentBrick: "#34d399",
            hoverGlow: "#6ee7b7",
            borderBadge: "rgba(16, 185, 129, 0.3)",
            textBadge: "#10b981",
            btnActive: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
            btnApply: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30",
          };
        } else {
          return {
            primaryBrick: "#059669",
            secondaryBrick: "#34d399",
            accentBrick: "#065f46",
            hoverGlow: "#047857",
            borderBadge: "rgba(16, 185, 129, 0.3)",
            textBadge: "#059669",
            btnActive: "bg-emerald-600 text-white border-emerald-700 shadow-sm",
            btnApply: "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700",
          };
        }
      case "blue":
        if (isDark) {
          return {
            primaryBrick: "#3b82f6",
            secondaryBrick: "#1d4ed8",
            accentBrick: "#60a5fa",
            hoverGlow: "#93c5fd",
            borderBadge: "rgba(59, 130, 246, 0.3)",
            textBadge: "#3b82f6",
            btnActive: "bg-blue-500/20 text-blue-400 border-blue-500/40",
            btnApply: "bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30",
          };
        } else {
          return {
            primaryBrick: "#2563eb",
            secondaryBrick: "#60a5fa",
            accentBrick: "#1e40af",
            hoverGlow: "#1d4ed8",
            borderBadge: "rgba(37, 99, 235, 0.3)",
            textBadge: "#2563eb",
            btnActive: "bg-blue-600 text-white border-blue-700 shadow-sm",
            btnApply: "bg-blue-600 text-white hover:bg-blue-700 border-blue-700",
          };
        }
      case "amber":
        if (isDark) {
          return {
            primaryBrick: "#f59e0b",
            secondaryBrick: "#b45309",
            accentBrick: "#fbbf24",
            hoverGlow: "#fde68a",
            borderBadge: "rgba(245, 158, 11, 0.3)",
            textBadge: "#f59e0b",
            btnActive: "bg-amber-400/20 text-amber-400 border-amber-400/40",
            btnApply: "bg-amber-400/20 text-amber-400 border-amber-400/40 hover:bg-amber-400/30",
          };
        } else {
          return {
            primaryBrick: "#d97706",
            secondaryBrick: "#fbbf24",
            accentBrick: "#92400e",
            hoverGlow: "#b45309",
            borderBadge: "rgba(217, 119, 6, 0.3)",
            textBadge: "#d97706",
            btnActive: "bg-amber-600 text-white border-amber-700 shadow-sm",
            btnApply: "bg-amber-600 text-white hover:bg-amber-700 border-amber-700",
          };
        }
      case "white":
      case "silver-mono":
      default:
        if (isDark) {
          return {
            primaryBrick: "#e4e4e7",
            secondaryBrick: "#71717a",
            accentBrick: "#ffffff",
            hoverGlow: "#ffffff",
            borderBadge: "rgba(255, 255, 255, 0.35)",
            textBadge: "#ffffff",
            btnActive: "bg-white/20 text-white border-white/50 shadow-sm",
            btnApply: "bg-white/15 text-white border-white/40 hover:bg-white/25",
          };
        } else {
          return {
            primaryBrick: "#334155",
            secondaryBrick: "#94a3b8",
            accentBrick: "#0f172a",
            hoverGlow: "#0f172a",
            borderBadge: "rgba(15, 23, 42, 0.3)",
            textBadge: "#0f172a",
            btnActive: "bg-slate-900 text-white border-slate-900 shadow-sm",
            btnApply: "bg-slate-900 text-white hover:bg-slate-800 border-slate-900",
          };
        }
    }
  }, [colorTheme, isDark]);

  // Scale calculations for visible data
  const { maxVal, yMax, yTicks } = useMemo(() => {
    const vals = visibleData.map((d) => d.value ?? 0);
    const max = Math.max(...vals, 10);
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    const roundStep = magnitude * (max / magnitude > 5 ? 2 : 1) || 1000;
    const ceiling = Math.ceil(max / roundStep) * roundStep;

    const ticks: number[] = [];
    const step = ceiling / 4;
    for (let v = 0; v <= ceiling; v += step) {
      ticks.push(Math.round(v));
    }

    return { maxVal: max, yMax: ceiling, yTicks: ticks };
  }, [visibleData]);

  // Main canvas render routine
  const renderChart = useCallback(
    (highlightIdx?: number, animProgress: number = 1) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || visibleData.length === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const progress = Math.max(0, Math.min(1, animProgress));

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;

      if (W === 0 || H === 0) return;

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const PAD = {
        top: 28,
        right: showYAxis ? 56 : 14,
        bottom: showXAxis ? 30 : 10,
        left: 14,
      };

      const cL = PAD.left;
      const cR = W - PAD.right;
      const cT = PAD.top;
      const cB = H - PAD.bottom;
      const cW = Math.max(10, cR - cL);
      const cH = Math.max(10, cB - cT);

      // ── 1. Gridlines and Y-axis labels ──
      if (showYAxis) {
        ctx.font = '10px "Roboto Mono", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        yTicks.forEach((tickVal) => {
          const y = cB - (tickVal / yMax) * cH;

          ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.09)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cL, Math.round(y) + 0.5);
          ctx.lineTo(cR, Math.round(y) + 0.5);
          ctx.stroke();

          ctx.fillStyle = isDark ? "#94a3b8" : "#334155";
          ctx.fillText(effectiveYAxisFormatter(tickVal), cR + 8, y);
        });
      }

      // ── 2. X-axis Baseline ──
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cL, Math.round(cB) + 0.5);
      ctx.lineTo(cR, Math.round(cB) + 0.5);
      ctx.stroke();

      // ── 3. Draw solid bars for each day in the visible window ──
      const n = visibleData.length;
      const colWidth = cW / n;
      const gapX = Math.max(0.6, Math.min(4, colWidth * 0.18));
      const barWidth = Math.max(1, colWidth - gapX);

      const fmtBarVal = (v: number) => {
        if (v >= 10000000) return (v / 10000000).toFixed(1) + "Cr";
        if (v >= 100000) return (v / 100000).toFixed(0) + "L";
        if (v >= 1000) return (v / 1000).toFixed(0) + "K";
        return v.toString();
      };

      const allZero = visibleData.every((d) => (d.value ?? 0) === 0);
      if (allZero) {
        ctx.save();
        ctx.font = '12px "Roboto Mono", monospace';
        ctx.fillStyle = isDark ? "#71717a" : "#a1a1aa";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No transactions recorded for this period in your organization", cL + cW / 2, cT + cH / 2);
        ctx.restore();
      }

      for (let i = 0; i < n; i++) {
        const item = visibleData[i];
        const val = item.value ?? 0;
        const x = cL + i * colWidth + gapX / 2;

        const staggerDelay = (i / n) * 0.22;
        const colProgress = progress >= 1 ? 1 : Math.max(0, Math.min(1, (progress - staggerDelay) / (1 - staggerDelay)));
        const easedCol = progress >= 1 ? 1 : 1 - Math.pow(1 - colProgress, 3);
        const animVal = val * easedCol;

        const isHovered = highlightIdx === i;
        if (val <= 0 || animVal <= 0) {
          if (isHovered) {
            ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)";
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(x + barWidth / 2, cT);
            ctx.lineTo(x + barWidth / 2, cB);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          continue;
        }

        const barH = Math.min(cH, Math.max(0, (animVal / yMax) * cH));
        const barTopY = cB - barH;
        ctx.save();
        ctx.fillStyle = themeColors.primaryBrick;
        if (isHovered) {
          ctx.shadowColor = themeColors.hoverGlow;
          ctx.shadowBlur = 4;
        }
        ctx.fillRect(Math.round(x), Math.round(barTopY), Math.max(1, Math.round(barWidth)), Math.max(1, Math.round(barH)));
        ctx.restore();

        // Numeric value directly above each bar so user can read directly
        const shouldDrawValue =
          isHovered ||
          n <= 35 ||
          (n <= 55 && i % 2 === 0) ||
          (n > 55 && (i % Math.ceil(n / 20) === 0 || (i > 0 && i < n - 1 && val > (visibleData[i - 1]?.value ?? 0) * 1.3 && val > (visibleData[i + 1]?.value ?? 0))));

        if (shouldDrawValue && barTopY > cT - 22) {
          ctx.save();
          ctx.font = isHovered ? 'bold 10px "Roboto Mono", monospace' : 'bold 9px "Roboto Mono", monospace';
          ctx.fillStyle = isHovered
            ? (isDark ? "#FFFFFF" : "#0F172A")
            : (isDark ? "#F2F2F2" : "#1E293B");

          if (n > 25 && !isHovered && colWidth < 22) {
            ctx.translate(x + barWidth / 2, barTopY - 4);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(fmtBarVal(val), 0, 0);
          } else {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(fmtBarVal(val), x + barWidth / 2, barTopY - 3);
          }
          ctx.restore();
        }

        // Active Column Hover Guide
        if (isHovered) {
          ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(x + barWidth / 2, cT);
          ctx.lineTo(x + barWidth / 2, cB);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ── 4. X-axis Date Labels ──
      if (showXAxis) {
        ctx.font = '10px "Roboto Mono", monospace';
        ctx.fillStyle = isDark ? "#888888" : "#666666";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const labelStep = Math.max(1, Math.floor(n / 6));
        for (let i = 0; i < n; i += labelStep) {
          const pt = visibleData[i];
          const x = cL + i * colWidth + barWidth / 2;
          const dObj = new Date(String(pt.date) + "T00:00:00");
          const labelStr = isNaN(dObj.getTime())
            ? String(pt.date)
            : n <= 30
            ? dObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : dObj.toLocaleDateString("en-US", { month: "short" });

          ctx.fillText(labelStr, x, cB + 8);
        }
      }
    },
    [visibleData, showYAxis, showXAxis, isDark, yMax, yTicks, themeColors, effectiveYAxisFormatter]
  );

  // Keep a stable ref to renderChart to prevent ResizeObserver thrashing
  const renderChartRef = useRef(renderChart);
  useEffect(() => {
    renderChartRef.current = renderChart;
  });

  // Animation frame on mount or data changes
  const animRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef<boolean>(false);

  useEffect(() => {
    if (hasAnimatedRef.current) {
      renderChart(undefined, 1);
      return;
    }

    let startTime: number | null = null;
    const duration = 850;

    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      renderChart(undefined, easeOut);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        animRef.current = null;
        hasAnimatedRef.current = true;
        renderChart(undefined, 1);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [visibleData, renderChart]);

  // Stable single ResizeObserver on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      renderChartRef.current(undefined, 1);
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Zoom around the pointer while the pointer is over the plot. Keep the range
  // ref current so rapid wheel events compose instead of racing React renders.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return; // Preserve browser page zoom.
      const total = chartData.length;
      if (total <= 1) return;
      event.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const left = 14;
      const right = showYAxis ? 56 : 14;
      const plotWidth = Math.max(1, rect.width - left - right);
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - left) / plotWidth));
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 24
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? event.deltaY * 120
          : event.deltaY;
      const [start, end] = viewRangeRef.current;
      const span = Math.max(1, end - start);
      const minSpan = Math.min(7, total);
      const nextSpan = Math.max(minSpan, Math.min(total, Math.round(span * Math.exp(Math.max(-120, Math.min(120, delta)) * 0.002))));
      if (nextSpan === span) return;

      const anchor = start + ratio * span;
      let nextStart = Math.round(anchor - ratio * nextSpan);
      let nextEnd = nextStart + nextSpan;
      if (nextStart < 0) { nextStart = 0; nextEnd = nextSpan; }
      if (nextEnd > total) { nextEnd = total; nextStart = total - nextSpan; }
      viewRangeRef.current = [nextStart, nextEnd];
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          setViewRange(viewRangeRef.current);
          setActivePreset("");
        });
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [chartData.length, showYAxis]);

  // ── Drag-to-Pan Handlers ──
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = [...viewRange];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || visibleData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const PAD_LEFT = 14;
    const PAD_RIGHT = showYAxis ? 56 : 14;
    const cW = Math.max(10, rect.width - PAD_LEFT - PAD_RIGHT);

    // Pan across history
    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartXRef.current;
      const [initStart, initEnd] = dragStartRangeRef.current;
      const span = initEnd - initStart;
      const shift = Math.round((deltaX / cW) * span);

      let newStart = initStart - shift;
      let newEnd = initEnd - shift;

      if (newStart < 0) {
        newStart = 0;
        newEnd = span;
      }
      if (newEnd > chartData.length) {
        newEnd = chartData.length;
        newStart = Math.max(0, chartData.length - span);
      }

      setViewRange([newStart, newEnd]);
      return;
    }

    // Hover Tooltip Detection
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (mx < PAD_LEFT || mx > rect.width - PAD_RIGHT) {
      setTooltipState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      renderChart();
      onHover?.(null);
      return;
    }

    const n = visibleData.length;
    const colWidth = cW / n;
    const idx = Math.min(n - 1, Math.max(0, Math.floor((mx - PAD_LEFT) / colWidth)));
    const point = visibleData[idx];

    setTooltipState({
      visible: true,
      x: Math.min(rect.width - 180, Math.max(10, mx + 16)),
      y: Math.max(10, my - 50),
      point,
    });

    renderChart(idx);
    onHover?.(point);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setTooltipState((prev) => ({ ...prev, visible: false }));
    renderChart();
    onHover?.(null);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      dragStartXRef.current = e.touches[0].clientX;
      dragStartRangeRef.current = [...viewRange];
      handleTouchMove(e);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas || visibleData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const PAD_LEFT = 14;
    const PAD_RIGHT = showYAxis ? 56 : 14;
    const cW = Math.max(10, rect.width - PAD_LEFT - PAD_RIGHT);

    // Pan across history if dragging
    if (isDraggingRef.current) {
      const deltaX = touch.clientX - dragStartXRef.current;
      const [initStart, initEnd] = dragStartRangeRef.current;
      const span = initEnd - initStart;
      const shift = Math.round((deltaX / cW) * span);

      let newStart = initStart - shift;
      let newEnd = initEnd - shift;

      if (newStart < 0) {
        newStart = 0;
        newEnd = span;
      }
      if (newEnd > chartData.length) {
        newEnd = chartData.length;
        newStart = Math.max(0, chartData.length - span);
      }

      setViewRange([newStart, newEnd]);
    }

    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;

    if (mx < PAD_LEFT || mx > rect.width - PAD_RIGHT) {
      setTooltipState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      renderChart();
      onHover?.(null);
      return;
    }

    const n = visibleData.length;
    const colWidth = cW / n;
    const idx = Math.min(n - 1, Math.max(0, Math.floor((mx - PAD_LEFT) / colWidth)));
    const point = visibleData[idx];

    setTooltipState({
      visible: true,
      x: Math.min(rect.width - 180, Math.max(10, mx + 16)),
      y: Math.max(10, my - 50),
      point,
    });

    renderChart(idx);
    onHover?.(point);
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  const handleDoubleClick = () => {
    const total = chartData.length;
    const start = Math.max(0, total - initialDays);
    setViewRange([start, total]);
    setActivePreset("90D");
  };

  // Preset Handlers
  const handleSelectPreset = (preset: typeof PRESET_DAYS[0]) => {
    setActivePreset(preset.label);
    const total = chartData.length;
    const start = Math.max(0, total - preset.days);
    setViewRange([start, total]);
  };

  const handleCustomDaysApply = (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseInt(customDaysInput, 10);
    if (!isNaN(days) && days >= 2) {
      setActivePreset(`Custom (${days}D)`);
      const total = chartData.length;
      const start = Math.max(0, total - days);
      setViewRange([start, total]);
    }
  };

  if (chartData.length === 0 && !seedDemonstration) {
    return (
      <div
        className={cn("flex w-full items-center justify-center border font-mono text-sm text-muted-foreground", className)}
        style={{ height: typeof height === "number" ? `${height}px` : height }}
      >
        No records are available for this chart.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col w-full border font-mono select-none overflow-hidden rounded-lg transition-colors duration-200 chart-animate-in chart-shimmer-border",
        isDark ? "bg-[#0b0e11] border-border text-white shadow-lg" : "bg-white border-slate-200 text-slate-900 shadow-sm",
        className
      )}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      {/* ── Top Header Strip ── */}
      {(title || subtitle) && (
        <div className={cn(
          "flex items-center justify-between px-4 py-2.5 border-b text-xs",
          isDark ? "border-border/60" : "border-slate-200 bg-slate-50/50"
        )}>
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse shadow-sm"
              style={{ backgroundColor: themeColors.primaryBrick }}
            />
            {title && (
              <span className={cn(
                "font-semibold uppercase tracking-wider",
                isDark ? "text-slate-100" : "text-slate-900 font-bold"
              )}>
                {title}
              </span>
            )}
            {subtitle && (
              <span className={isDark ? "text-muted-foreground" : "text-slate-500 font-medium"}>
                ({subtitle})
              </span>
            )}
          </div>
          <div className={cn(
            "text-[10px] uppercase tracking-widest hidden sm:block",
            isDark ? "text-muted-foreground" : "text-slate-500 font-medium"
          )}>
        {visibleData.length} Visible Days • Scroll to Zoom
          </div>
        </div>
      )}

      {/* ── Timeframe & Custom Days Filter Bar ── */}
      {showToolbar && (
        <div className={cn(
          "flex shrink-0 flex-wrap items-center justify-between px-3 sm:px-4 py-2 border-b text-xs gap-2",
          isDark ? "border-border/40 bg-transparent" : "border-slate-200 bg-slate-50/80"
        )}>
          {/* Preset Buttons */}
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 sm:gap-1.5">
            <span className={cn(
              "text-[10px] uppercase mr-1",
              isDark ? "text-muted-foreground" : "text-slate-600 font-semibold"
            )}>Time:</span>
            {PRESET_DAYS.map((preset) => {
              const isActive = activePreset === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={cn(
                    "px-2.5 py-0.5 text-xs rounded transition-all font-medium cursor-pointer border",
                    isActive
                      ? themeColors.btnActive
                      : isDark
                      ? "bg-transparent text-muted-foreground border-transparent hover:text-white hover:bg-white/5"
                      : "bg-white text-slate-700 border-slate-200 hover:text-slate-900 hover:bg-slate-100 shadow-2xs"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* User Custom Days Input Box */}
          <form onSubmit={handleCustomDaysApply} className="flex items-center gap-1.5 ml-auto">
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border transition-colors",
              isDark
                ? "bg-[#14181d] border-border/60 text-white"
                : "bg-white border-slate-300 text-slate-900 focus-within:border-emerald-500 shadow-2xs"
            )}>
              <Calendar className={cn("h-3 w-3", isDark ? "text-muted-foreground" : "text-slate-400")} />
              <input
                type="number"
                min="2"
                max={chartData.length}
                value={customDaysInput}
                onChange={(e) => setCustomDaysInput(e.target.value)}
                placeholder="Days..."
                aria-label="Custom number of days"
                className={cn(
                  "w-16 bg-transparent text-xs font-mono focus:outline-none",
                  isDark ? "text-white placeholder:text-muted-foreground" : "text-slate-900 placeholder:text-slate-400"
                )}
              />
            </div>
            <button
              type="submit"
              className={cn(
                "px-2.5 py-0.5 text-xs border rounded transition-colors cursor-pointer font-medium shadow-xs",
                themeColors.btnApply
              )}
            >
              Apply
            </button>
          </form>
        </div>
      )}

      {/* ── Canvas Wrap with Mouse Wheel Zoom & Pan ── */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 min-w-0 w-full"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
          className="absolute inset-0 block w-full h-full cursor-crosshair"
          title="Scroll to zoom in/out • Click and drag to pan • Double-click to reset"
        />

        {/* Floating Tooltip */}
        {tooltipState.visible && tooltipState.point && (
          <div
            className="absolute pointer-events-none z-30 transition-transform duration-75 ease-out shadow-2xl backdrop-blur-md px-3.5 py-2.5 border rounded-none text-xs font-mono"
            style={{
              left: `${tooltipState.x}px`,
              top: `${tooltipState.y}px`,
              backgroundColor: isDark ? "#161616" : "#ffffff",
              borderColor: isDark ? "#272727" : "#cbd5e1",
              color: isDark ? "#F2F2F2" : "#0f172a",
              boxShadow: isDark ? "0 10px 25px -5px rgba(0, 0, 0, 0.8)" : "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
            }}
          >
            <div className={cn(
              "text-[11px] font-semibold pb-1.5 mb-1.5 border-b flex items-center justify-between gap-4",
              isDark ? "text-muted-foreground border-border/40" : "text-slate-600 border-slate-200"
            )}>
              <span>{tooltipState.point.label || String(tooltipState.point.date)}</span>
              <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-muted/30 font-medium">Daily Telemetry</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className={isDark ? "text-[#757575]" : "text-slate-500"}>{metricLabel}:</span>
              <span className="font-bold tabular-nums text-sm" style={{ color: themeColors.primaryBrick }}>
                {effectiveTooltipFormatter(tooltipState.point.value ?? 0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DailyBrickBarChart;
