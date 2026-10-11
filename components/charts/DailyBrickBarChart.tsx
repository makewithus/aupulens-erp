"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";

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
  isDark?: boolean;
  brickHeight?: number;
  brickGap?: number;
  className?: string;
  seedDemonstration?: boolean;
  onHover?: (point: DailyDataPoint | null) => void;
  year?: number;
  colorTheme?: "silver-mono" | "emerald" | "violet" | "blue" | "amber";
}

// ── Seeded PRNG for authentic deterministic generation ──
function createRng(seed = 42) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Realistic 365-day seed data matching the reference image ──
export function generate365DailyData(
  year: number = 2026,
  options: {
    base?: number;
    variance?: number;
    marchSpikeMultiplier?: number;
    summerSpikeMultiplier?: number;
    autumnSpikeMultiplier?: number;
    seed?: number;
  } = {}
): DailyDataPoint[] {
  const {
    base = 18000,
    variance = 8000,
    seed = 1337,
  } = options;

  const rng = createRng(seed);
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalDays = isLeapYear ? 366 : 365;
  const result: DailyDataPoint[] = [];

  const startDate = new Date(year, 0, 1);

  for (let d = 0; d < totalDays; d++) {
    const curDate = new Date(startDate);
    curDate.setDate(startDate.getDate() + d);

    // Baseline with noise
    let val = base + rng() * variance;

    // Early Jan mini-spike (day ~10-18)
    if (d >= 10 && d <= 18) {
      const p = 1 - Math.abs(d - 14) / 5;
      val += Math.max(0, p) * 35000 * (0.7 + rng() * 0.5);
    }

    // February mid oscillation
    if (d >= 40 && d <= 55) {
      val += (rng() - 0.2) * 16000;
    }

    // Huge March peak (day ~68-82) matching the exact spike in the screenshot!
    if (d >= 66 && d <= 82) {
      const p = 1 - Math.abs(d - 73) / 8;
      val += Math.max(0, p) * 145000 * (0.8 + rng() * 0.4);
    }

    // Post-March elevated recovery
    if (d >= 83 && d <= 95) {
      val += rng() * 22000;
    }

    // April bumps
    if (d >= 100 && d <= 125) {
      if (d % 6 === 0) val += 18000 * rng();
    }

    // May & June rhythm
    if (d >= 135 && d <= 175) {
      val += Math.sin(d * 0.3) * 6000 + rng() * 12000;
    }

    // July small spike (around day ~195)
    if (d >= 190 && d <= 202) {
      const p = 1 - Math.abs(d - 196) / 6;
      val += Math.max(0, p) * 38000 * (0.7 + rng() * 0.5);
    }

    // August activity
    if (d >= 220 && d <= 240) {
      val += rng() * 19000;
    }

    // September - October elevated period (days 250-290)
    if (d >= 250 && d <= 290) {
      val += 12000 + rng() * 24000;
      if (d === 268 || d === 282) {
        val += 32000 * rng();
      }
    }

    // November peaks (days 310-330)
    if (d >= 310 && d <= 330) {
      val += 15000 + rng() * 32000;
    }

    // December end-of-year rush (days 340-360)
    if (d >= 340 && d <= 360) {
      val += rng() * 26000;
    }

    // Final smoothing / ensure non-negative
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

// ── Value formatters ──
function defaultFmtY(v: number): string {
  if (v >= 10000000) return (v / 10000000).toFixed(1) + "Cr";
  if (v >= 100000) return (v / 100000).toFixed(0) + "L";
  if (v >= 1000) return (v / 1000).toFixed(0) + "K";
  return v.toString();
}

function defaultFmtTooltip(v: number): string {
  return v.toLocaleString("en-IN");
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function DailyBrickBarChart({
  data,
  dateKey = "date",
  valueKey = "value",
  height = 280,
  title,
  subtitle,
  metricLabel = "Volume",
  yAxisFormatter = defaultFmtY,
  tooltipValueFormatter = defaultFmtTooltip,
  showYAxis = true,
  showXAxis = true,
  isDark = true,
  brickHeight = 3.5,
  brickGap = 1.2,
  className,
  seedDemonstration = false,
  onHover,
  year = 2026,
  colorTheme = "silver-mono",
}: DailyBrickBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  // Effective chart data: if data is empty or seedDemonstration is requested, use authentic 365 daily data
  const chartData = useMemo<DailyDataPoint[]>(() => {
    if ((!data || data.length === 0) && seedDemonstration) {
      return generate365DailyData(year);
    }
    if (!data || data.length === 0) {
      // Return 365-day seed by default so user always sees the exact styling instead of blank
      return generate365DailyData(year);
    }

    // Normalize incoming data: ensure date and value are valid numbers
    return data.map((item, idx) => {
      const rawDate = item[dateKey] || item.date;
      let dStr = "";
      if (rawDate instanceof Date) {
        dStr = rawDate.toISOString().split("T")[0];
      } else if (typeof rawDate === "string") {
        dStr = rawDate;
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

  // Color palette definitions
  const themeColors = useMemo(() => {
    switch (colorTheme) {
      case "emerald":
        return {
          primaryBrick: "#10b981",
          secondaryBrick: "#065f46",
          accentBrick: "#34d399",
          hoverGlow: "#6ee7b7",
        };
      case "violet":
        return {
          primaryBrick: "#a78bfa",
          secondaryBrick: "#4c1d95",
          accentBrick: "#c4b5fd",
          hoverGlow: "#ddd6fe",
        };
      case "blue":
        return {
          primaryBrick: "#38bdf8",
          secondaryBrick: "#1e3a8a",
          accentBrick: "#7dd3fc",
          hoverGlow: "#bae6fd",
        };
      case "amber":
        return {
          primaryBrick: "#fbbf24",
          secondaryBrick: "#78350f",
          accentBrick: "#fde68a",
          hoverGlow: "#fef3c7",
        };
      case "silver-mono":
      default:
        // EXACT styling from the user's reference image
        return {
          primaryBrick: "#d4d4d8", // silvery-gray / off-white
          secondaryBrick: "#52525b", // dark slate segment
          accentBrick: "#e4e4e7", // bright segment
          hoverGlow: "#ffffff", // pure white on hover
        };
    }
  }, [colorTheme]);

  // Calculate scales and ticks
  const { maxVal, yMax, yTicks } = useMemo(() => {
    const vals = chartData.map((d) => d.value);
    const max = Math.max(...vals, 10);
    // Find nice round ceiling
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    const roundStep = magnitude * (max / magnitude > 5 ? 2 : 1) || 1000;
    const ceiling = Math.ceil(max / roundStep) * roundStep;

    const ticks: number[] = [];
    const step = ceiling / 4;
    for (let v = 0; v <= ceiling; v += step) {
      ticks.push(Math.round(v));
    }

    return { maxVal: max, yMax: ceiling, yTicks: ticks };
  }, [chartData]);

  // Main canvas render routine
  const renderChart = useCallback(
    (highlightIdx?: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || chartData.length === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Paddings:
      // Left: clean margin
      // Right: room for Y-axis labels
      // Bottom: room for X-axis month ticks and labels
      // Top: breathing room for spikes
      const PAD = {
        top: 18,
        right: showYAxis ? 52 : 16,
        bottom: showXAxis ? 32 : 12,
        left: 14,
      };

      const cL = PAD.left;
      const cR = W - PAD.right;
      const cT = PAD.top;
      const cB = H - PAD.bottom;
      const cW = Math.max(10, cR - cL);
      const cH = Math.max(10, cB - cT);

      // ── 1. Draw subtle horizontal gridlines & Y-axis labels ──
      if (showYAxis) {
        ctx.font = '10px "Roboto Mono", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        yTicks.forEach((tickVal) => {
          const y = cB - (tickVal / yMax) * cH;

          // Gridline
          ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.06)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cL, Math.round(y) + 0.5);
          ctx.lineTo(cR, Math.round(y) + 0.5);
          ctx.stroke();

          // Y-axis label text on the right
          ctx.fillStyle = isDark ? "#71717a" : "#71717a";
          ctx.fillText(yAxisFormatter(tickVal), cR + 8, y);
        });
      }

      // ── 2. Draw X-axis baseline ──
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cL, Math.round(cB) + 0.5);
      ctx.lineTo(cR, Math.round(cB) + 0.5);
      ctx.stroke();

      // ── 3. Draw segmented brick bars for each and every day ──
      const n = chartData.length;
      const colWidth = cW / n;
      const gapX = Math.max(0.6, colWidth * 0.18);
      const barWidth = Math.max(1, colWidth - gapX);

      // Height of individual brick and vertical spacing
      const bH = brickHeight;
      const bG = brickGap;
      const unitH = bH + bG;

      for (let i = 0; i < n; i++) {
        const d = chartData[i];
        const val = d.value;
        const isHovered = highlightIdx === i;

        const x = cL + i * colWidth + (colWidth - barWidth) / 2;

        // Hover highlight column behind
        if (isHovered) {
          ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)";
          ctx.fillRect(cL + i * colWidth, cT, colWidth, cH);
        }

        if (val <= 0) {
          // If 0 value, draw single 1px faint baseline indicator
          ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)";
          ctx.fillRect(Math.round(x), Math.round(cB - 1.5), Math.max(1, Math.round(barWidth)), 1.5);
          continue;
        }

        const barH = (val / yMax) * cH;
        const totalBricks = Math.max(1, Math.round(barH / unitH));

        for (let b = 0; b < totalBricks; b++) {
          const by = cB - (b + 1) * unitH + bG;

          // Color calculation:
          // Matches the image:
          // Mostly silvery-white bricks, with darker slate segments interspersed
          // in taller columns (e.g. around 75-85% height or specific seed bands)
          let brickColor = themeColors.primaryBrick;

          if (isHovered) {
            brickColor = themeColors.hoverGlow;
          } else {
            // Authentic brick texture:
            // If the column has more than 6 bricks, introduce dark slate segments
            // near the upper 20% or intermittent layers just like the reference photo!
            if (totalBricks > 6) {
              const relPos = b / totalBricks;
              // Dark band near the upper tier (70% - 85%)
              if (relPos >= 0.72 && relPos <= 0.86) {
                brickColor = themeColors.secondaryBrick;
              } else if (b % 7 === 4 && totalBricks > 12) {
                brickColor = themeColors.secondaryBrick;
              }
            }
          }

          ctx.fillStyle = brickColor;
          ctx.fillRect(
            Math.round(x),
            Math.round(by),
            Math.max(1, Math.round(barWidth)),
            Math.max(1, Math.round(bH))
          );
        }
      }

      // ── 4. Draw X-axis Month Markers & Labels (Jan ... Dec) ──
      if (showXAxis) {
        ctx.font = '10px "Roboto Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDark ? "#888888" : "#666666";

        if (n >= 300) {
          // 365/366 day dataset: group by month accurately
          const monthPositions: { [month: number]: number } = {};
          const monthCounts: { [month: number]: number } = {};

          chartData.forEach((d, idx) => {
            let m = -1;
            if (typeof d.date === "string" && d.date.includes("-")) {
              const parts = d.date.split("-");
              m = parseInt(parts[1], 10) - 1;
            } else {
              m = Math.min(11, Math.floor((idx / n) * 12));
            }
            if (m >= 0 && m < 12) {
              if (monthPositions[m] === undefined) {
                monthPositions[m] = idx;
                monthCounts[m] = 0;
              }
              monthCounts[m]++;
            }
          });

          for (let m = 0; m < 12; m++) {
            if (monthPositions[m] !== undefined) {
              const startIdx = monthPositions[m];
              const count = monthCounts[m] || 30;
              const centerIdx = startIdx + count * 0.45;
              const x = cL + (centerIdx / (n - 1)) * cW;

              // Month label text
              ctx.fillText(MONTH_NAMES[m], x, cB + 10);

              // Small tick above the label
              ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.3)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x, cB);
              ctx.lineTo(x, cB + 4);
              ctx.stroke();
            }
          }
        } else {
          // Shorter range: space 6-8 evenly spaced labels
          const step = Math.max(1, Math.floor(n / 6));
          for (let i = 0; i < n; i += step) {
            const x = cL + (i / Math.max(1, n - 1)) * cW;
            const labelStr = chartData[i].label || String(chartData[i].date);
            ctx.fillText(labelStr, x, cB + 10);
          }
        }
      }
    },
    [
      chartData,
      showYAxis,
      showXAxis,
      isDark,
      yMax,
      yTicks,
      brickHeight,
      brickGap,
      themeColors,
      yAxisFormatter,
    ]
  );

  // Resize handler using ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      renderChart();
    });

    ro.observe(container);
    renderChart();

    return () => {
      ro.disconnect();
    };
  }, [renderChart]);

  // Interactive Hover Handler
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || chartData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const W = rect.width;
    const H = rect.height;

    const PAD = {
      top: 18,
      right: showYAxis ? 52 : 16,
      bottom: showXAxis ? 32 : 12,
      left: 14,
    };

    const cL = PAD.left;
    const cR = W - PAD.right;
    const cW = cR - cL;

    if (mx < cL || mx > cR || my < PAD.top - 10 || my > H - PAD.bottom + 15) {
      setTooltipState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      renderChart();
      onHover?.(null);
      return;
    }

    const n = chartData.length;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(((mx - cL) / cW) * n)));
    const point = chartData[idx];

    // Compute tooltip position
    const tooltipX = Math.min(W - 170, Math.max(10, mx + 16));
    const tooltipY = Math.max(10, my - 60);

    setTooltipState({
      visible: true,
      x: tooltipX,
      y: tooltipY,
      point,
    });

    renderChart(idx);
    onHover?.(point);
  };

  const handleMouseLeave = () => {
    setTooltipState((prev) => ({ ...prev, visible: false }));
    renderChart();
    onHover?.(null);
  };

  return (
    <div
      className={cn(
        "relative flex flex-col w-full border font-mono select-none overflow-hidden",
        isDark ? "bg-[#0b0c0e] border-[#202228] text-white" : "bg-white border-zinc-200 text-zinc-900",
        className
      )}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      {/* Optional Title Header */}
      {(title || subtitle) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 text-xs">
          <div>
            {title && <span className="font-semibold uppercase tracking-wider">{title}</span>}
            {subtitle && <span className="text-muted-foreground ml-2">({subtitle})</span>}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
            Daily Activity • 365 Days Track
          </div>
        </div>
      )}

      {/* Canvas Wrap */}
      <div ref={containerRef} className="relative flex-1 w-full h-full min-h-[160px]">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="block w-full h-full cursor-crosshair"
        />

        {/* Floating Tooltip */}
        {tooltipState.visible && tooltipState.point && (
          <div
            ref={tooltipRef}
            className="absolute pointer-events-none z-30 transition-transform duration-75 ease-out shadow-2xl backdrop-blur-md px-3 py-2 border text-[11px]"
            style={{
              left: `${tooltipState.x}px`,
              top: `${tooltipState.y}px`,
              backgroundColor: isDark ? "rgba(13, 14, 18, 0.96)" : "rgba(255, 255, 255, 0.96)",
              borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
              color: isDark ? "#ffffff" : "#09090b",
            }}
          >
            <div className="text-[10px] text-muted-foreground font-medium pb-1 mb-1 border-b border-border/30">
              {tooltipState.point.label || String(tooltipState.point.date)}
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{metricLabel}:</span>
              <span className="font-semibold text-foreground">
                {tooltipValueFormatter(tooltipState.point.value)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DailyBrickBarChart;
