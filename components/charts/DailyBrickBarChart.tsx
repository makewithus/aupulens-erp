"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

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
  brickHeight?: number;
  brickGap?: number;
  className?: string;
  seedDemonstration?: boolean;
  onHover?: (point: DailyDataPoint | null) => void;
  year?: number;
  initialDays?: number;
  colorTheme?: "white" | "silver-mono" | "emerald" | "violet" | "blue" | "amber";
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

  const endDate = new Date(year, 11, 31);
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
      date: curDate.toISOString().split("T")[0],
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
  yAxisFormatter = defaultFmtY,
  tooltipValueFormatter = defaultFmtTooltip,
  showYAxis = true,
  showXAxis = true,
  showToolbar = true,
  isDark = true,
  brickHeight = 3.5,
  brickGap = 1.2,
  className,
  seedDemonstration = false,
  onHover,
  year = 2026,
  initialDays = 90,
  colorTheme = "white",
}: DailyBrickBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Normalize incoming chart data
  const chartData = useMemo<DailyDataPoint[]>(() => {
    if ((!data || data.length === 0) && seedDemonstration) {
      return generate365DailyData(year);
    }
    if (!data || data.length === 0) {
      return generate365DailyData(year);
    }

    return data.map((item, idx) => {
      const rawDate = item[dateKey] || item.date;
      let dStr = "";
      if (rawDate instanceof Date) {
        dStr = rawDate.toISOString().split("T")[0];
      } else if (typeof rawDate === "string") {
        dStr = rawDate.split("T")[0];
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
    });
  }, [data, dateKey, valueKey, seedDemonstration, year]);

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

  // ERP Color System Definitions (Theme-aware, enterprise styling)
  const themeColors = useMemo(() => {
    switch (colorTheme) {
      case "emerald":
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
      case "violet":
        return {
          primaryBrick: "#8b5cf6",
          secondaryBrick: "#5b21b6",
          accentBrick: "#a78bfa",
          hoverGlow: "#c4b5fd",
          borderBadge: "rgba(139, 92, 246, 0.3)",
          textBadge: "#8b5cf6",
          btnActive: "bg-violet-500/20 text-violet-400 border-violet-500/40",
          btnApply: "bg-violet-500/20 text-violet-400 border-violet-500/40 hover:bg-violet-500/30",
        };
      case "blue":
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
      case "amber":
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
      case "white":
      case "silver-mono":
      default:
        // Clean white / silver monochrome palette (default)
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
    }
  }, [colorTheme]);

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
    (highlightIdx?: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || visibleData.length === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

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
        top: 16,
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

          ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.06)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cL, Math.round(y) + 0.5);
          ctx.lineTo(cR, Math.round(y) + 0.5);
          ctx.stroke();

          ctx.fillStyle = isDark ? "#71717a" : "#71717a";
          ctx.fillText(yAxisFormatter(tickVal), cR + 8, y);
        });
      }

      // ── 2. X-axis Baseline ──
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cL, Math.round(cB) + 0.5);
      ctx.lineTo(cR, Math.round(cB) + 0.5);
      ctx.stroke();

      // ── 3. Draw segmented brick bars for each day in visible window ──
      const n = visibleData.length;
      const colWidth = cW / n;
      const gapX = Math.max(0.6, Math.min(4, colWidth * 0.18));
      const barWidth = Math.max(1, colWidth - gapX);

      const dynamicBrickHeight = Math.max(2.5, Math.min(8, colWidth * 0.8));
      const dynamicBrickGap = Math.max(0.8, dynamicBrickHeight * 0.28);
      const slotHeight = dynamicBrickHeight + dynamicBrickGap;
      const totalPossibleBricks = Math.floor(cH / slotHeight);

      for (let i = 0; i < n; i++) {
        const item = visibleData[i];
        const val = item.value ?? 0;
        const x = cL + i * colWidth + gapX / 2;

        const valRatio = Math.min(1, Math.max(0, val / yMax));
        const numBricks = Math.max(1, Math.round(valRatio * totalPossibleBricks));
        const isHovered = highlightIdx === i;

        for (let b = 0; b < numBricks; b++) {
          const brickY = cB - (b + 1) * slotHeight;
          if (brickY < cT - 2) break;

          const brickProgress = b / totalPossibleBricks;

          if (isHovered) {
            ctx.fillStyle = themeColors.hoverGlow;
            ctx.shadowColor = themeColors.hoverGlow;
            ctx.shadowBlur = 4;
          } else if (brickProgress > 0.65) {
            ctx.fillStyle = themeColors.accentBrick;
            ctx.shadowBlur = 0;
          } else if (b % 4 === 0) {
            ctx.fillStyle = themeColors.secondaryBrick;
            ctx.shadowBlur = 0;
          } else {
            ctx.fillStyle = themeColors.primaryBrick;
            ctx.shadowBlur = 0;
          }

          ctx.fillRect(Math.round(x), Math.round(brickY), Math.max(1, Math.round(barWidth)), Math.round(dynamicBrickHeight));
          ctx.shadowBlur = 0;
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
    [visibleData, showYAxis, showXAxis, isDark, yMax, yTicks, themeColors, yAxisFormatter]
  );

  // Keep a stable ref to renderChart to prevent ResizeObserver thrashing
  const renderChartRef = useRef(renderChart);
  useEffect(() => {
    renderChartRef.current = renderChart;
  });

  // Stable single ResizeObserver on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      renderChartRef.current();
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Redraw when visible data or display parameters update
  useEffect(() => {
    renderChart();
  }, [renderChart]);

  // ── Native Non-Passive Mouse-Wheel Zoom In & Zoom Out Handler ──
  // High-performance RAF-batched smooth zoom with firm, decisive step progression.
  // Reliably prevents whole-page browser zoom while providing buttery-smooth 60+ FPS zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const totalLen = chartData.length;
      if (totalLen <= 1) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const PAD_LEFT = 14;
      const PAD_RIGHT = showYAxis ? 56 : 14;
      const cW = Math.max(10, rect.width - PAD_LEFT - PAD_RIGHT);
      const mouseRatio = Math.max(0, Math.min(1, (mx - PAD_LEFT) / cW));

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 28;
      else if (e.deltaMode === 2) dy *= 120;

      // Allow a firm, clear response per wheel tick (~12-14% window change)
      const clampedDelta = Math.max(-100, Math.min(100, dy));
      const [curStart, curEnd] = viewRangeRef.current;
      const span = curEnd - curStart;
      const minSpan = 7;
      const maxSpan = totalLen;

      // Controlled exponential zoom factor
      const sensitivity = 0.0015;
      const factor = Math.exp(clampedDelta * sensitivity);
      let newSpan = Math.round(span * factor);

      // Firm step guarantee: ensures noticeable progress on every scroll tick
      const minStep = span > 60 ? 3 : span > 20 ? 2 : 1;
      if (Math.abs(newSpan - span) < minStep) {
        if (clampedDelta > 0 && span < maxSpan) {
          newSpan = Math.min(maxSpan, span + minStep);
        } else if (clampedDelta < 0 && span > minSpan) {
          newSpan = Math.max(minSpan, span - minStep);
        }
      }

      newSpan = Math.max(minSpan, Math.min(maxSpan, newSpan));
      if (newSpan === span && ((clampedDelta > 0 && span >= maxSpan) || (clampedDelta < 0 && span <= minSpan))) {
        return;
      }

      // Anchor zoom around cursor position
      const centerIdx = curStart + mouseRatio * span;
      let newStart = Math.round(centerIdx - mouseRatio * newSpan);
      let newEnd = newStart + newSpan;

      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(totalLen, newSpan);
      }
      if (newEnd > totalLen) {
        newEnd = totalLen;
        newStart = Math.max(0, totalLen - newSpan);
      }

      viewRangeRef.current = [newStart, newEnd];

      // Batch state update with display refresh rate via requestAnimationFrame
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          setViewRange([...viewRangeRef.current]);
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

  return (
    <div
      className={cn(
        "relative flex flex-col w-full border font-mono select-none overflow-hidden rounded-lg",
        isDark ? "bg-[#0b0e11] border-border text-white" : "bg-white border-border text-foreground",
        className
      )}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      {/* ── Top Header Strip ── */}
      {(title || subtitle) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 text-xs">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: themeColors.primaryBrick }}
            />
            {title && <span className="font-semibold uppercase tracking-wider">{title}</span>}
            {subtitle && <span className="text-muted-foreground">({subtitle})</span>}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest hidden sm:block">
            {visibleData.length} Visible Days • Mouse Wheel to Zoom
          </div>
        </div>
      )}

      {/* ── Timeframe & Custom Days Filter Bar ── */}
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b border-border/40 text-xs gap-2">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] text-muted-foreground uppercase mr-1">Time:</span>
            {PRESET_DAYS.map((preset) => {
              const isActive = activePreset === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={cn(
                    "px-2.5 py-0.5 text-xs rounded transition-colors font-medium cursor-pointer border",
                    isActive
                      ? themeColors.btnActive
                      : "bg-transparent text-muted-foreground border-transparent hover:text-white hover:bg-white/5"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* User Custom Days Input Box */}
          <form onSubmit={handleCustomDaysApply} className="flex items-center gap-1.5 ml-auto">
            <div className="flex items-center gap-1 bg-[#14181d] border border-border/60 px-2 py-0.5 rounded text-xs">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <input
                type="number"
                min="2"
                max={chartData.length}
                value={customDaysInput}
                onChange={(e) => setCustomDaysInput(e.target.value)}
                placeholder="Days..."
                className="w-16 bg-transparent text-xs font-mono text-white placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className={cn(
                "px-2.5 py-0.5 text-xs border rounded transition-colors cursor-pointer",
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
        className="relative flex-1 w-full h-full min-h-[160px] touch-none"
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleDoubleClick}
          className="block w-full h-full cursor-crosshair touch-none"
          style={{ touchAction: "none", overscrollBehavior: "contain" }}
          title="Mouse wheel to zoom in/out • Click and drag to pan • Double-click to reset"
        />

        {/* Floating Tooltip */}
        {tooltipState.visible && tooltipState.point && (
          <div
            className="absolute pointer-events-none z-30 transition-transform duration-75 ease-out shadow-2xl backdrop-blur-md px-3 py-2 border rounded text-[11px]"
            style={{
              left: `${tooltipState.x}px`,
              top: `${tooltipState.y}px`,
              backgroundColor: isDark ? "rgba(13, 16, 23, 0.96)" : "rgba(255, 255, 255, 0.96)",
              borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
              color: isDark ? "#ffffff" : "#09090b",
            }}
          >
            <div className="text-[10px] text-muted-foreground font-medium pb-1 mb-1 border-b border-border/40">
              {tooltipState.point.label || String(tooltipState.point.date)}
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{metricLabel}:</span>
              <span className="font-semibold" style={{ color: themeColors.primaryBrick }}>
                {tooltipValueFormatter(tooltipState.point.value ?? 0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DailyBrickBarChart;
