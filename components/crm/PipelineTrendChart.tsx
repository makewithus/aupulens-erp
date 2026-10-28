"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Loader2, Calendar } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { TradingLineChart, LineDataPoint } from "@/components/charts/TradingLineChart";
import { cn } from "@/lib/utils";

interface MonthlyPipelinePoint {
  monthKey: string;
  label: string;
  totalValue: number;
  weightedValue: number;
  byStage: Record<string, number>;
}

interface DailyPipelinePoint {
  date: string;
  value: number;
  weightedValue: number;
  count: number;
  byStage: Record<string, number>;
}

const STAGE_COLORS: Record<string, string> = {
  "Prospecting": "#6CADF5", // Brand Blue
  "Discovery": "#88C2FF", // Sky
  "Requirement Gathering": "#F1DF38", // Brand Yellow
  "Solution Fit": "#F6E668", // Gold
  "Proposal Sent": "#A77DFF", // Brand Purple
  "Negotiation": "#B595FF", // Lavender
  "Approval": "#F1DF38", // Warm Yellow
  "Closed Won": "#8AE06C", // Brand Green
  "Closed Lost": "#757575", // Secondary Grey
};
const FALLBACK_COLORS = ["#A77DFF", "#6CADF5", "#8AE06C", "#F1DF38", "#F56868", "#B595FF", "#88C2FF", "#757575"];
const stageColor = (stage: string, idx: number) => STAGE_COLORS[stage] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

const PRESET_DAYS = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
  { label: "1Y", days: 365 },
  { label: "ALL", days: 730 },
];

function formatCurrencyINR(v: number): string {
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + " L";
  if (v >= 1000) return "₹" + (v / 1000).toFixed(0) + "K";
  return "₹" + v.toLocaleString("en-IN");
}

export function PipelineTrendChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const [isAdvanced, setIsAdvanced] = useState(false); // false = Overview, true = By Stage
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<DailyPipelinePoint[]>([]);
  const [months, setMonths] = useState<MonthlyPipelinePoint[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [activeStageFilter, setActiveStageFilter] = useState<string | null>(null);

  // Time preset state for "By Stage" mode
  const [stagePreset, setStagePreset] = useState<string>("30D");
  const [stageCustomDays, setStageCustomDays] = useState<string>("");
  const [stageRange, setStageRange] = useState<[number, number]>([0, 30]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/crm/reports/pipeline-trend?months=12")
      .then((res) => res.json())
      .then((d) => {
        if (d.success && d.data) {
          if (d.data.dailyPoints && d.data.dailyPoints.length > 0) {
            setDailyData(d.data.dailyPoints);
          }
          if (d.data.months && d.data.months.length > 0) {
            setMonths(d.data.months);
          }
          if (Array.isArray(d.data.stages)) setStages(d.data.stages);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Display only persisted opportunity data. Sparse history is still sparse;
  // it must not be filled with synthetic points that imply business activity.
  const fullDailyDataset: DailyPipelinePoint[] = useMemo(() => {
    return dailyData;
  }, [dailyData]);

  // Sync initial range for "By Stage" mode
  useEffect(() => {
    const total = fullDailyDataset.length;
    const start = Math.max(0, total - 30);
    setStageRange([start, total]);
  }, [fullDailyDataset.length]);

  // Overview points for TradingLineChart
  const overviewPoints: LineDataPoint[] = useMemo(() => {
    return fullDailyDataset.map((d) => ({
      date: d.date,
      value: d.value,
      open: Math.round(d.value * 0.98),
      high: Math.round(d.value * 1.02),
      low: Math.round(d.value * 0.97),
      close: d.value,
      label: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [fullDailyDataset]);

  // Visible points for "By Stage" mode
  const [stageStartIdx, stageEndIdx] = stageRange;
  const stageRangeRef = useRef<[number, number]>(stageRange);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    stageRangeRef.current = stageRange;
  }, [stageRange]);
  const visibleStageData = useMemo(() => {
    return fullDailyDataset.slice(stageStartIdx, stageEndIdx);
  }, [fullDailyDataset, stageStartIdx, stageEndIdx]);

  // Stage preset selection
  const handleStageSelectPreset = (preset: typeof PRESET_DAYS[0]) => {
    setStagePreset(preset.label);
    const total = fullDailyDataset.length;
    const start = Math.max(0, total - preset.days);
    setStageRange([start, total]);
  };

  const handleStageCustomDaysApply = (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseInt(stageCustomDays, 10);
    if (!isNaN(days) && days >= 2) {
      setStagePreset(`Custom (${days}D)`);
      const total = fullDailyDataset.length;
      const start = Math.max(0, total - days);
      setStageRange([start, total]);
    }
  };

  const handleStageZoom = (dir: "in" | "out") => {
    setStageRange(([start, end]) => {
      const span = end - start;
      const step = Math.max(2, Math.round(span * 0.25));
      if (dir === "in") {
        if (span <= 6) return [start, end];
        return [Math.min(end - 6, start + step), end];
      } else {
        const newStart = Math.max(0, start - step);
        return [newStart, end];
      }
    });
  };

  const handleStageReset = () => {
    setStagePreset("30D");
    const total = fullDailyDataset.length;
    const start = Math.max(0, total - 30);
    setStageRange([start, total]);
  };

  // Render canvas for "By Stage" mode
  useEffect(() => {
    if (!isAdvanced || visibleStageData.length === 0) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !container || !tooltip) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = visibleStageData.length;
    const availableStages = stages.length > 0
      ? stages
      : Array.from(new Set(visibleStageData.flatMap((point) => Object.keys(point.byStage || {}))));
    const activeStages = activeStageFilter
      ? [activeStageFilter]
      : availableStages;

    // Stacked calculations
    const stacked: number[][] = [];
    for (let i = 0; i < n; i++) {
      let cumulative = 0;
      const row: number[] = [];
      for (let s = 0; s < activeStages.length; s++) {
        const stageName = activeStages[s];
        const val = visibleStageData[i].byStage[stageName] || 0;
        cumulative += val;
        row.push(cumulative);
      }
      stacked.push(row);
    }

    const maxVal = Math.max(
      ...stacked.map((row) => (row.length > 0 ? row[row.length - 1] : 0)),
      100000
    );
    const yMax = Math.ceil(maxVal / 100000) * 100000 || 100000;
    const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

    const PAD = { top: 20, right: 70, bottom: 30, left: 10 };

    function resize() {
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw(highlightIdx?: number) {
      if (!ctx || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const chartL = PAD.left,
        chartR = W - PAD.right,
        chartT = PAD.top,
        chartB = H - PAD.bottom;
      const chartW = chartR - chartL,
        chartH = chartB - chartT;

      // Background grid lines & Y labels
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      yTicks.forEach((v) => {
        const y = chartB - (v / yMax) * chartH;
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartL, y);
        ctx.lineTo(chartR, y);
        ctx.stroke();

        ctx.fillStyle = isDark ? "#888888" : "#666666";
        ctx.fillText(formatCurrencyINR(v), chartR + 64, y);
      });

      // X Axis dates
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xStep = Math.max(1, Math.floor(n / 6));
      for (let i = 0; i < n; i += xStep) {
        const pt = visibleStageData[i];
        const x = chartL + (n === 1 ? 0.5 : i / (n - 1)) * chartW;
        const dObj = new Date(pt.date + "T00:00:00");
        const lbl = dObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        ctx.fillStyle = isDark ? "#888888" : "#666666";
        ctx.fillText(lbl, x, chartB + 8);
      }

      // Draw Stacked Stage Areas (back to front)
      for (let s = activeStages.length - 1; s >= 0; s--) {
        const color = stageColor(activeStages[s], s);

        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = chartL + (n === 1 ? 0.5 : i / (n - 1)) * chartW;
          const y = chartB - (stacked[i][s] / yMax) * chartH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = n - 1; i >= 0; i--) {
          const x = chartL + (n === 1 ? 0.5 : i / (n - 1)) * chartW;
          const bottomVal = s > 0 ? stacked[i][s - 1] : 0;
          const y = chartB - (bottomVal / yMax) * chartH;
          ctx.lineTo(x, y);
        }
        ctx.closePath();

        // Translucent gradient fill
        const grad = ctx.createLinearGradient(0, chartT, 0, chartB);
        grad.addColorStop(0, color + "66");
        grad.addColorStop(1, color + "11");
        ctx.fillStyle = grad;
        ctx.fill();

        // Glowing border stroke
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = chartL + (n === 1 ? 0.5 : i / (n - 1)) * chartW;
          const y = chartB - (stacked[i][s] / yMax) * chartH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Hover Crosshair & Dots
      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < n) {
        const x = chartL + (n === 1 ? 0.5 : highlightIdx / (n - 1)) * chartW;

        // Vertical crosshair
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, chartT);
        ctx.lineTo(x, chartB);
        ctx.stroke();
        ctx.setLineDash([]);

        // Interactive Stage Dots
        for (let s = 0; s < activeStages.length; s++) {
          const color = stageColor(activeStages[s], s);
          const y = chartB - (stacked[highlightIdx][s] / yMax) * chartH;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = isDark ? "#141414" : "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const chartL = PAD.left,
        chartR = W - PAD.right,
        chartW = chartR - chartL;

      if (mx < chartL || mx > chartR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const ratio = (mx - chartL) / chartW;
      const idx = Math.round(ratio * (n - 1));
      if (idx < 0 || idx >= n) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const point = visibleStageData[idx];
      const dObj = new Date(point.date + "T00:00:00");
      const fullDateStr = dObj.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const headerBorder = isDark ? "border-[#272727]" : "border-[#e5e5e5]";
      const headerDate = isDark ? "text-[#757575]" : "text-[#6B7280]";
      const headerVal = isDark ? "text-[#F2F2F2]" : "text-[#111827]";
      const stageNameCol = isDark ? "text-[#F2F2F2]" : "text-[#374151]";
      const stageValCol = isDark ? "text-[#F2F2F2]" : "text-[#111827]";

      let tooltipHtml = `
        <div class="text-[10px] uppercase font-mono pb-1 border-b ${headerBorder} mb-1.5 flex justify-between gap-4">
          <span class="${headerDate}">${fullDateStr}</span>
          <span class="${headerVal} font-bold">${formatCurrencyINR(point.value)}</span>
        </div>
        <div class="space-y-1">
      `;

      activeStages.forEach((st, sIdx) => {
        const val = point.byStage[st] || 0;
        const color = stageColor(st, sIdx);
        tooltipHtml += `
          <div class="flex items-center justify-between gap-3 text-[11px]">
            <span class="flex items-center gap-1.5 ${stageNameCol}">
              <span class="w-2 h-2 rounded-[1px] inline-block" style="background:${color}"></span>
              ${st}
            </span>
            <span class="font-mono ${stageValCol} font-semibold">${formatCurrencyINR(val)}</span>
          </div>
        `;
      });
      tooltipHtml += `</div>`;

      tooltip.innerHTML = tooltipHtml;
      tooltip.style.display = "block";

      const tipX = mx + 16;
      tooltip.style.left = (tipX + 220 > W ? mx - 230 : tipX) + "px";
      tooltip.style.top = Math.max(10, e.clientY - rect.top - 80) + "px";

      draw(idx);
    };

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw();
    };

    // Smooth, firm, controlled wheel zoom for "By Stage"
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const totalLen = fullDailyDataset.length;
      if (totalLen <= 1) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const PAD_LEFT = 10;
      const PAD_RIGHT = 70;
      const cW = Math.max(10, rect.width - PAD_LEFT - PAD_RIGHT);
      const mouseRatio = Math.max(0, Math.min(1, (mx - PAD_LEFT) / cW));

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 28;
      else if (e.deltaMode === 2) dy *= 120;

      const clampedDelta = Math.max(-100, Math.min(100, dy));
      const [start, end] = stageRangeRef.current;
      const span = end - start;
      const minSpan = 5;
      const maxSpan = totalLen;

      const sensitivity = 0.0015;
      const factor = Math.exp(clampedDelta * sensitivity);
      let newSpan = Math.round(span * factor);

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

      const centerIdx = start + mouseRatio * span;
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

      stageRangeRef.current = [newStart, newEnd];

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          setStageRange([...stageRangeRef.current]);
        });
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("resize", resize);

    setTimeout(resize, 60);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", resize);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [
    isAdvanced,
    visibleStageData,
    activeStageFilter,
    stages,
    isDark,
  ]);

  return (
    <div
      className={cn(
        "rounded-lg border font-mono w-full relative transition-colors duration-200",
        isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-[#e5e5e5] text-foreground"
      )}
    >
      {/* ── Top Header Strip ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 border-b border-[#272727]/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8AE06C] animate-pulse"></span>
            <h2 className="text-base font-semibold uppercase tracking-wider">
              Sales Pipeline Trend
            </h2>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#A77DFF]/15 text-[#A77DFF] border border-[#A77DFF]/30">
              Live Daily
            </span>
          </div>
          <p className="text-[11px] text-[#757575] mt-0.5">
            Continuous daily pipeline value created · Real-time opportunity velocity
          </p>
        </div>

        {/* ── Mode Toggle: Overview vs By Stage ── */}
        <div className={cn("flex items-center gap-2 p-1 rounded-md border text-xs", isDark ? "bg-[#161616] border-[#272727]" : "bg-[#f4f4f5] border-[#e5e5e5]")}>
          <button
            onClick={() => setIsAdvanced(false)}
            className={cn(
              "px-3 py-1 rounded transition-all font-medium cursor-pointer",
              !isAdvanced
                ? isDark
                  ? "bg-[#272727] text-[#F2F2F2] border border-[#525252] shadow-sm"
                  : "bg-white text-foreground border-[#d4d4d8] shadow-sm font-semibold"
                : "text-[#757575] hover:text-[#F2F2F2]"
            )}
          >
            Overview Line
          </button>
          <button
            onClick={() => setIsAdvanced(true)}
            className={cn(
              "px-3 py-1 rounded transition-all font-medium cursor-pointer",
              isAdvanced
                ? isDark
                  ? "bg-[#272727] text-[#F2F2F2] border border-[#525252] shadow-sm"
                  : "bg-white text-foreground border-[#d4d4d8] shadow-sm font-semibold"
                : "text-[#757575] hover:text-[#F2F2F2]"
            )}
          >
            By Stage Breakdown
          </button>
        </div>
      </div>

      {/* ── Content View ── */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[460px] gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-white" />
          Loading pipeline telemetry…
        </div>
      ) : fullDailyDataset.length === 0 ? (
        <div className="flex min-h-[460px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No opportunity history is available for this period.
        </div>
      ) : !isAdvanced ? (
        /* ── Overview Mode: Binance TradingLineChart ── */
        <div className="p-3">
          <TradingLineChart
            data={overviewPoints}
            valueKey="value"
            dateKey="date"
            metricLabel="Pipeline Value"
            title="SALES PIPELINE TREND"
            currencyPrefix="₹"
            colorTheme="white"
            height={440}
            showTopStats={true}
            showToolbar={true}
            showMA={true}
            isDark={isDark}
          />
        </div>
      ) : (
        /* ── By Stage Mode: Multi-Stage Stacked Area ── */
        <div className="p-4 space-y-3">
          {/* Timeframe Presets & Custom Days Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase mr-1">Timeframe:</span>
              {PRESET_DAYS.map((preset) => {
                const isActive = stagePreset === preset.label;
                return (
                  <button
                    key={preset.label}
                    onClick={() => handleStageSelectPreset(preset)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded transition-colors font-medium cursor-pointer border",
                      isActive
                        ? "bg-white/20 text-white border-white/50 shadow-sm"
                        : "bg-transparent text-muted-foreground border-transparent hover:text-white hover:bg-white/5"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}

              {/* Custom days input */}
              <form onSubmit={handleStageCustomDaysApply} className="flex items-center gap-1 ml-2">
                <input
                  type="number"
                  min="2"
                  max="730"
                  placeholder="Custom days..."
                  value={stageCustomDays}
                  onChange={(e) => setStageCustomDays(e.target.value)}
                  className={cn(
                    "w-24 px-2 py-0.5 text-xs rounded placeholder:text-[#757575] focus:outline-none focus:border-[#A77DFF]",
                    isDark ? "bg-[#161616] border border-[#272727] text-[#F2F2F2]" : "bg-white border border-[#d4d4d8] text-foreground"
                  )}
                />
                <button
                  type="submit"
                  className={cn(
                    "px-2 py-0.5 text-xs rounded transition-colors cursor-pointer border",
                    isDark
                      ? "bg-[#272727] text-[#F2F2F2] border-[#525252] hover:bg-[#333333]"
                      : "bg-[#f4f4f5] text-foreground border-[#d4d4d8] hover:bg-[#e4e4e7]"
                  )}
                >
                  Apply
                </button>
              </form>
            </div>

            {/* Hint for mouse wheel zoom & drag */}
            <div className="text-[10px] text-muted-foreground hidden sm:block">
              Mouse Wheel to Zoom • Drag to Pan
            </div>
          </div>

          {/* Stage Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40 text-[11px]">
            <button
              onClick={() => setActiveStageFilter(null)}
              className={cn(
                "px-2 py-0.5 rounded cursor-pointer transition-colors border",
                activeStageFilter === null
                  ? "bg-white/20 text-white border-white/50 font-semibold shadow-sm"
                  : "text-muted-foreground border-border/40 hover:text-white"
              )}
            >
              All Stages
            </button>
            {stages.map((st, sIdx) => {
              const isSelected = activeStageFilter === st;
              const col = stageColor(st, sIdx);
              return (
                <button
                  key={st}
                  onClick={() => setActiveStageFilter(isSelected ? null : st)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors border",
                    isSelected
                      ? "bg-white/10 text-white border-white/30 font-semibold"
                      : "text-muted-foreground border-border/40 hover:text-white"
                  )}
                >
                  <span className="w-2 h-2 rounded-[1px] inline-block" style={{ backgroundColor: col }} />
                  {st}
                </button>
              );
            })}
          </div>

          {/* Interactive Stacked Canvas */}
          <div
            ref={containerRef}
            className="relative w-full h-[400px] touch-none"
            style={{ touchAction: "none", overscrollBehavior: "contain" }}
          >
            <canvas
              ref={canvasRef}
              onDoubleClick={handleStageReset}
              className="block w-full h-full cursor-crosshair touch-none"
              style={{ touchAction: "none", overscrollBehavior: "contain" }}
              title="Mouse wheel to zoom in/out • Click and drag to pan • Double-click to reset"
            ></canvas>
            <div
              ref={tooltipRef}
              className={cn(
                "absolute pointer-events-none p-3 font-mono text-[11px] shadow-2xl rounded-md hidden z-20 border backdrop-blur-md",
                isDark ? "bg-[#161616]/95 border-[#272727] text-[#F2F2F2]" : "bg-white/95 border-[#e5e5e5] text-foreground"
              )}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}
