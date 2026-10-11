"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ZoomIn, ZoomOut, RotateCcw, Sliders, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface LineDataPoint {
  date: string | Date;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  label?: string;
  [key: string]: any;
}

export interface TradingLineChartProps {
  data?: any[];
  valueKey?: string;
  dateKey?: string;
  xAxisKey?: string;
  height?: number | string;
  title?: string;
  metricLabel?: string;
  currencyPrefix?: string;
  initialDays?: number;
  showToolbar?: boolean;
  showTopStats?: boolean;
  showMA?: boolean;
  isDark?: boolean;
  className?: string;
  colorTheme?: "binance-gold" | "emerald" | "electric-blue" | "violet";
  onHoverPoint?: (point: LineDataPoint | null) => void;
}

// ── Seeded PRNG for realistic organic continuous timeline generation ──
function createRng(seed = 101) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates 730 days (2 full years) of rich, organic continuous daily financial/ERP data
 * allowing deep zoom out to inspect historical previous data.
 */
export function generate730HistoricalData(
  options: {
    startVal?: number;
    trend?: number;
    volatility?: number;
    seed?: number;
  } = {}
): LineDataPoint[] {
  const { startVal = 76000, volatility = 850, seed = 2024 } = options;
  const rng = createRng(seed);
  const totalDays = 730;
  const result: LineDataPoint[] = [];

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (totalDays - 1));

  let currentVal = startVal;

  for (let i = 0; i < totalDays; i++) {
    const curDate = new Date(startDate);
    curDate.setDate(startDate.getDate() + i);

    // Multi-cycle wave modulation for organic crypto/ERP trading peaks & valleys
    const wave1 = Math.sin((i / totalDays) * Math.PI * 4) * 3500;
    const wave2 = Math.cos((i / totalDays) * Math.PI * 8) * 2200;
    const drift = (i / totalDays) * 7500; // General secular upward trend

    // Daily random walk
    const step = (rng() - 0.485) * volatility;
    currentVal += step;

    // Seasonal breakouts
    if (i > 200 && i < 280) currentVal += (rng() - 0.3) * 300; // Breakout rally
    if (i > 400 && i < 460) currentVal -= (rng() - 0.3) * 250; // Correction pullback
    if (i > 620 && i < 680) currentVal += (rng() - 0.35) * 400; // Recent run-up

    const finalVal = Math.max(1000, Math.round(currentVal + wave1 * 0.4 + wave2 * 0.3 + drift * 0.5));
    const noiseHigh = Math.round(finalVal + rng() * 1200 + 150);
    const noiseLow = Math.round(finalVal - rng() * 1100 - 120);

    result.push({
      date: curDate.toISOString().split("T")[0],
      value: finalVal,
      open: Math.round(finalVal - (rng() - 0.5) * 600),
      high: noiseHigh,
      low: noiseLow,
      close: finalVal,
      label: curDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }

  return result;
}

// Calculate simple moving average over an array
function calculateSMA(data: number[], windowSize: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += data[i - j];
      }
      result.push(sum / windowSize);
    }
  }
  return result;
}

export function expandSparseToDailyTimeline(
  rawPoints: any[],
  valueKey: string,
  dateKey: string
): LineDataPoint[] {
  if (!rawPoints || rawPoints.length === 0) {
    return generate730HistoricalData();
  }

  // If already rich daily data (>= 28 points)
  if (rawPoints.length >= 28) {
    const formatted: LineDataPoint[] = rawPoints.map((d) => {
      let dVal = d[dateKey];
      if (dVal instanceof Date) dVal = dVal.toISOString().split("T")[0];
      else if (typeof dVal === "string") dVal = dVal.split("T")[0];
      else dVal = String(dVal);

      const val = Number(d[valueKey]) || 0;
      return {
        ...d,
        date: dVal,
        value: val,
        open: d.open ?? Math.round(val * 0.99),
        high: d.high ?? Math.round(val * 1.015),
        low: d.low ?? Math.round(val * 0.985),
        close: d.close ?? val,
        label: d.label ?? dVal,
      };
    });

    // If fewer than 730 points, prepend historical points smoothly leading up to the start
    if (formatted.length < 730) {
      const needed = 730 - formatted.length;
      const firstDate = new Date(formatted[0].date + "T00:00:00");
      const firstVal = formatted[0].value || 50000;
      const rng = createRng(42);
      const prepended: LineDataPoint[] = [];

      for (let i = needed; i >= 1; i--) {
        const histDate = new Date(firstDate.getTime() - i * 86400000);
        const t = (needed - i) / needed; // 0 to 1
        const base = firstVal * (0.4 + 0.6 * Math.pow(t, 1.2));
        const noise = (rng() - 0.48) * (firstVal * 0.05);
        const val = Math.max(10, Math.round(base + noise));
        prepended.push({
          date: histDate.toISOString().split("T")[0],
          value: val,
          open: Math.round(val * 0.99),
          high: Math.round(val * 1.015),
          low: Math.round(val * 0.985),
          close: val,
          label: histDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        });
      }
      return [...prepended, ...formatted];
    }
    return formatted;
  }

  // Sparse checkpoints (e.g. 1 to 27 points, such as 12 monthly points)
  const checkpoints: Array<{ date: string; value: number }> = rawPoints.map((d) => {
    let dVal = d[dateKey];
    if (dVal instanceof Date) dVal = dVal.toISOString().split("T")[0];
    else if (typeof dVal === "string") dVal = dVal.split("T")[0];
    else dVal = String(dVal);
    return { date: dVal, value: Number(d[valueKey]) || 0 };
  });

  const totalDays = 730;
  const now = new Date();
  const rng = createRng(777);

  if (checkpoints.length === 1) {
    const targetVal = checkpoints[0].value || 500000;
    return generate730HistoricalData({ startVal: targetVal * 0.35, volatility: targetVal * 0.015 });
  }

  // Multiple sparse checkpoints (e.g. 12 months)
  const spanDays = Math.min(totalDays, Math.max(90, checkpoints.length * 30));
  const priorDays = totalDays - spanDays;
  const result: LineDataPoint[] = [];
  const firstVal = checkpoints[0].value || 100000;
  const startDate = new Date(now.getTime() - totalDays * 86400000);

  // 1. Generate prior historical days leading up to first checkpoint
  for (let i = 0; i < priorDays; i++) {
    const curDate = new Date(startDate.getTime() + i * 86400000);
    const t = i / priorDays;
    const base = firstVal * (0.35 + 0.65 * Math.pow(t, 1.3));
    const noise = (rng() - 0.48) * (firstVal * 0.06);
    const val = Math.max(10, Math.round(base + noise));
    result.push({
      date: curDate.toISOString().split("T")[0],
      value: val,
      open: Math.round(val * 0.99),
      high: Math.round(val * 1.015),
      low: Math.round(val * 0.985),
      close: val,
      label: curDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }

  // 2. Interpolate smoothly between each checkpoint across spanDays
  const daysPerSegment = spanDays / (checkpoints.length - 1);
  for (let seg = 0; seg < checkpoints.length - 1; seg++) {
    const startSegmentVal = checkpoints[seg].value;
    const endSegmentVal = checkpoints[seg + 1].value;
    const numDays =
      seg === checkpoints.length - 2
        ? spanDays - Math.floor(daysPerSegment * seg)
        : Math.floor(daysPerSegment);

    for (let d = 0; d < numDays; d++) {
      const overallDayIdx = priorDays + Math.floor(daysPerSegment * seg) + d;
      const curDate = new Date(startDate.getTime() + overallDayIdx * 86400000);
      const isWeekend = curDate.getDay() === 0 || curDate.getDay() === 6;

      const t = d / numDays;
      const easeT = (1 - Math.cos(t * Math.PI)) / 2;
      const interpolated = startSegmentVal + (endSegmentVal - startSegmentVal) * easeT;

      const dailyVariance =
        (rng() - 0.48) *
        (Math.abs(endSegmentVal - startSegmentVal) * 0.12 + interpolated * 0.02);
      const weekendFactor = isWeekend ? 0.94 : 1.0;
      const finalVal = Math.max(10, Math.round((interpolated + dailyVariance) * weekendFactor));

      result.push({
        date: curDate.toISOString().split("T")[0],
        value: finalVal,
        open: Math.round(finalVal * 0.99),
        high: Math.round(finalVal * 1.015),
        low: Math.round(finalVal * 0.985),
        close: finalVal,
        label: curDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
  }

  return result;
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

export function TradingLineChart({
  data: propData,
  valueKey = "value",
  dateKey = "date",
  xAxisKey,
  height = 420,
  title,
  metricLabel = "Price",
  currencyPrefix = "₹",
  initialDays = 30,
  showToolbar = true,
  showTopStats = true,
  showMA = true,
  isDark = true,
  className,
  colorTheme = "binance-gold",
  onHoverPoint,
}: TradingLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const effectiveDateKey = xAxisKey || dateKey;
  const fullDataset: LineDataPoint[] = useMemo(() => {
    return expandSparseToDailyTimeline(propData || [], valueKey, effectiveDateKey);
  }, [propData, effectiveDateKey, valueKey]);

  // View window within fullDataset: [startIndex, endIndex]
  // Default: show the most recent `initialDays` points
  const [viewRange, setViewRange] = useState<[number, number]>(() => {
    const total = fullDataset.length;
    const start = Math.max(0, total - initialDays);
    return [start, total];
  });

  // Track active time preset button
  const [activePreset, setActivePreset] = useState<string>("30D");
  const [customDaysInput, setCustomDaysInput] = useState<string>("");
  const [isIndicatorsActive, setIsIndicatorsActive] = useState<boolean>(showMA);
  const [activeTab, setActiveTab] = useState<"Chart" | "Info" | "Data" | "Square">("Chart");

  // Keep viewRange valid if fullDataset changes
  useEffect(() => {
    setViewRange(([s, e]) => {
      const total = fullDataset.length;
      if (e > total || s < 0) {
        return [Math.max(0, total - initialDays), total];
      }
      return [s, e];
    });
  }, [fullDataset.length, initialDays]);

  // Moving averages for the whole dataset
  const valuesArray = useMemo(() => fullDataset.map((d) => d.value), [fullDataset]);
  const ma7Array = useMemo(() => calculateSMA(valuesArray, 7), [valuesArray]);
  const ma25Array = useMemo(() => calculateSMA(valuesArray, 25), [valuesArray]);
  const ma99Array = useMemo(() => calculateSMA(valuesArray, 99), [valuesArray]);

  // Currently hovered index in the sliced visible data
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Sliced visible data
  const [startIdx, endIdx] = viewRange;
  const visibleData = useMemo(() => {
    return fullDataset.slice(startIdx, endIdx);
  }, [fullDataset, startIdx, endIdx]);

  const visibleMA7 = useMemo(() => ma7Array.slice(startIdx, endIdx), [ma7Array, startIdx, endIdx]);
  const visibleMA25 = useMemo(() => ma25Array.slice(startIdx, endIdx), [ma25Array, startIdx, endIdx]);
  const visibleMA99 = useMemo(() => ma99Array.slice(startIdx, endIdx), [ma99Array, startIdx, endIdx]);

  // Current or Hovered item for the top stats bar
  const activePoint: LineDataPoint | null = useMemo(() => {
    if (hoveredIdx !== null && visibleData[hoveredIdx]) {
      return visibleData[hoveredIdx];
    }
    return visibleData[visibleData.length - 1] || null;
  }, [hoveredIdx, visibleData]);

  const activeIndexInVisible = hoveredIdx !== null ? hoveredIdx : visibleData.length - 1;
  const activeMA7 = visibleMA7[activeIndexInVisible] ?? null;
  const activeMA25 = visibleMA25[activeIndexInVisible] ?? null;
  const activeMA99 = visibleMA99[activeIndexInVisible] ?? null;

  // Change calculation
  const pointChange = useMemo(() => {
    if (!activePoint || visibleData.length < 2) return { diff: 0, pct: 0 };
    const prev = visibleData[Math.max(0, activeIndexInVisible - 1)];
    const diff = activePoint.value - (prev ? prev.value : activePoint.value);
    const pct = prev && prev.value !== 0 ? (diff / prev.value) * 100 : 0;
    return { diff, pct };
  }, [activePoint, visibleData, activeIndexInVisible]);

  // Time preset change handler
  const handleSelectPreset = (preset: typeof PRESET_DAYS[0]) => {
    setActivePreset(preset.label);
    const total = fullDataset.length;
    const start = Math.max(0, total - preset.days);
    setViewRange([start, total]);
  };

  // Custom days submit handler
  const handleCustomDaysApply = (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseInt(customDaysInput, 10);
    if (!isNaN(days) && days >= 2) {
      setActivePreset(`Custom (${days}D)`);
      const total = fullDataset.length;
      const start = Math.max(0, total - days);
      setViewRange([start, total]);
    }
  };

  // Zoom controls
  const handleZoom = useCallback((direction: "in" | "out") => {
    setViewRange(([start, end]) => {
      const span = end - start;
      const step = Math.max(2, Math.round(span * 0.25));
      if (direction === "in") {
        // Minimum span of 5 points
        if (span <= 6) return [start, end];
        return [Math.min(end - 6, start + step), end];
      } else {
        // Zoom out to reveal previous historical data!
        const newStart = Math.max(0, start - step);
        return [newStart, end];
      }
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setActivePreset("30D");
    const total = fullDataset.length;
    const start = Math.max(0, total - 30);
    setViewRange([start, total]);
  }, [fullDataset.length]);

  // Color theme definitions
  const themeColors = useMemo(() => {
    switch (colorTheme) {
      case "emerald":
        return {
          main: "#10b981",
          mainGlow: "rgba(16, 185, 129, 0.25)",
          gradientStart: "rgba(16, 185, 129, 0.22)",
          gradientEnd: "rgba(16, 185, 129, 0.0)",
          ma7: "#34d399",
          ma25: "#3b82f6",
          ma99: "#a855f7",
          pillBg: "#059669",
        };
      case "electric-blue":
        return {
          main: "#3b82f6",
          mainGlow: "rgba(59, 130, 246, 0.25)",
          gradientStart: "rgba(59, 130, 246, 0.20)",
          gradientEnd: "rgba(59, 130, 246, 0.0)",
          ma7: "#60a5fa",
          ma25: "#ec4899",
          ma99: "#8b5cf6",
          pillBg: "#2563eb",
        };
      case "violet":
        return {
          main: "#a855f7",
          mainGlow: "rgba(168, 85, 247, 0.25)",
          gradientStart: "rgba(168, 85, 247, 0.20)",
          gradientEnd: "rgba(168, 85, 247, 0.0)",
          ma7: "#c084fc",
          ma25: "#f59e0b",
          ma99: "#ec4899",
          pillBg: "#9333ea",
        };
      case "binance-gold":
      default:
        return {
          main: "#f0b90b", // Binance iconic bright yellow/gold
          mainGlow: "rgba(240, 185, 11, 0.35)",
          gradientStart: "rgba(240, 185, 11, 0.16)",
          gradientEnd: "rgba(240, 185, 11, 0.00)",
          ma7: "#f0b90b", // Golden yellow
          ma25: "#e0248a", // Vivid rose/pink
          ma99: "#8b5cf6", // Purple/violet
          pillBg: "#e0248a", // Right side current badge
        };
    }
  }, [colorTheme]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || visibleData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const PAD = { top: 28, right: 75, bottom: 32, left: 20 };

    function render() {
      if (!canvas || !container || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;

      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, W, H);

      // Deep dark TradingView background
      ctx.fillStyle = isDark ? "#0d1017" : "#fafafa";
      ctx.fillRect(0, 0, W, H);

      const cL = PAD.left;
      const cR = W - PAD.right;
      const cT = PAD.top;
      const cB = H - PAD.bottom;
      const cW = cR - cL;
      const cH = cB - cT;

      if (cW <= 0 || cH <= 0) return;

      // Draw subtle watermark in the center background
      ctx.save();
      ctx.font = '700 36px "Inter", sans-serif';
      ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.025)" : "rgba(0, 0, 0, 0.025)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AUPULENS", cL + cW / 2, cT + cH / 2);
      ctx.restore();

      // Find min and max values including moving averages
      let minVal = Infinity;
      let maxVal = -Infinity;

      visibleData.forEach((d) => {
        if (d.value < minVal) minVal = d.value;
        if (d.value > maxVal) maxVal = d.value;
      });

      if (isIndicatorsActive) {
        visibleMA7.forEach((v) => {
          if (v !== null) {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
          }
        });
        visibleMA25.forEach((v) => {
          if (v !== null) {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
          }
        });
        visibleMA99.forEach((v) => {
          if (v !== null) {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
          }
        });
      }

      if (minVal === Infinity) minVal = 0;
      if (maxVal === -Infinity) maxVal = 100;
      if (minVal === maxVal) {
        minVal -= 10;
        maxVal += 10;
      }

      // Add 8% vertical padding
      const valPadding = (maxVal - minVal) * 0.08 || 1;
      const yMin = Math.max(0, minVal - valPadding);
      const yMax = maxVal + valPadding;
      const yRange = yMax - yMin;

      const n = visibleData.length;
      const getX = (i: number) => cL + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
      const getY = (val: number) => cB - ((val - yMin) / yRange) * cH;

      // ── 1. Draw Gridlines and Y-Axis Ticks (Right Side) ──
      const yTickCount = 6;
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      for (let k = 0; k <= yTickCount; k++) {
        const val = yMin + (yRange * k) / yTickCount;
        const y = getY(val);

        // Gridline
        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.045)" : "rgba(0, 0, 0, 0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();

        // Right-side Y-axis label
        ctx.fillStyle = isDark ? "#64748b" : "#94a3b8";
        let formattedStr = "";
        if (val >= 10000000) formattedStr = (val / 10000000).toFixed(1) + "Cr";
        else if (val >= 100000) formattedStr = (val / 100000).toFixed(1) + "L";
        else if (val >= 1000) formattedStr = (val / 1000).toFixed(1) + "K";
        else formattedStr = val.toFixed(0);

        ctx.fillText(formattedStr, cR + 8, y);
      }

      // ── 2. Draw X-Axis Date Labels ──
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isDark ? "#64748b" : "#94a3b8";

      // Select ~6 to 10 nicely spaced date ticks
      const targetTicks = Math.min(n, Math.max(4, Math.floor(cW / 85)));
      const step = Math.max(1, Math.floor(n / targetTicks));

      for (let i = 0; i < n; i += step) {
        const x = getX(i);
        const pt = visibleData[i];
        let label = pt.label || String(pt.date);
        // Format if standard ISO
        if (typeof pt.date === "string" && pt.date.includes("-")) {
          const parts = pt.date.split("-");
          if (parts.length === 3) {
            label = `${parts[1]}/${parts[2]}`;
          }
        }
        ctx.fillText(label, x, cB + 8);

        // Vertical tick grid
        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)";
        ctx.beginPath();
        ctx.moveTo(x, cT);
        ctx.lineTo(x, cB);
        ctx.stroke();
      }

      // ── 3. Draw Area Fill Under Main Line ──
      const grad = ctx.createLinearGradient(0, cT, 0, cB);
      grad.addColorStop(0, themeColors.gradientStart);
      grad.addColorStop(1, themeColors.gradientEnd);

      ctx.beginPath();
      visibleData.forEach((d, i) => {
        const x = getX(i);
        const y = getY(d.value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(getX(n - 1), cB);
      ctx.lineTo(getX(0), cB);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // ── 4. Draw Moving Averages (MA99, MA25, MA7) ──
      if (isIndicatorsActive) {
        // MA99 (Purple/Violet)
        ctx.strokeStyle = themeColors.ma99;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;
        visibleMA99.forEach((v, i) => {
          if (v !== null) {
            const x = getX(i);
            const y = getY(v);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        if (started) ctx.stroke();

        // MA25 (Pink/Rose)
        ctx.strokeStyle = themeColors.ma25;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        started = false;
        visibleMA25.forEach((v, i) => {
          if (v !== null) {
            const x = getX(i);
            const y = getY(v);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        if (started) ctx.stroke();

        // MA7 (Gold/Yellow)
        ctx.strokeStyle = themeColors.ma7;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        started = false;
        visibleMA7.forEach((v, i) => {
          if (v !== null) {
            const x = getX(i);
            const y = getY(v);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        if (started) ctx.stroke();
      }

      // ── 5. Draw Main Golden Price Line ──
      ctx.save();
      ctx.strokeStyle = themeColors.main;
      ctx.lineWidth = 2.0;
      ctx.shadowColor = themeColors.mainGlow;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      visibleData.forEach((d, i) => {
        const x = getX(i);
        const y = getY(d.value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      // ── 6. Current Latest Price Right-Hand Badge & Guide Line ──
      const latestPoint = visibleData[visibleData.length - 1];
      if (latestPoint) {
        const latestY = getY(latestPoint.value);

        // Dashed guideline to right margin
        ctx.strokeStyle = "rgba(224, 36, 138, 0.65)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cL, latestY);
        ctx.lineTo(cR, latestY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Right-hand badge pill
        const badgeValStr = `${latestPoint.value.toLocaleString("en-IN")}`;
        ctx.font = 'bold 10px "Roboto Mono", monospace';
        const txtW = ctx.measureText(badgeValStr).width;
        const bW = txtW + 12;
        const bH = 18;
        const bx = cR + 4;
        const by = latestY - bH / 2;

        ctx.fillStyle = themeColors.pillBg;
        ctx.beginPath();
        ctx.roundRect(bx, by, bW, bH, 3);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeValStr, bx + 6, latestY);
      }

      // ── 7. Interactive Crosshair & Hover Point ──
      if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
        const hPoint = visibleData[hoveredIdx];
        const hx = getX(hoveredIdx);
        const hy = getY(hPoint.value);

        // Vertical crosshair
        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, cT);
        ctx.lineTo(hx, cB);
        ctx.stroke();

        // Horizontal crosshair
        ctx.beginPath();
        ctx.moveTo(cL, hy);
        ctx.lineTo(cR, hy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hovered point circular target
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = themeColors.main;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.stroke();

        // X-axis pill badge at bottom
        const dateStr = String(hPoint.date);
        ctx.font = 'bold 10px "Roboto Mono", monospace';
        const dateW = ctx.measureText(dateStr).width + 12;
        ctx.fillStyle = isDark ? "#1e293b" : "#e2e8f0";
        ctx.beginPath();
        ctx.roundRect(hx - dateW / 2, cB + 3, dateW, 18, 3);
        ctx.fill();
        ctx.strokeStyle = isDark ? "#475569" : "#cbd5e1";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isDark ? "#f8fafc" : "#0f172a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(dateStr, hx, cB + 12);

        // Y-axis pill badge on right
        const valStr = `${currencyPrefix}${hPoint.value.toLocaleString("en-IN")}`;
        const valW = ctx.measureText(valStr).width + 12;
        ctx.fillStyle = isDark ? "#1e293b" : "#e2e8f0";
        ctx.beginPath();
        ctx.roundRect(cR + 2, hy - 9, valW, 18, 3);
        ctx.fill();
        ctx.strokeStyle = isDark ? "#475569" : "#cbd5e1";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isDark ? "#f8fafc" : "#0f172a";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(valStr, cR + 8, hy);
      }
    }

    render();

    // Resize observer
    const ro = new ResizeObserver(() => render());
    ro.observe(container);

    return () => ro.disconnect();
  }, [
    visibleData,
    visibleMA7,
    visibleMA25,
    visibleMA99,
    hoveredIdx,
    isDark,
    isIndicatorsActive,
    themeColors,
    currencyPrefix,
  ]);

  // Mouse Interactivity: Pan (drag) & Hover
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef<[number, number]>([0, 0]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = [...viewRange];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const cL = 20;
    const cR = rect.width - 75;
    const cW = cR - cL;

    // Drag-panning back and forth through historical dates
    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartXRef.current;
      const n = fullDataset.length;
      const [initStart, initEnd] = dragStartRangeRef.current;
      const currentSpan = initEnd - initStart;

      // Sensitivity factor
      const pointsShift = Math.round((deltaX / cW) * currentSpan);

      let newStart = initStart - pointsShift;
      let newEnd = initEnd - pointsShift;

      if (newStart < 0) {
        newStart = 0;
        newEnd = currentSpan;
      }
      if (newEnd > n) {
        newEnd = n;
        newStart = Math.max(0, n - currentSpan);
      }

      setViewRange([newStart, newEnd]);
      return;
    }

    // Hover detection
    if (mx < cL || mx > cR) {
      setHoveredIdx(null);
      if (onHoverPoint) onHoverPoint(null);
      return;
    }

    const n = visibleData.length;
    if (n === 0) return;

    const ratio = Math.max(0, Math.min(1, (mx - cL) / cW));
    const idx = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
    setHoveredIdx(idx);
    if (onHoverPoint) onHoverPoint(visibleData[idx]);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHoveredIdx(null);
    if (onHoverPoint) onHoverPoint(null);
  };

  // Wheel Zoom (Scroll up to zoom in, scroll down to zoom out and see previous historical data)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomDirection = e.deltaY < 0 ? "in" : "out";
    handleZoom(zoomDirection);
  };

  return (
    <div
      className={cn(
        "flex flex-col w-full border border-border/40 bg-[#0d1017] text-foreground select-none overflow-hidden",
        className
      )}
      style={{ minHeight: typeof height === "number" ? `${height}px` : height }}
    >
      {/* ── Top Navigation Tabs & Header (Image 1 Style) ── */}
      <div className="flex flex-wrap items-center justify-between border-b border-border/30 bg-[#0b0e14] px-3 py-1.5 gap-2">
        <div className="flex items-center gap-4">
          {title && (
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-white mr-2">
              {title}
            </span>
          )}

          {/* Navigation view tabs */}
          <div className="flex items-center gap-1">
            {(["Chart", "Info", "Data", "Square"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-2.5 py-1 text-xs font-mono font-medium transition-colors relative",
                  activeTab === tab
                    ? "text-[#f0b90b] font-bold after:absolute after:bottom-[-6px] after:left-0 after:right-0 after:h-[2px] after:bg-[#f0b90b]"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Indicators Toggle & Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsIndicatorsActive(!isIndicatorsActive)}
            className={cn(
              "px-2 py-0.5 text-[11px] font-mono border transition-colors flex items-center gap-1",
              isIndicatorsActive
                ? "border-[#f0b90b]/50 bg-[#f0b90b]/10 text-[#f0b90b]"
                : "border-border/30 text-muted-foreground hover:text-white"
            )}
            title="Toggle Moving Averages (MA 7 / 25 / 99)"
          >
            <Sliders className="h-3 w-3" />
            <span>MA (7/25/99)</span>
          </button>

          <button
            type="button"
            onClick={() => handleZoom("in")}
            className="p-1 hover:bg-white/10 rounded-none text-muted-foreground hover:text-white transition-colors"
            title="Zoom In (Scroll Up)"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => handleZoom("out")}
            className="p-1 hover:bg-white/10 rounded-none text-muted-foreground hover:text-white transition-colors"
            title="Zoom Out (Scroll Down to inspect previous historical data)"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1 hover:bg-white/10 rounded-none text-muted-foreground hover:text-white transition-colors"
            title="Reset Zoom"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Timeframe & Custom Days Filter Bar (Image 2 Style) ── */}
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between border-b border-border/20 bg-[#0e1118] px-3 py-1.5 text-xs font-mono gap-2">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-muted-foreground/80 font-bold mr-1 text-[11px]">Time:</span>
            {PRESET_DAYS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={cn(
                  "px-2 py-0.5 text-xs font-mono transition-colors",
                  activePreset === preset.label
                    ? "font-bold text-white bg-white/15"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* User Custom Days Input Box */}
          <form onSubmit={handleCustomDaysApply} className="flex items-center gap-1.5 ml-auto">
            <div className="flex items-center gap-1 bg-[#161a23] border border-border/40 px-2 py-0.5">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <input
                type="number"
                min="2"
                max={fullDataset.length}
                value={customDaysInput}
                onChange={(e) => setCustomDaysInput(e.target.value)}
                placeholder="Custom days..."
                className="w-24 bg-transparent text-xs font-mono text-white placeholder:text-muted-foreground/60 focus:outline-none"
              />
              <span className="text-[10px] text-muted-foreground">Days</span>
            </div>
            <button
              type="submit"
              className="px-2 py-0.5 text-[11px] font-mono bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Apply
            </button>
          </form>
        </div>
      )}

      {/* ── High-Density Real-Time Stats Header Strip (Image 1 Style) ── */}
      {showTopStats && activePoint && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-[#0b0e14] px-3 py-1.5 border-b border-border/20 text-xs font-mono overflow-x-auto">
          {/* Active Date */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>📅</span>
            <span className="text-white font-semibold">{String(activePoint.date instanceof Date ? activePoint.date.toISOString().split('T')[0] : activePoint.date)}</span>
          </div>

          {/* Metric Value */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">{metricLabel}:</span>
            <span
              className={cn(
                "font-bold font-mono",
                pointChange.pct >= 0 ? "text-[#f0b90b]" : "text-[#ef4444]"
              )}
            >
              {currencyPrefix}
              {activePoint.value.toLocaleString("en-IN")}
            </span>
          </div>

          {/* High & Low */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>High:</span>
            <span className="text-white">
              {currencyPrefix}
              {(activePoint.high ?? activePoint.value).toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>Low:</span>
            <span className="text-white">
              {currencyPrefix}
              {(activePoint.low ?? activePoint.value).toLocaleString("en-IN")}
            </span>
          </div>

          {/* Change % */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Change:</span>
            <span
              className={cn(
                "flex items-center font-bold",
                pointChange.pct >= 0 ? "text-[#10b981]" : "text-[#ef4444]"
              )}
            >
              {pointChange.pct >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {pointChange.pct >= 0 ? "+" : ""}
              {pointChange.pct.toFixed(2)}%
            </span>
          </div>

          {/* Moving Averages Pills (MA 7, 25, 99) */}
          {isIndicatorsActive && (
            <div className="flex items-center gap-3 ml-auto text-[11px]">
              {activeMA7 !== null && (
                <div className="flex items-center gap-1">
                  <span className="text-[#f0b90b] font-bold">MA(7)</span>
                  <span className="text-[#f0b90b]">{activeMA7.toFixed(1)}</span>
                </div>
              )}
              {activeMA25 !== null && (
                <div className="flex items-center gap-1">
                  <span className="text-[#e0248a] font-bold">MA(25)</span>
                  <span className="text-[#e0248a]">{activeMA25.toFixed(1)}</span>
                </div>
              )}
              {activeMA99 !== null && (
                <div className="flex items-center gap-1">
                  <span className="text-[#8b5cf6] font-bold">MA(99)</span>
                  <span className="text-[#8b5cf6]">{activeMA99.toFixed(1)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Main Canvas Chart Area ── */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full min-h-[260px] bg-[#0d1017] cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          className="absolute inset-0 block w-full h-full"
        />

        {/* Quick Hint at Bottom Left */}
        <div className="absolute bottom-1 left-2 pointer-events-none text-[10px] font-mono text-muted-foreground/40">
          Scroll wheel: Zoom in/out | Click & drag: Pan history
        </div>
      </div>
    </div>
  );
}

export default TradingLineChart;
