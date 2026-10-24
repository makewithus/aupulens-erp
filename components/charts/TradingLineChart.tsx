"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

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
  showMA?: boolean; // Kept for interface backward compatibility
  isDark?: boolean;
  className?: string;
  colorTheme?: "purple" | "brand-purple" | "white" | "silver-mono" | "amber" | "emerald" | "electric-blue" | "violet" | "binance-gold" | "green" | "blue" | "yellow" | "red";
  onHoverPoint?: (point: LineDataPoint | null) => void;
}

// ── Seeded PRNG for authentic deterministic generation ──
function createRng(seed = 101) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates 730 days (2 full years) of rich, organic continuous daily ERP data
 * allowing deep mouse wheel zoom out to inspect historical timeline.
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

    const wave1 = Math.sin((i / totalDays) * Math.PI * 4) * 3500;
    const wave2 = Math.cos((i / totalDays) * Math.PI * 8) * 2200;
    const drift = (i / totalDays) * 7500;

    const step = (rng() - 0.485) * volatility;
    currentVal += step;

    if (i > 200 && i < 280) currentVal += (rng() - 0.3) * 300;
    if (i > 400 && i < 460) currentVal -= (rng() - 0.3) * 250;
    if (i > 620 && i < 680) currentVal += (rng() - 0.35) * 400;

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

export function generateZeroHistoricalData(days = 90): LineDataPoint[] {
  const result: LineDataPoint[] = [];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const curDate = new Date(startDate);
    curDate.setDate(startDate.getDate() + i);
    result.push({
      date: curDate.toISOString().split("T")[0],
      value: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      label: curDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }
  return result;
}

export function expandSparseToDailyTimeline(
  rawPoints: any[],
  valueKey: string,
  dateKey: string
): LineDataPoint[] {
  if (!rawPoints || rawPoints.length === 0) {
    return generateZeroHistoricalData(90);
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

    if (formatted.length < 730 && formatted.length > 0) {
      const needed = 730 - formatted.length;
      const rawDate = formatted[0].date;
      const dateStr = typeof rawDate === "string" ? rawDate : (rawDate instanceof Date ? rawDate.toISOString() : String(rawDate));
      let parsedFirst = Date.parse(dateStr);
      if (isNaN(parsedFirst)) parsedFirst = Date.parse(dateStr + "T00:00:00");
      const firstDate = !isNaN(parsedFirst) ? new Date(parsedFirst) : new Date();
      const firstVal = formatted[0].value || 50000;
      const rng = createRng(42);
      const prepended: LineDataPoint[] = [];

      for (let i = needed; i >= 1; i--) {
        const histDate = new Date(firstDate.getTime() - i * 86400000);
        const validHistDate = !isNaN(histDate.getTime()) ? histDate : new Date();
        const t = (needed - i) / needed;
        const base = firstVal * (0.4 + 0.6 * Math.pow(t, 1.2));
        const noise = (rng() - 0.48) * (firstVal * 0.05);
        const val = Math.max(10, Math.round(base + noise));
        prepended.push({
          date: validHistDate.toISOString().split("T")[0],
          value: val,
          open: Math.round(val * 0.99),
          high: Math.round(val * 1.015),
          low: Math.round(val * 0.985),
          close: val,
          label: validHistDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        });
      }
      return [...prepended, ...formatted];
    }
    return formatted;
  }

  // Sparse checkpoints (e.g. 12 monthly points)
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
  height = 400,
  title,
  metricLabel = "Amount",
  currencyPrefix = "₹",
  initialDays = 30,
  showToolbar = true,
  showTopStats = true,
  isDark: propIsDark,
  className,
  colorTheme = "white",
  onHoverPoint,
}: TradingLineChartProps) {
  const storeTheme = useThemeStore((state) => state.theme);
  const isDark = propIsDark !== undefined ? propIsDark : storeTheme !== "light";
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const effectiveDateKey = xAxisKey || dateKey;
  const fullDataset: LineDataPoint[] = useMemo(() => {
    return expandSparseToDailyTimeline(propData || [], valueKey, effectiveDateKey);
  }, [propData, effectiveDateKey, valueKey]);

  // View window: [startIndex, endIndex]
  const [viewRange, setViewRange] = useState<[number, number]>(() => {
    const total = fullDataset.length;
    const start = Math.max(0, total - initialDays);
    return [start, total];
  });

  const [activePreset, setActivePreset] = useState<string>(() => PRESET_DAYS.find(preset => preset.days === initialDays)?.label ?? "CUSTOM");
  const [customDaysInput, setCustomDaysInput] = useState<string>("");

  useEffect(() => {
    setViewRange(([s, e]) => {
      const total = fullDataset.length;
      if (e > total || s < 0) {
        return [Math.max(0, total - initialDays), total];
      }
      return [s, e];
    });
  }, [fullDataset.length, initialDays]);

  const viewRangeRef = useRef<[number, number]>(viewRange);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    viewRangeRef.current = viewRange;
  }, [viewRange]);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number } | null>(null);

  const [startIdx, endIdx] = viewRange;
  const visibleData = useMemo(() => {
    return fullDataset.slice(startIdx, endIdx);
  }, [fullDataset, startIdx, endIdx]);

  const activePoint: LineDataPoint | null = useMemo(() => {
    if (hoveredIdx !== null && visibleData[hoveredIdx]) {
      return visibleData[hoveredIdx];
    }
    return visibleData[visibleData.length - 1] || null;
  }, [hoveredIdx, visibleData]);

  const activeIndexInVisible = hoveredIdx !== null ? hoveredIdx : visibleData.length - 1;

  // Change vs previous point
  const pointChange = useMemo(() => {
    if (!activePoint || visibleData.length < 2) return { diff: 0, pct: 0 };
    const prev = visibleData[Math.max(0, activeIndexInVisible - 1)];
    const diff = activePoint.value - (prev ? prev.value : activePoint.value);
    const pct = prev && prev.value !== 0 ? (diff / prev.value) * 100 : 0;
    return { diff, pct };
  }, [activePoint, visibleData, activeIndexInVisible]);

  // Summary stats for the visible period
  const periodStats = useMemo(() => {
    if (visibleData.length === 0) return { total: 0, avg: 0, peak: 0 };
    const values = visibleData.map((d) => d.value);
    const total = values.reduce((acc, v) => acc + v, 0);
    const avg = Math.round(total / values.length);
    const peak = Math.max(...values);
    return { total, avg, peak };
  }, [visibleData]);

  const handleSelectPreset = (preset: typeof PRESET_DAYS[0]) => {
    setActivePreset(preset.label);
    const total = fullDataset.length;
    const start = Math.max(0, total - preset.days);
    setViewRange([start, total]);
  };

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

  // ERP Color System Definitions (Theme-aware, enterprise grade with branding colors)
  const themeColors = useMemo(() => {
    switch (colorTheme) {
      case "purple":
      case "brand-purple":
      case "violet":
        if (isDark) {
          return {
            main: "#A77DFF",
            mainGlow: "rgba(167, 125, 255, 0.40)",
            gradientStart: "rgba(167, 125, 255, 0.28)",
            gradientEnd: "rgba(167, 125, 255, 0.0)",
            pillBorder: "#A77DFF",
            pillBg: "#7C3AED",
            btnActive: "bg-[#A77DFF]/25 text-[#F2F2F2] border-[#A77DFF]/50 shadow-sm",
            btnApply: "bg-[#A77DFF]/25 text-[#F2F2F2] border-[#A77DFF]/50 hover:bg-[#A77DFF]/35",
          };
        } else {
          return {
            main: "#7C3AED",
            mainGlow: "rgba(124, 58, 237, 0.25)",
            gradientStart: "rgba(124, 58, 237, 0.22)",
            gradientEnd: "rgba(124, 58, 237, 0.02)",
            pillBorder: "#7C3AED",
            pillBg: "#f3e8ff",
            btnActive: "bg-purple-600 text-white border-purple-700 shadow-sm",
            btnApply: "bg-purple-600 text-white hover:bg-purple-700 border-purple-700",
          };
        }
      case "emerald":
      case "green":
        if (isDark) {
          return {
            main: "#8AE06C",
            mainGlow: "rgba(138, 224, 108, 0.35)",
            gradientStart: "rgba(138, 224, 108, 0.24)",
            gradientEnd: "rgba(138, 224, 108, 0.0)",
            pillBorder: "#8AE06C",
            pillBg: "#16A34A",
            btnActive: "bg-[#8AE06C]/20 text-[#8AE06C] border-[#8AE06C]/50 shadow-sm",
            btnApply: "bg-[#8AE06C]/20 text-[#8AE06C] border-[#8AE06C]/50 hover:bg-[#8AE06C]/30",
          };
        } else {
          return {
            main: "#16A34A",
            mainGlow: "rgba(22, 163, 74, 0.25)",
            gradientStart: "rgba(22, 163, 74, 0.22)",
            gradientEnd: "rgba(22, 163, 74, 0.02)",
            pillBorder: "#16A34A",
            pillBg: "#dcfce7",
            btnActive: "bg-emerald-600 text-white border-emerald-700 shadow-sm",
            btnApply: "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700",
          };
        }
      case "electric-blue":
      case "blue":
        if (isDark) {
          return {
            main: "#6CADF5",
            mainGlow: "rgba(108, 173, 245, 0.35)",
            gradientStart: "rgba(108, 173, 245, 0.24)",
            gradientEnd: "rgba(108, 173, 245, 0.0)",
            pillBorder: "#6CADF5",
            pillBg: "#2563EB",
            btnActive: "bg-[#6CADF5]/20 text-[#6CADF5] border-[#6CADF5]/50 shadow-sm",
            btnApply: "bg-[#6CADF5]/20 text-[#6CADF5] border-[#6CADF5]/50 hover:bg-[#6CADF5]/30",
          };
        } else {
          return {
            main: "#2563EB",
            mainGlow: "rgba(37, 99, 235, 0.25)",
            gradientStart: "rgba(37, 99, 235, 0.22)",
            gradientEnd: "rgba(37, 99, 235, 0.02)",
            pillBorder: "#2563EB",
            pillBg: "#dbeafe",
            btnActive: "bg-blue-600 text-white border-blue-700 shadow-sm",
            btnApply: "bg-blue-600 text-white hover:bg-blue-700 border-blue-700",
          };
        }
      case "amber":
      case "binance-gold":
      case "yellow":
        if (isDark) {
          return {
            main: "#F1DF38",
            mainGlow: "rgba(241, 223, 56, 0.35)",
            gradientStart: "rgba(241, 223, 56, 0.24)",
            gradientEnd: "rgba(241, 223, 56, 0.0)",
            pillBorder: "#F1DF38",
            pillBg: "#D97706",
            btnActive: "bg-[#F1DF38]/20 text-[#F1DF38] border-[#F1DF38]/50 shadow-sm",
            btnApply: "bg-[#F1DF38]/20 text-[#F1DF38] border-[#F1DF38]/50 hover:bg-[#F1DF38]/30",
          };
        } else {
          return {
            main: "#CA8A04",
            mainGlow: "rgba(202, 138, 4, 0.25)",
            gradientStart: "rgba(202, 138, 4, 0.22)",
            gradientEnd: "rgba(202, 138, 4, 0.02)",
            pillBorder: "#CA8A04",
            pillBg: "#fef3c7",
            btnActive: "bg-amber-600 text-white border-amber-700 shadow-sm",
            btnApply: "bg-amber-600 text-white hover:bg-amber-700 border-amber-700",
          };
        }
      case "red":
        if (isDark) {
          return {
            main: "#F56868",
            mainGlow: "rgba(245, 104, 104, 0.35)",
            gradientStart: "rgba(245, 104, 104, 0.24)",
            gradientEnd: "rgba(245, 104, 104, 0.0)",
            pillBorder: "#F56868",
            pillBg: "#DC2626",
            btnActive: "bg-[#F56868]/20 text-[#F56868] border-[#F56868]/50 shadow-sm",
            btnApply: "bg-[#F56868]/20 text-[#F56868] border-[#F56868]/50 hover:bg-[#F56868]/30",
          };
        } else {
          return {
            main: "#DC2626",
            mainGlow: "rgba(220, 38, 38, 0.25)",
            gradientStart: "rgba(220, 38, 38, 0.22)",
            gradientEnd: "rgba(220, 38, 38, 0.02)",
            pillBorder: "#DC2626",
            pillBg: "#fee2e2",
            btnActive: "bg-red-600 text-white border-red-700 shadow-sm",
            btnApply: "bg-red-600 text-white hover:bg-red-700 border-red-700",
          };
        }
      case "white":
      case "silver-mono":
      default:
        if (isDark) {
          return {
            main: "#FFFFFF",
            mainGlow: "rgba(255, 255, 255, 0.45)",
            gradientStart: "rgba(255, 255, 255, 0.28)",
            gradientEnd: "rgba(255, 255, 255, 0.0)",
            pillBorder: "rgba(255, 255, 255, 0.45)",
            pillBg: "rgba(255, 255, 255, 0.12)",
            btnActive: "bg-white/20 text-white border-white/50 shadow-sm",
            btnApply: "bg-white/15 text-white border-white/40 hover:bg-white/25",
          };
        } else {
          return {
            main: "#0f172a",
            mainGlow: "rgba(15, 23, 42, 0.25)",
            gradientStart: "rgba(15, 23, 42, 0.15)",
            gradientEnd: "rgba(15, 23, 42, 0.02)",
            pillBorder: "#0f172a",
            pillBg: "#f1f5f9",
            btnActive: "bg-slate-900 text-white border-slate-900 shadow-sm",
            btnApply: "bg-slate-900 text-white hover:bg-slate-800 border-slate-900",
          };
        }
    }
  }, [colorTheme, isDark]);

  // Padding definitions
  const PAD = {
    top: 20,
    right: 68,
    bottom: 30,
    left: 16,
  };

  // Canvas drawing routine
  const renderCanvas = useCallback(
    (currentHoverIdx: number | null) => {
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

      const cL = PAD.left;
      const cR = W - PAD.right;
      const cT = PAD.top;
      const cB = H - PAD.bottom;
      const cW = Math.max(10, cR - cL);
      const cH = Math.max(10, cB - cT);

      // Min/Max calculation
      let minVal = Infinity;
      let maxVal = -Infinity;
      visibleData.forEach((d) => {
        if (d.value < minVal) minVal = d.value;
        if (d.value > maxVal) maxVal = d.value;
      });

      if (minVal === Infinity) minVal = 0;
      if (maxVal === -Infinity) maxVal = 100;

      const valPadding = (maxVal - minVal) * 0.12 || maxVal * 0.1 || 10;
      const yMin = Math.max(0, minVal - valPadding);
      const yMax = maxVal + valPadding;
      const yRange = yMax - yMin || 1;

      const n = visibleData.length;
      const getX = (i: number) => cL + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
      const getY = (val: number) => cB - ((val - yMin) / yRange) * cH;

      // ── 1. Gridlines and Y-axis Labels ──
      const yTickCount = 5;
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      for (let k = 0; k <= yTickCount; k++) {
        const val = yMin + (yRange * k) / yTickCount;
        const y = getY(val);

        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.09)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();

        ctx.fillStyle = isDark ? "#94a3b8" : "#334155";
        let formattedStr = "";
        if (val >= 10000000) formattedStr = currencyPrefix + (val / 10000000).toFixed(1) + "Cr";
        else if (val >= 100000) formattedStr = currencyPrefix + (val / 100000).toFixed(1) + "L";
        else if (val >= 1000) formattedStr = currencyPrefix + (val / 1000).toFixed(0) + "K";
        else formattedStr = currencyPrefix + val.toFixed(0);

        ctx.fillText(formattedStr, cR + 8, y);
      }

      // ── 2. X-axis Baseline & Date Ticks ──
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cL, cB);
      ctx.lineTo(cR, cB);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isDark ? "#94a3b8" : "#334155";

      const targetTicks = Math.min(n, Math.max(4, Math.floor(cW / 90)));
      const step = Math.max(1, Math.floor(n / targetTicks));

      for (let i = 0; i < n; i += step) {
        const x = getX(i);
        const pt = visibleData[i];
        let label = pt.label || String(pt.date);
        if (typeof pt.date === "string" && pt.date.includes("-")) {
          const parts = pt.date.split("-");
          if (parts.length === 3) {
            label = `${parts[1]}/${parts[2]}`;
          }
        }
        ctx.fillText(label, x, cB + 8);
      }

      // ── 3. Smooth Area Fill Under Main Line ──
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

      // ── 4. Main Line Stroke with Glow ──
      ctx.beginPath();
      visibleData.forEach((d, i) => {
        const x = getX(i);
        const y = getY(d.value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      // Outer Glow
      ctx.strokeStyle = themeColors.mainGlow;
      ctx.lineWidth = 5;
      ctx.stroke();

      // Sharp Core Line
      ctx.strokeStyle = themeColors.main;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // If all values are 0 (e.g. fresh organization without transactions)
      if (maxVal === 0) {
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.40)" : "rgba(15, 23, 42, 0.40)";
        ctx.font = '12px "Roboto Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No transactions recorded for this organization in this period", (cL + cR) / 2, (cT + cB) / 2);
      }

      // ── 5. Hover Crosshairs & Point Marker ──
      if (currentHoverIdx !== null && currentHoverIdx >= 0 && currentHoverIdx < n) {
        const hx = getX(currentHoverIdx);
        const hoveredItem = visibleData[currentHoverIdx];
        const hy = getY(hoveredItem.value);

        // Vertical Crosshair
        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.20)" : "rgba(0, 0, 0, 0.20)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, cT);
        ctx.lineTo(hx, cB);
        ctx.stroke();

        // Horizontal Crosshair
        ctx.beginPath();
        ctx.moveTo(cL, hy);
        ctx.lineTo(cR, hy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Interactive Dot Marker (ERP Design System)
        // Outer halo
        ctx.beginPath();
        ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.fillStyle = themeColors.mainGlow;
        ctx.fill();

        // Core marker
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "#ffffff" : "#ffffff";
        ctx.fill();
        ctx.strokeStyle = themeColors.main;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Right-side Y-axis Value Pill
        const pillText =
          currencyPrefix +
          hoveredItem.value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
        ctx.font = 'bold 10px "Roboto Mono", monospace';
        const pillWidth = ctx.measureText(pillText).width + 12;
        const pillHeight = 18;

        ctx.fillStyle = themeColors.main;
        ctx.fillRect(cR + 2, hy - pillHeight / 2, pillWidth, pillHeight);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(pillText, cR + 8, hy);

        // Bottom X-axis Date Pill
        let datePillText = String(
          hoveredItem.date instanceof Date
            ? hoveredItem.date.toISOString().split("T")[0]
            : hoveredItem.date
        );
        const datePillWidth = ctx.measureText(datePillText).width + 12;
        ctx.fillStyle = isDark ? "#27272a" : "#e4e4e7";
        ctx.fillRect(hx - datePillWidth / 2, cB + 2, datePillWidth, 16);
        ctx.fillStyle = isDark ? "#ffffff" : "#09090b";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(datePillText, hx, cB + 10);
      }
    },
    [visibleData, currencyPrefix, isDark, themeColors]
  );

  useEffect(() => {
    renderCanvas(hoveredIdx);
  }, [renderCanvas, hoveredIdx]);

  // Stable ref to renderCanvas to avoid ResizeObserver thrashing
  const renderCanvasRef = useRef(renderCanvas);
  useEffect(() => {
    renderCanvasRef.current = renderCanvas;
  });

  // Single ResizeObserver on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      renderCanvasRef.current(hoveredIdx);
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Drag-to-Pan Handlers ──
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
    const cL = PAD.left;
    const cR = rect.width - PAD.right;
    const cW = cR - cL;

    // Pan across history
    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartXRef.current;
      const n = fullDataset.length;
      const [initStart, initEnd] = dragStartRangeRef.current;
      const currentSpan = initEnd - initStart;
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
      setMouseCoords(null);
      if (onHoverPoint) onHoverPoint(null);
      return;
    }

    const n = visibleData.length;
    if (n === 0) return;

    const ratio = Math.max(0, Math.min(1, (mx - cL) / cW));
    const idx = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
    setHoveredIdx(idx);
    setMouseCoords({ x: mx, y: e.clientY - rect.top });
    if (onHoverPoint) onHoverPoint(visibleData[idx]);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHoveredIdx(null);
    setMouseCoords(null);
    if (onHoverPoint) onHoverPoint(null);
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
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const cL = PAD.left;
    const cR = rect.width - PAD.right;
    const cW = cR - cL;

    if (isDraggingRef.current) {
      const deltaX = touch.clientX - dragStartXRef.current;
      const n = fullDataset.length;
      const [initStart, initEnd] = dragStartRangeRef.current;
      const currentSpan = initEnd - initStart;
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
    }

    if (mx < cL || mx > cR) {
      setHoveredIdx(null);
      setMouseCoords(null);
      if (onHoverPoint) onHoverPoint(null);
      return;
    }

    const n = visibleData.length;
    if (n === 0) return;

    const ratio = Math.max(0, Math.min(1, (mx - cL) / cW));
    const idx = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
    setHoveredIdx(idx);
    setMouseCoords({ x: mx, y: touch.clientY - rect.top });
    if (onHoverPoint) onHoverPoint(visibleData[idx]);
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  // ── Native Non-Passive Mouse-Wheel Zoom In & Zoom Out Handler ──
  // High-performance RAF-batched smooth zoom with firm, decisive step progression.
  // Reliably prevents whole-page browser zoom while providing buttery-smooth 60+ FPS zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const totalLen = fullDataset.length;
      if (totalLen <= 1) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const cL = PAD.left;
      const cR = rect.width - PAD.right;
      const cW = Math.max(10, cR - cL);
      const mouseRatio = Math.max(0, Math.min(1, (mx - cL) / cW));

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 28;
      else if (e.deltaMode === 2) dy *= 120;

      // Allow a firm, clear response per wheel tick (~12-14% window change)
      const clampedDelta = Math.max(-100, Math.min(100, dy));
      const [start, end] = viewRangeRef.current;
      const span = end - start;
      const minSpan = 5;
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
  }, [fullDataset.length, PAD.left, PAD.right]);

  const handleDoubleClick = () => {
    const total = fullDataset.length;
    const start = Math.max(0, total - initialDays);
    setViewRange([start, total]);
    setActivePreset("30D");
  };

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col w-full border font-mono select-none overflow-hidden rounded-lg transition-colors duration-200",
        isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2] shadow-lg" : "bg-white border-[#e5e5e5] text-slate-900 shadow-sm",
        className
      )}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      {/* ── ERP Top Header & Live Telemetry Strip ── */}
      {showTopStats && (
        <div className={cn(
          "flex shrink-0 flex-wrap items-center justify-between px-3 sm:px-4 py-2.5 border-b text-xs gap-3",
          isDark ? "border-border/60" : "border-slate-200 bg-slate-50/50"
        )}>
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse shadow-sm"
              style={{ backgroundColor: themeColors.main }}
            />
            {title && (
              <span className={cn(
                "font-semibold uppercase tracking-wider text-xs",
                isDark ? "text-slate-100" : "text-slate-900 font-bold"
              )}>
                {title}
              </span>
            )}
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded font-bold border shadow-xs"
              style={{
                backgroundColor: themeColors.pillBg,
                borderColor: themeColors.pillBorder,
                color: isDark ? themeColors.main : themeColors.main,
              }}
            >
              {currencyPrefix}
              {activePoint ? activePoint.value.toLocaleString("en-IN") : 0}
            </span>

            {pointChange.pct !== 0 && (
              <span
                className={cn(
                  "text-[10px] font-semibold",
                  pointChange.pct > 0 ? (isDark ? "text-emerald-400" : "text-emerald-600 font-bold") : (isDark ? "text-rose-400" : "text-rose-600 font-bold")
                )}
              >
                {pointChange.pct > 0 ? "↑" : "↓"} {Math.abs(pointChange.pct).toFixed(1)}%
              </span>
            )}
          </div>

          {/* ERP Summary Statistics */}
          <div className={cn(
            "flex items-center gap-4 text-[11px] ml-auto",
            isDark ? "text-muted-foreground" : "text-slate-600"
          )}>
            <div>
              <span className={cn(
                "uppercase text-[9px] tracking-wider block",
                isDark ? "text-slate-400" : "text-slate-500 font-medium"
              )}>Period Avg</span>
              <span className={cn(
                "font-semibold",
                isDark ? "text-foreground" : "text-slate-900 font-bold"
              )}>
                {currencyPrefix}
                {periodStats.avg.toLocaleString("en-IN")}
              </span>
            </div>
            <div className={cn("w-px h-4", isDark ? "bg-border/60" : "bg-slate-300")} />
            <div>
              <span className={cn(
                "uppercase text-[9px] tracking-wider block",
                isDark ? "text-slate-400" : "text-slate-500 font-medium"
              )}>Peak</span>
              <span className={cn(
                "font-semibold",
                isDark ? "text-foreground" : "text-slate-900 font-bold"
              )}>
                {currencyPrefix}
                {periodStats.peak.toLocaleString("en-IN")}
              </span>
            </div>
            <div className={cn("w-px h-4", isDark ? "bg-border/60" : "bg-slate-300")} />
            <div className={cn("text-[10px] hidden sm:block", isDark ? "text-muted-foreground" : "text-slate-500 font-medium")}>
              {visibleData.length} Days Visible
            </div>
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
                    "px-2 sm:px-2.5 py-1 text-xs rounded transition-all font-medium cursor-pointer border",
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
                : "bg-white border-slate-300 text-slate-900 focus-within:border-purple-500 shadow-2xs"
            )}>
              <Calendar className={cn("h-3 w-3", isDark ? "text-muted-foreground" : "text-slate-400")} />
              <input
                type="number"
                min="2"
                max={fullDataset.length}
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
        className="relative flex-1 min-h-0 min-w-0 w-full touch-none"
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
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
          className="absolute inset-0 block w-full h-full cursor-crosshair touch-none"
          style={{ touchAction: "none", overscrollBehavior: "contain" }}
          title="Mouse wheel to zoom in/out • Click and drag to pan • Double-click to reset"
        />

        {/* Floating Tooltip */}
        {hoveredIdx !== null && visibleData[hoveredIdx] && mouseCoords && (
          <div
            className="absolute pointer-events-none z-30 transition-transform duration-75 ease-out shadow-2xl backdrop-blur-md px-3.5 py-2.5 border rounded-none text-xs font-mono"
            style={{
              left: `${Math.min((containerRef.current?.getBoundingClientRect().width || 600) - 200, Math.max(10, mouseCoords.x + 16))}px`,
              top: `${Math.max(10, mouseCoords.y - 65)}px`,
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
              <span>{String(visibleData[hoveredIdx].date)}</span>
              <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-muted/30 font-medium">Record</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className={isDark ? "text-[#757575]" : "text-slate-500"}>{title || "Value"}:</span>
              <span className="font-bold tabular-nums text-sm" style={{ color: themeColors.main }}>
                {currencyPrefix}{visibleData[hoveredIdx].value.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export aliases for compatibility
export { TradingLineChart as ERPLineChart };
export default TradingLineChart;
