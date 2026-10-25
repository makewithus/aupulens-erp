"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/store/themeStore";
import { ExternalLink } from "lucide-react";

export interface ModuleDataPoint {
  module: string;
  count: number;
}

const DEFAULT_SOURCE_MODULES: ModuleDataPoint[] = [
  { module: "Finance", count: 9200000 },
  { module: "Supply Chain", count: 7800000 },
  { module: "Inventory", count: 8500000 },
  { module: "Human Resources", count: 5400000 },
  { module: "CRM", count: 6100000 },
  { module: "Procurement", count: 4200000 },
  { module: "Manufacturing", count: 3800000 },
  { module: "Sales & Order", count: 25400000 },
  { module: "Warehouse Mgmt", count: 11200000 },
  { module: "Billing", count: 7800000 },
];

const DEFAULT_TARGET_MODULES: ModuleDataPoint[] = [
  { module: "Finance", count: 10200000 },
  { module: "Supply Chain", count: 8100000 },
  { module: "Inventory", count: 9500000 },
  { module: "Human Resources", count: 7600000 },
  { module: "CRM", count: 8900000 },
  { module: "Procurement", count: 7200000 },
  { module: "Manufacturing", count: 5100000 },
  { module: "Sales & Order", count: 12800000 },
  { module: "Warehouse Mgmt", count: 11400000 },
  { module: "Billing", count: 14300000 },
];

function formatNumber(v: number): string {
  return v.toLocaleString("en-US");
}

function formatShortM(v: number): string {
  if (v >= 1000000) return (v / 1000000).toFixed(0) + "M";
  if (v >= 1000) return (v / 1000).toFixed(0) + "K";
  return v.toString();
}

interface SingleModuleBarChartProps {
  title: string;
  totalValue: number;
  data: ModuleDataPoint[];
  isDark: boolean;
  onAdvancedView?: () => void;
}

export function SingleModuleBarChart({
  title,
  totalValue,
  data,
  isDark,
  onAdvancedView,
}: SingleModuleBarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !container || !tooltip || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const values = data.map((d) => d.count);
    const maxVal = Math.max(...values, 1000000);
    const step = 5000000;
    const yMax = Math.ceil(maxVal / step) * step;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += step) yTicks.push(v);

    const PAD = { top: 28, right: 45, bottom: 85, left: 16 };

    let animId: number | null = null;
    function runEntryAnimation() {
      if (animId) cancelAnimationFrame(animId);
      const startTime = performance.now();
      const duration = 850;

      function step(now: number) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const progress = 1 - Math.pow(1 - t, 3);
        draw(undefined, progress);
        if (t < 1) {
          animId = requestAnimationFrame(step);
        } else {
          animId = null;
          draw(undefined, 1);
        }
      }
      animId = requestAnimationFrame(step);
    }

    function resize() {
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      runEntryAnimation();
    }

    function draw(highlightIdx?: number, animProgress: number = 1) {
      if (!ctx || !canvas) return;
      const progress = Math.max(0, Math.min(1, animProgress));
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const cL = PAD.left;
      const cR = W - PAD.right;
      const cT = PAD.top;
      const cB = H - PAD.bottom;
      const cW = Math.max(10, cR - cL);
      const cH = Math.max(10, cB - cT);

      // Horizontal grid lines and Y-axis labels on the right
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      yTicks.forEach((v) => {
        const y = cB - (v / yMax) * cH;
        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();

        ctx.fillStyle = isDark ? "#757575" : "#475569";
        ctx.fillText(formatShortM(v), cR + 36, y);
      });

      // Draw Bars
      const n = data.length;
      const groupWidth = cW / n;
      const barWidth = Math.max(8, groupWidth * 0.58);
      const gap = (groupWidth - barWidth) / 2;

      for (let i = 0; i < n; i++) {
        const x = cL + i * groupWidth + gap;
        const isHighlight = highlightIdx === i;

        // Background highlight column on hover
        if (isHighlight) {
          ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.04)";
          ctx.fillRect(cL + i * groupWidth, cT, groupWidth, cH);
        }

        const stagger = (i / Math.max(1, n - 1)) * 0.25;
        const barP = Math.max(0, Math.min(1, (progress - stagger) / 0.75));
        const easedP = 1 - Math.pow(1 - barP, 3);
        const barH = (data[i].count / yMax) * cH * easedP;
        const barY = cB - barH;

        // Gradient purple bar matching Image 3 (#A77DFF brand gradient)
        const grad = ctx.createLinearGradient(x, barY, x, cB);
        if (isDark) {
          grad.addColorStop(0, isHighlight ? "#FFFFFF" : "#D3BDFF");
          grad.addColorStop(0.25, isHighlight ? "#D3BDFF" : "#B595FF");
          grad.addColorStop(0.7, isHighlight ? "#B595FF" : "#A77DFF");
          grad.addColorStop(1, isHighlight ? "#A77DFF" : "#7C3AED");
        } else {
          grad.addColorStop(0, isHighlight ? "#B595FF" : "#9353E8");
          grad.addColorStop(0.4, isHighlight ? "#9353E8" : "#7C3AED");
          grad.addColorStop(1, isHighlight ? "#6E38D9" : "#5B21B6");
        }

        ctx.fillStyle = grad;

        // Draw rounded top corners
        const r = Math.min(4, barWidth / 2);
        ctx.beginPath();
        ctx.moveTo(x, cB);
        ctx.lineTo(x, barY + r);
        ctx.quadraticCurveTo(x, barY, x + r, barY);
        ctx.lineTo(x + barWidth - r, barY);
        ctx.quadraticCurveTo(x + barWidth, barY, x + barWidth, barY + r);
        ctx.lineTo(x + barWidth, cB);
        ctx.closePath();
        ctx.fill();

        // Subtle glow outline when highlighted
        if (isHighlight) {
          ctx.strokeStyle = isDark ? "#ffffff" : "#4c1d95";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Numeric value on top of each bar so user can read directly
        if (easedP >= 0.7) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (easedP - 0.7) / 0.3);
          ctx.font = 'bold 10px "Roboto Mono", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = isHighlight
            ? isDark ? "#FFFFFF" : "#0F172A"
            : isDark ? "#F2F2F2" : "#1E293B";
          ctx.fillText(formatShortM(data[i].count), x + barWidth / 2, barY - 4);
          ctx.restore();
        }

        // Module name on X-axis (rotated -45 degrees)
        ctx.save();
        ctx.translate(x + barWidth / 2, cB + 10);
        ctx.rotate(-Math.PI / 4);
        ctx.font = '10px "Roboto Mono", monospace';
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isHighlight
          ? isDark ? "#ffffff" : "#0f172a"
          : isDark ? "#757575" : "#334155";
        ctx.fillText(data[i].module, 0, 0);
        ctx.restore();
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const W = rect.width;
      const H = rect.height;

      const cL = PAD.left;
      const cR = W - PAD.right;
      const cT = PAD.top;
      const cB = H - PAD.bottom;
      const cW = Math.max(10, cR - cL);

      if (mx < cL || mx > cR || my < cT || my > cB + 60) {
        tooltip.style.display = "none";
        draw(undefined, 1);
        return;
      }

      const idx = Math.floor(((mx - cL) / cW) * data.length);
      if (idx < 0 || idx >= data.length) {
        tooltip.style.display = "none";
        draw(undefined, 1);
        return;
      }

      const item = data[idx];
      const pct = totalValue > 0 ? ((item.count / totalValue) * 100).toFixed(1) : "0.0";

      tooltip.innerHTML = `
        <div class="font-bold text-xs pb-1 border-b border-border/40 flex items-center gap-1.5">
          <span class="inline-block w-2.5 h-2.5 rounded-sm bg-purple-500"></span>
          <span>${item.module}</span>
        </div>
        <div class="flex items-center justify-between gap-4 mt-1.5 font-mono text-[11px]">
          <span class="text-muted-foreground uppercase text-[10px]">Volume:</span>
          <span class="font-bold text-foreground">${formatNumber(item.count)}</span>
        </div>
        <div class="flex items-center justify-between gap-4 mt-0.5 font-mono text-[11px]">
          <span class="text-muted-foreground uppercase text-[10px]">Share:</span>
          <span class="font-bold text-purple-500 dark:text-purple-400">${pct}%</span>
        </div>
      `;

      tooltip.style.display = "block";
      const tipWidth = tooltip.offsetWidth || 150;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 60) + "px";

      draw(idx, 1);
    };

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw(undefined, 1);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", resize);

    setTimeout(resize, 60);
    resize();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [data, isDark, totalValue]);

  return (
    <div
      className={cn(
        "chart-animate-in chart-shimmer-border border rounded-none p-4 font-mono transition-colors duration-200 flex flex-col justify-between",
        isDark
          ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2] shadow-md"
          : "bg-white border-[#e5e5e5] text-slate-900 shadow-sm"
      )}
    >
      {/* Header matching Image 4 */}
      <div className="flex items-center justify-between gap-2 border-b border-[#272727]/50 pb-3 mb-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-bold uppercase tracking-wider",
              isDark ? "text-[#F2F2F2]" : "text-slate-900"
            )}
          >
            {title}
          </span>
          <span className="text-[#757575]">|</span>
          <span
            className={cn(
              "text-xs font-mono font-bold tracking-tight",
              isDark ? "text-[#A77DFF]" : "text-purple-700 font-extrabold"
            )}
          >
            {formatNumber(totalValue)}
          </span>
        </div>

        <button
          onClick={onAdvancedView}
          className={cn(
            "text-[10px] font-mono px-2.5 py-1 border transition-colors flex items-center gap-1 uppercase tracking-wider rounded-none cursor-pointer",
            isDark
              ? "bg-[#161616] border-[#272727] text-[#F2F2F2] hover:bg-[#272727]"
              : "bg-slate-100 border-[#e5e5e5] text-slate-700 hover:bg-slate-200 font-semibold"
          )}
        >
          <span>Advanced View</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Canvas Wrap */}
      <div ref={containerRef} className="relative w-full h-[280px]">
        <canvas ref={canvasRef} className="block cursor-crosshair w-full h-full" />
        <div
          ref={tooltipRef}
          className={cn(
            "absolute pointer-events-none p-2.5 border font-mono text-[10px] shadow-xl rounded-none hidden z-10 backdrop-blur-md",
            isDark
              ? "bg-[#161616]/95 border-[#272727] text-[#F2F2F2]"
              : "bg-white/95 border-[#e5e5e5] text-slate-900 shadow-xl"
          )}
        />
      </div>
    </div>
  );
}

export function TopModulesShowcase() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
      <SingleModuleBarChart
        title="Top 10 Source Modules"
        totalValue={123546533}
        data={DEFAULT_SOURCE_MODULES}
        isDark={isDark}
      />
      <SingleModuleBarChart
        title="Top 10 Target Modules"
        totalValue={88250552}
        data={DEFAULT_TARGET_MODULES}
        isDark={isDark}
      />
    </div>
  );
}
