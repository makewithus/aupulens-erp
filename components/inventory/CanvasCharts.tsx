"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/store/themeStore";

// Keep category labels inside their allocated space at every viewport width.
function fitLabel(ctx: CanvasRenderingContext2D, value: unknown, maxWidth: number) {
  const text = String(value ?? '');
  if (ctx.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened.length && ctx.measureText(shortened + '…').width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return shortened ? shortened + '…' : '';
}

// Helper to format values
function formatShortVal(v: number) {
  if (v >= 10000000) return (v / 10000000).toFixed(1) + "Cr";
  if (v >= 100000) return (v / 100000).toFixed(0) + "L";
  if (v >= 1000) return (v / 1000).toFixed(0) + "K";
  return v.toString();
}

function adjustHexOpacity(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith("#")) return hex || "rgba(147, 51, 234, 1)";
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.substring(0, 6);
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface SeriesConfig {
  key: string;
  name: string;
  color: string;
}

// Default 10-module branding palette matching Image 5
export const BRAND_MODULE_PALETTE = [
  "#7c3aed", // Finance
  "#ef4444", // Supply Chain
  "#3b82f6", // Inventory
  "#f97316", // HR
  "#eab308", // CRM
  "#ec4899", // Warehouse Mgmt
  "#a855f7", // Billing
  "#10b981", // Sales & Order
  "#1e3a8a", // Manufacturing
  "#64748b", // Others
];

// ── 1. CANVAS AREA CHART (LINE/AREA WITH GRADIENTS) ──
export function CanvasAreaChart({
  data,
  xAxisKey,
  series,
  isDark: propIsDark,
}: {
  data: any[];
  xAxisKey: string;
  series: SeriesConfig[];
  isDark?: boolean;
}) {
  const storeTheme = useThemeStore((state) => state.theme);
  const isDark = propIsDark !== undefined ? propIsDark : storeTheme !== "light";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip || !data || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const PAD = { top: 25, right: 30, bottom: 35, left: 45 };

    const allValues = data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0));
    const maxVal = Math.max(...allValues, 10);
    const roundStep = Math.pow(10, Math.floor(Math.log10(maxVal)) - 1) * 2 || 5;
    const yMax = Math.ceil(maxVal / roundStep) * roundStep;
    const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

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

    function draw(highlightIdx?: number, animProgress: number = 1) {
      if (!ctx || !canvas) return;
      const progress = Math.max(0, Math.min(1, animProgress));
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const cL = PAD.left,
        cR = W - PAD.right,
        cT = PAD.top,
        cB = H - PAD.bottom;
      const cW = cR - cL,
        cH = cB - cT;

      // Draw Gridlines and Y ticks
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isDark ? "#94a3b8" : "#475569";

      yTicks.forEach((v) => {
        const y = cB - (v / yMax) * cH;
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();

        ctx.fillText(formatShortVal(v), cL - 10, y);
      });

      // Draw X axis values
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isDark ? "#94a3b8" : "#475569";
      const denom = Math.max(1, data.length - 1);
      const getX = (i: number) => (data.length <= 1 ? cL + cW / 2 : cL + (i / denom) * cW);
      const step = Math.ceil(data.length / 7);
      data.forEach((d, i) => {
        if (i % step === 0 || i === data.length - 1) {
          const x = getX(i);
          ctx.fillText(String(d[xAxisKey]), x, cB + 10);
        }
      });

      // Draw Area + Line for each series
      series.forEach((s) => {
        ctx.beginPath();
        data.forEach((d, i) => {
          const x = getX(i);
          const y = cB - (((Number(d[s.key]) || 0) * progress) / yMax) * cH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineTo(cR, cB);
        ctx.lineTo(cL, cB);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, cT, 0, cB);
        grad.addColorStop(0, adjustHexOpacity(s.color, 0.25));
        grad.addColorStop(1, adjustHexOpacity(s.color, 0.01));
        ctx.fillStyle = grad;
        ctx.fill();

        // Line stroke
        ctx.beginPath();
        data.forEach((d, i) => {
          const x = getX(i);
          const y = cB - (((Number(d[s.key]) || 0) * progress) / yMax) * cH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Interactive crosshair
      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < data.length) {
        const hx = getX(highlightIdx);
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.2)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, cT);
        ctx.lineTo(hx, cB);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const W = rect.width;
      const cL = PAD.left,
        cR = W - PAD.right;
      const cW = cR - cL;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const denom = Math.max(1, data.length - 1);
      const idx = data.length <= 1 ? 0 : Math.max(0, Math.min(data.length - 1, Math.round(((mx - cL) / cW) * denom)));
      if (idx < 0 || idx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      let tooltipContent = `<div class="font-bold text-xs pb-1 mb-1 border-b border-border/40">${d[xAxisKey]}</div>`;
      series.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2.5 h-2.5 rounded-full" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-sans tabular-nums font-semibold text-xs">${val.toLocaleString()}</span>
        </div>`;
      });

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = "block";

      const tipWidth = tooltip.offsetWidth || 140;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 60) + "px";
      draw(idx);
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const W = rect.width;
      const cL = PAD.left,
        cR = W - PAD.right;
      const cW = cR - cL;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const idx = Math.round(((mx - cL) / cW) * (data.length - 1));
      if (idx < 0 || idx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      let tooltipContent = `<div class="font-bold text-xs pb-1 mb-1 border-b border-border/40">${d[xAxisKey]}</div>`;
      series.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2.5 h-2.5 rounded-full" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-sans tabular-nums font-semibold text-xs">${val.toLocaleString()}</span>
        </div>`;
      });

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = "block";

      const tipWidth = tooltip.offsetWidth || 140;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 60) + "px";
      draw(idx);
    };

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw();
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouch, { passive: true });
    canvas.addEventListener("touchmove", handleTouch, { passive: true });
    canvas.addEventListener("touchend", handleMouseLeave);
    window.addEventListener("resize", resize);

    let animId: number | null = null;
    if (hasAnimatedRef.current) {
      draw(undefined, 1);
    } else {
      let startTime: number | null = null;
      const duration = 750;

      function animate(timestamp: number) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const t = Math.min(1, elapsed / duration);
        const progress = 1 - Math.pow(1 - t, 3);
        draw(undefined, progress);
        if (t < 1) {
          animId = requestAnimationFrame(animate);
        } else {
          animId = null;
          hasAnimatedRef.current = true;
          draw(undefined, 1);
        }
      }
      animId = requestAnimationFrame(animate);
    }

    const ro = new ResizeObserver(() => {
      if (animId) cancelAnimationFrame(animId);
      resize();
    });
    ro.observe(container);

    const resizeTimer = window.setTimeout(resize, 60);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.clearTimeout(resizeTimer);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("touchmove", handleTouch);
      canvas.removeEventListener("touchend", handleMouseLeave);
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, [data, series, xAxisKey, isDark]);

  return (
    <div ref={containerRef} className="w-full h-full min-w-0 min-h-0 relative chart-animate-in chart-shimmer-border">
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-3 border font-mono text-[10px] shadow-lg rounded-none hidden z-10 backdrop-blur-md",
          isDark
            ? "bg-black/95 border-zinc-800 text-white shadow-2xl"
            : "bg-white/95 border-slate-300 text-slate-900 shadow-xl"
        )}
      ></div>
    </div>
  );
}

// ── 2. CANVAS BAR CHART (VERTICAL/HORIZONTAL SEGMENTED BRICKS) ──
export function CanvasBarChart({
  data,
  xAxisKey,
  series,
  layout = "vertical",
  isDark: propIsDark,
}: {
  data: any[];
  xAxisKey: string;
  series: SeriesConfig[];
  layout?: "vertical" | "horizontal";
  isDark?: boolean;
}) {
  const storeTheme = useThemeStore((state) => state.theme);
  const isDark = propIsDark !== undefined ? propIsDark : storeTheme !== "light";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip || !data || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isVert = layout === "vertical";
    const PAD = isVert
      ? { top: 28, right: 20, bottom: 40, left: 50 }
      : { top: 15, right: 54, bottom: 25, left: 130 };

    const maxVal = Math.max(...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)), 1);
    const roundStep = Math.pow(10, Math.floor(Math.log10(maxVal)) - 1) * 2 || 1;
    const ticksMax = Math.ceil(maxVal / roundStep) * roundStep;
    const ticks = [0, ticksMax * 0.25, ticksMax * 0.5, ticksMax * 0.75, ticksMax];

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

    function draw(highlightIdx?: number, animProgress: number = 1) {
      if (!ctx || !canvas) return;
      const progress = Math.max(0, Math.min(1, animProgress));
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const cL = PAD.left,
        cR = W - PAD.right,
        cT = PAD.top,
        cB = H - PAD.bottom;
      const cW = cR - cL,
        cH = cB - cT;

      ctx.font = '10px "Roboto Mono", monospace';
      ctx.fillStyle = isDark ? "#94a3b8" : "#475569";

      if (isVert) {
        // Draw gridlines (horizontal) and Y ticks
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ticks.forEach((v) => {
          const y = cB - (v / ticksMax) * cH;
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cL, y);
          ctx.lineTo(cR, y);
          ctx.stroke();

          ctx.fillStyle = isDark ? "#94a3b8" : "#475569";
          ctx.fillText(formatShortVal(v), cL - 10, y);
        });

        // Draw X labels
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDark ? "#94a3b8" : "#334155";
        data.forEach((d, i) => {
          const x = cL + (i + 0.5) * (cW / data.length);
          const name = String(d[xAxisKey]);
          const dispName = fitLabel(ctx, name, Math.max(0, cW / data.length - 8));
          ctx.fillText(dispName, x, cB + 10);
        });

        // Draw vertical solid bars
        const groupW = cW / data.length;
        const totalBarW = Math.max(1, groupW * 0.75);
        const singleBarW = Math.max(1, totalBarW / series.length);
        const groupGap = (groupW - totalBarW) / 2;

        data.forEach((d, i) => {
          const isSelected = highlightIdx === i;

          if (isSelected) {
            ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)";
            ctx.fillRect(cL + i * groupW, cT, groupW, cH);
          }

          series.forEach((s, sIdx) => {
            const val = Number(d[s.key]) || 0;
            if (val <= 0) return;
            const barH = ((val * progress) / ticksMax) * cH;
            const bx = cL + i * groupW + groupGap + sIdx * singleBarW;
            const barTopY = cB - barH;
            ctx.fillStyle = s.color;
            ctx.fillRect(Math.round(bx), Math.round(barTopY), Math.max(1, Math.round(singleBarW - 1)), Math.max(1, Math.round(barH)));

            // Numeric value directly above each bar so user can read directly
            if (progress >= 0.85 || isSelected) {
              ctx.save();
              ctx.font = 'bold 9px "Roboto Mono", monospace';
              ctx.textAlign = "center";
              ctx.textBaseline = "bottom";
              ctx.fillStyle = isSelected
                ? (isDark ? "#ffffff" : "#0f172a")
                : (isDark ? "#f2f2f2" : "#1e293b");
              ctx.fillText(formatShortVal(val), bx + singleBarW / 2, barTopY - 3);
              ctx.restore();
            }
          });
        });
      } else {
        // Horizontal layout
        // Draw gridlines (vertical) and X ticks
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ticks.forEach((v) => {
          const x = cL + (v / ticksMax) * cW;
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, cT);
          ctx.lineTo(x, cB);
          ctx.stroke();

          ctx.fillStyle = isDark ? "#94a3b8" : "#475569";
          ctx.fillText(formatShortVal(v), x, cB + 16);
        });

        // Draw Y labels (Category/Names)
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDark ? "#94a3b8" : "#334155";
        data.forEach((d, i) => {
          const y = cT + (i + 0.5) * (cH / data.length);
          const name = String(d[xAxisKey]);
          const dispName = fitLabel(ctx, name, PAD.left - 18);
          ctx.fillText(dispName, cL - 10, y);
        });

        // Draw horizontal solid bars
        const groupH = cH / data.length;
        const totalBarH = Math.max(2, groupH * 0.75);
        const singleBarH = Math.max(1, totalBarH / series.length);
        const groupGap = (groupH - totalBarH) / 2;

        data.forEach((d, i) => {
          const isSelected = highlightIdx === i;

          if (isSelected) {
            ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)";
            ctx.fillRect(cL, cT + i * groupH, cW, groupH);
          }

          series.forEach((s, sIdx) => {
            const val = Number(d[s.key]) || 0;
            if (val <= 0) return;
            const barW = ((val * progress) / ticksMax) * cW;
            const by = cT + i * groupH + groupGap + sIdx * singleBarH;
            ctx.fillStyle = s.color;
            ctx.fillRect(Math.round(cL), Math.round(by), Math.max(1, Math.round(barW)), Math.max(1, Math.round(singleBarH - 1)));

            // Numeric value directly at the end of each bar so user can read directly
            if (progress >= 0.85 || isSelected) {
              const barRightX = cL + barW;
              ctx.save();
              ctx.font = 'bold 9px "Roboto Mono", monospace';
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.fillStyle = isSelected
                ? (isDark ? "#ffffff" : "#0f172a")
                : (isDark ? "#f2f2f2" : "#1e293b");
              ctx.fillText(formatShortVal(val), barRightX + 6, by + singleBarH / 2);
              ctx.restore();
            }
          });
        });
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const W = rect.width;
      const H = rect.height;
      const cL = PAD.left,
        cR = W - PAD.right,
        cT = PAD.top,
        cB = H - PAD.bottom;
      const cW = cR - cL,
        cH = cB - cT;

      let idx = -1;
      if (isVert) {
        if (mx >= cL && mx <= cR) {
          idx = Math.floor(((mx - cL) / cW) * data.length);
        }
      } else {
        if (my >= cT && my <= cB) {
          idx = Math.floor(((my - cT) / cH) * data.length);
        }
      }

      if (idx < 0 || idx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      let tooltipContent = `<div class="font-bold text-xs border-b border-border/40 pb-1 mb-1">${d[xAxisKey]}</div>`;
      series.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-sans tabular-nums font-semibold text-xs">${val.toLocaleString()}</span>
        </div>`;
      });

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = "block";

      const tipWidth = tooltip.offsetWidth || 140;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 60) + "px";
      draw(idx);
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const W = rect.width;
      const H = rect.height;
      const cL = PAD.left,
        cR = W - PAD.right,
        cT = PAD.top,
        cB = H - PAD.bottom;
      const cW = cR - cL,
        cH = cB - cT;

      let idx = -1;
      if (isVert) {
        if (mx >= cL && mx <= cR) {
          idx = Math.floor(((mx - cL) / cW) * data.length);
        }
      } else {
        if (my >= cT && my <= cB) {
          idx = Math.floor(((my - cT) / cH) * data.length);
        }
      }

      if (idx < 0 || idx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      let tooltipContent = `<div class="font-bold text-xs border-b border-border/40 pb-1 mb-1">${d[xAxisKey]}</div>`;
      series.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-sans tabular-nums font-semibold text-xs">${val.toLocaleString()}</span>
        </div>`;
      });

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = "block";

      const tipWidth = tooltip.offsetWidth || 140;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 60) + "px";
      draw(idx);
    };

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw();
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouch, { passive: true });
    canvas.addEventListener("touchmove", handleTouch, { passive: true });
    canvas.addEventListener("touchend", handleMouseLeave);
    let animId: number | null = null;
    if (hasAnimatedRef.current) {
      draw(undefined, 1);
    } else {
      let startTime: number | null = null;
      const duration = 750;

      function animate(timestamp: number) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const t = Math.min(1, elapsed / duration);
        const progress = 1 - Math.pow(1 - t, 3);
        draw(undefined, progress);
        if (t < 1) {
          animId = requestAnimationFrame(animate);
        } else {
          animId = null;
          hasAnimatedRef.current = true;
          draw(undefined, 1);
        }
      }
      animId = requestAnimationFrame(animate);
    }

    const ro = new ResizeObserver(() => {
      if (animId) cancelAnimationFrame(animId);
      resize();
    });
    ro.observe(container);

    const resizeTimer = window.setTimeout(resize, 60);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.clearTimeout(resizeTimer);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("touchmove", handleTouch);
      canvas.removeEventListener("touchend", handleMouseLeave);
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, [data, series, xAxisKey, layout, isDark]);

  return (
    <div ref={containerRef} className="w-full h-full min-w-0 min-h-0 relative chart-animate-in chart-shimmer-border">
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-3 border font-mono text-[10px] shadow-lg rounded-none hidden z-10 backdrop-blur-md",
          isDark
            ? "bg-black/95 border-zinc-800 text-white shadow-2xl"
            : "bg-white/95 border-slate-300 text-slate-900 shadow-xl"
        )}
      ></div>
    </div>
  );
}

// ── 3. CANVAS PIE/DONUT CHART (INTERACTIVE WITH SLICE SHIFT) ──
export function CanvasPieChart({
  data,
  nameKey = "name",
  valueKey = "value",
  title = "TOTAL",
  colors,
  showLegend = true,
  pageSize = 5,
  isDark: propIsDark,
  height = 220,
}: {
  data: any[];
  nameKey?: string;
  valueKey?: string;
  title?: string;
  colors?: string[];
  showLegend?: boolean;
  pageSize?: number;
  isDark?: boolean;
  height?: number;
}) {
  const storeTheme = useThemeStore((state) => state.theme);
  const isDark = propIsDark !== undefined ? propIsDark : storeTheme !== "light";
  const palette = colors && colors.length > 0 ? colors : BRAND_MODULE_PALETTE;

  const [legendPage, setLegendPage] = useState(1);
  useEffect(() => {
    setLegendPage(1);
  }, [data]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip || !data || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const totalVal = data.reduce((sum, item) => sum + (Number(item[valueKey]) || 0), 0);

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

    function draw(highlightIdx?: number, animProgress: number = 1) {
      if (!ctx || !canvas) return;
      const progress = Math.max(0, Math.min(1, animProgress));
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const baseRadius = Math.min(cx, cy) * 0.75;
      const radius = baseRadius * (0.86 + 0.14 * progress);
      const innerRadius = radius * 0.55;

      if (totalVal <= 0) {
        ctx.strokeStyle = isDark ? "#27272a" : "#e4e4e7";
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, (radius + innerRadius) / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDark ? "#71717a" : "#a1a1aa";
        ctx.font = 'bold 11px "Roboto Mono", monospace';
        ctx.fillText("NO DATA", cx, cy);
        return;
      }

      let startAngle = -Math.PI / 2;

      data.forEach((d, i) => {
        const val = Number(d[valueKey]) || 0;
        if (val === 0) return;
        const sliceAngle = (val / totalVal) * Math.PI * 2 * progress;
        const endAngle = startAngle + sliceAngle;
        const isHovered = highlightIdx === i;

        let scx = cx;
        let scy = cy;
        if (isHovered) {
          const midAngle = startAngle + sliceAngle / 2;
          scx += Math.cos(midAngle) * 8;
          scy += Math.sin(midAngle) * 8;
        }

        ctx.fillStyle = d.color || palette[i % palette.length];
        ctx.beginPath();
        ctx.arc(scx, scy, radius, startAngle, endAngle);
        ctx.arc(scx, scy, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fill();

        // Divider
        ctx.strokeStyle = isDark ? "#09090b" : "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        startAngle = endAngle;
      });

      // Center text inside hole
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isDark ? "#ffffff" : "#0f172a";
      ctx.font = 'bold 11px "Roboto Mono", monospace';
      ctx.fillText(title, cx, cy - 8);
      ctx.font = 'bold 15px "Roboto Mono", monospace';
      ctx.fillText(formatShortVal(totalVal), cx, cy + 9);
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const W = rect.width;
      const H = rect.height;

      const cx = W / 2;
      const cy = H / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const radius = Math.min(cx, cy) * 0.75;
      const innerRadius = radius * 0.55;

      if (dist < innerRadius || dist > radius + 15) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += Math.PI * 2;

      // Keep pointer and slice angles in the same [0, 2π) coordinate space.
      // Comparing a normalized pointer angle to a negative start angle caused
      // slices crossing the top of the donut (including the first purple item)
      // to miss their hover target.
      let startAngle = Math.PI * 1.5;
      let matchedIdx = -1;

      for (let i = 0; i < data.length; i++) {
        const val = Number(data[i][valueKey]) || 0;
        if (val === 0) continue;
        const sliceAngle = (val / totalVal) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        const adjustedAngle = angle < Math.PI * 1.5 ? angle + Math.PI * 2 : angle;
        if (adjustedAngle >= startAngle && adjustedAngle < endAngle) {
          matchedIdx = i;
          break;
        }
        startAngle = endAngle;
      }

      if (matchedIdx < 0 || matchedIdx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[matchedIdx];
      const val = Number(d[valueKey]) || 0;
      const pct = ((val / totalVal) * 100).toFixed(1);

      tooltip.innerHTML = `<div class="font-bold text-xs pb-1 border-b border-border/40 flex items-center gap-1.5">
        <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background-color: ${d.color || palette[matchedIdx % palette.length]}"></span>
        ${d[nameKey]}
      </div>
      <div class="flex items-center justify-between gap-6 mt-1.5 font-mono text-xs">
        <span class="text-[10px] text-muted-foreground uppercase">Value:</span>
        <span class="font-bold">${val.toLocaleString()}</span>
      </div>
      <div class="flex items-center justify-between gap-6 mt-0.5 font-mono text-xs">
        <span class="text-[10px] text-muted-foreground uppercase">Ratio:</span>
        <span class="font-bold text-purple-600 dark:text-purple-400">${pct}%</span>
      </div>`;

      tooltip.style.display = "block";
      const tipWidth = tooltip.offsetWidth || 140;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 50) + "px";
      draw(matchedIdx);
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const W = rect.width;
      const H = rect.height;

      const cx = W / 2;
      const cy = H / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const radius = Math.min(cx, cy) * 0.75;
      const innerRadius = radius * 0.55;

      if (dist < innerRadius || dist > radius + 15) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += Math.PI * 2;

      let startAngle = Math.PI * 1.5;
      let matchedIdx = -1;

      for (let i = 0; i < data.length; i++) {
        const val = Number(data[i][valueKey]) || 0;
        if (val === 0) continue;
        const sliceAngle = (val / totalVal) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        const adjustedAngle = angle < Math.PI * 1.5 ? angle + Math.PI * 2 : angle;
        if (adjustedAngle >= startAngle && adjustedAngle < endAngle) {
          matchedIdx = i;
          break;
        }
        startAngle = endAngle;
      }

      if (matchedIdx < 0 || matchedIdx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[matchedIdx];
      const val = Number(d[valueKey]) || 0;
      const pct = ((val / totalVal) * 100).toFixed(1);

      tooltip.innerHTML = `<div class="font-bold text-xs pb-1 border-b border-border/40 flex items-center gap-1.5">
        <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background-color: ${d.color || palette[matchedIdx % palette.length]}"></span>
        ${d[nameKey]}
      </div>
      <div class="flex items-center justify-between gap-6 mt-1.5 font-mono text-xs">
        <span class="text-[10px] text-muted-foreground uppercase">Value:</span>
        <span class="font-bold">${val.toLocaleString()}</span>
      </div>
      <div class="flex items-center justify-between gap-6 mt-0.5 font-mono text-xs">
        <span class="text-[10px] text-muted-foreground uppercase">Ratio:</span>
        <span class="font-bold text-purple-600 dark:text-purple-400">${pct}%</span>
      </div>`;

      tooltip.style.display = "block";
      const tipWidth = tooltip.offsetWidth || 140;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 50) + "px";
      draw(matchedIdx);
    };

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw();
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouch, { passive: true });
    canvas.addEventListener("touchmove", handleTouch, { passive: true });
    canvas.addEventListener("touchend", handleMouseLeave);
    window.addEventListener("resize", resize);

    let animId: number | null = null;
    if (hasAnimatedRef.current) {
      draw(undefined, 1);
    } else {
      let startTime: number | null = null;
      const duration = 800;

      function animate(timestamp: number) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const t = Math.min(1, elapsed / duration);
        const progress = 1 - Math.pow(1 - t, 3);
        draw(undefined, progress);
        if (t < 1) {
          animId = requestAnimationFrame(animate);
        } else {
          animId = null;
          hasAnimatedRef.current = true;
          draw(undefined, 1);
        }
      }
      animId = requestAnimationFrame(animate);
    }

    const ro = new ResizeObserver(() => {
      if (animId) cancelAnimationFrame(animId);
      resize();
    });
    ro.observe(container);

    const resizeTimer = window.setTimeout(resize, 60);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.clearTimeout(resizeTimer);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("touchmove", handleTouch);
      canvas.removeEventListener("touchend", handleMouseLeave);
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, [data, palette, nameKey, valueKey, isDark]);

  const totalVal = data ? data.reduce((sum, item) => sum + (Number(item[valueKey]) || 0), 0) : 0;

  return (
    <div className="w-full flex flex-col items-center chart-animate-in">
      <div
        ref={containerRef}
        style={{ height: height ? `${height}px` : "220px" }}
        className="w-full relative"
      >
        <canvas ref={canvasRef} className="absolute inset-0 block cursor-crosshair w-full h-full"></canvas>
        <div
          ref={tooltipRef}
          className={cn(
            "absolute pointer-events-none p-3 border font-mono text-[10px] shadow-lg rounded-none hidden z-10 backdrop-blur-md",
            isDark
              ? "bg-[#161616]/95 border-[#272727] text-white shadow-2xl"
              : "bg-white/95 border-slate-300 text-slate-900 shadow-xl"
          )}
        ></div>
      </div>

      {showLegend && data && data.length > 0 && (
        <div className="mt-3 w-full flex flex-col gap-1.5 font-mono text-xs">
          {(() => {
            const effectivePageSize = pageSize || 5;
            const totalPages = Math.ceil(data.length / effectivePageSize);
            const startIndex = (legendPage - 1) * effectivePageSize;
            const currentSlice = data.slice(startIndex, startIndex + effectivePageSize);

            return (
              <>
                {currentSlice.map((item, sliceIdx) => {
                  const originalIdx = startIndex + sliceIdx;
                  const val = Number(item[valueKey]) || 0;
                  const pct = totalVal > 0 ? ((val / totalVal) * 100).toFixed(1) : "0.0";
                  const color = item.color || palette[originalIdx % palette.length];
                  return (
                    <div
                      key={originalIdx}
                      className={cn(
                        "flex items-center justify-between py-1 px-2 border rounded-none transition-colors",
                        isDark
                          ? "bg-[#161616] border-[#272727] text-[#F2F2F2] hover:bg-[#202020]"
                          : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span
                          className="w-2.5 h-2.5 rounded-none flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate">{item[nameKey]}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono flex-shrink-0">
                        <span className="text-muted-foreground">{formatShortVal(val)}</span>
                        <span
                          className="px-1.5 py-0.2 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: `${color}20`,
                            color: color,
                            border: `1px solid ${color}40`,
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}

                {data.length > effectivePageSize && (
                  <div className="flex items-center justify-between pt-2 px-1 text-[11px] font-mono text-muted-foreground w-full">
                    <span>
                      {startIndex + 1}–{Math.min(startIndex + effectivePageSize, data.length)} of {data.length}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={legendPage <= 1}
                        onClick={() => setLegendPage((p) => Math.max(1, p - 1))}
                        className={cn(
                          "px-2 py-0.5 border text-[10px] uppercase font-bold transition-colors",
                          legendPage <= 1
                            ? "opacity-40 cursor-not-allowed border-border/40"
                            : "hover:bg-muted/30 border-border/60 text-foreground cursor-pointer"
                        )}
                      >
                        Prev
                      </button>
                      <span>
                        {legendPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={legendPage >= totalPages}
                        onClick={() => setLegendPage((p) => Math.min(totalPages, p + 1))}
                        className={cn(
                          "px-2 py-0.5 border text-[10px] uppercase font-bold transition-colors",
                          legendPage >= totalPages
                            ? "opacity-40 cursor-not-allowed border-border/40"
                            : "hover:bg-muted/30 border-border/60 text-foreground cursor-pointer"
                        )}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── 4. CANVAS COMPOSED CHART (BARS + OVERLAY TREND LINE) ──
export function CanvasComposedChart({
  data,
  xAxisKey,
  barSeries,
  lineSeries,
  isDark: propIsDark,
}: {
  data: any[];
  xAxisKey: string;
  barSeries: SeriesConfig[];
  lineSeries: SeriesConfig;
  isDark?: boolean;
}) {
  const storeTheme = useThemeStore((state) => state.theme);
  const isDark = propIsDark !== undefined ? propIsDark : storeTheme !== "light";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip || !data || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const PAD = { top: 28, right: 48, bottom: 35, left: 48 };

    const maxBarVal = Math.max(
      ...data.flatMap((d) => barSeries.map((s) => Number(d[s.key]) || 0)),
      10
    );
    const maxLineVal = Math.max(...data.map((d) => Number(d[lineSeries.key]) || 0), 10);

    const stepBar = Math.pow(10, Math.floor(Math.log10(maxBarVal)) - 1) * 2 || 2;
    const yBarMax = Math.ceil(maxBarVal / stepBar) * stepBar;

    const stepLine = Math.pow(10, Math.floor(Math.log10(maxLineVal)) - 1) * 2 || 2;
    const yLineMax = Math.ceil(maxLineVal / stepLine) * stepLine;

    const yTicks = [0, 0.25, 0.5, 0.75, 1];

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

    function draw(highlightIdx?: number, animProgress: number = 1) {
      if (!ctx || !canvas) return;
      const progress = Math.max(0, Math.min(1, animProgress));
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const cL = PAD.left,
        cR = W - PAD.right,
        cT = PAD.top,
        cB = H - PAD.bottom;
      const cW = cR - cL,
        cH = cB - cT;

      ctx.font = '10px "Roboto Mono", monospace';

      // Draw gridlines and tick labels (left Y-axis and right Y-axis)
      yTicks.forEach((ratio) => {
        const y = cB - ratio * cH;
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();

        // Left ticks (bars)
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDark ? "#94a3b8" : "#475569";
        ctx.fillText(formatShortVal(ratio * yBarMax), cL - 10, y);

        // Right ticks (line)
        ctx.textAlign = "left";
        ctx.fillStyle = lineSeries.color || "#f59e0b";
        ctx.fillText(formatShortVal(ratio * yLineMax), cR + 10, y);
      });

      // Draw X axis values
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isDark ? "#94a3b8" : "#334155";
      data.forEach((d, i) => {
        const x = cL + (i + 0.5) * (cW / data.length);
        const name = String(d[xAxisKey]);
        const dispName = fitLabel(ctx, name, Math.max(0, cW / data.length - 8));
        ctx.fillText(dispName, x, cB + 10);
      });

      // Draw vertical solid bars
      const groupW = cW / data.length;
      const totalBarW = Math.max(1, groupW * 0.7);
      const singleBarW = Math.max(1, totalBarW / barSeries.length);
      const groupGap = (groupW - totalBarW) / 2;

      data.forEach((d, i) => {
        const isSelected = highlightIdx === i;

        if (isSelected) {
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)";
          ctx.fillRect(cL + i * groupW, cT, groupW, cH);
        }

        barSeries.forEach((s, sIdx) => {
          const val = Number(d[s.key]) || 0;
          if (val <= 0) return;
          const barH = (((val) * progress) / yBarMax) * cH;
          const bx = cL + i * groupW + groupGap + sIdx * singleBarW;
          const barTopY = cB - barH;
          ctx.fillStyle = s.color;
          ctx.fillRect(Math.round(bx), Math.round(barTopY), Math.max(1, Math.round(singleBarW - 1)), Math.max(1, Math.round(barH)));

          // Numeric value directly above each bar so user can read directly
          if (progress >= 0.85 || isSelected) {
            ctx.save();
            ctx.font = 'bold 9px "Roboto Mono", monospace';
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillStyle = isSelected
              ? (isDark ? "#ffffff" : "#0f172a")
              : (isDark ? "#f2f2f2" : "#1e293b");
            ctx.fillText(formatShortVal(val), bx + singleBarW / 2, barTopY - 3);
            ctx.restore();
          }
        });
      });

      // Draw line overlay
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = cL + (i + 0.5) * (cW / data.length);
        const y = cB - (((Number(d[lineSeries.key]) || 0) * progress) / yLineMax) * cH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineSeries.color || "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw line dots with amber glow / crisp border
      data.forEach((d, i) => {
        const x = cL + (i + 0.5) * (cW / data.length);
        const y = cB - (((Number(d[lineSeries.key]) || 0) * progress) / yLineMax) * cH;
        const isSelected = highlightIdx === i;

        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? (isSelected ? "#ffffff" : "#09090b") : "#ffffff";
        ctx.fill();
        ctx.strokeStyle = lineSeries.color || "#f59e0b";
        ctx.lineWidth = isSelected ? 3 : 2.5;
        ctx.stroke();
      });
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const W = rect.width;
      const cL = PAD.left,
        cR = W - PAD.right;
      const cW = cR - cL;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const idx = Math.floor(((mx - cL) / cW) * data.length);
      if (idx < 0 || idx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      let tooltipContent = `<div class="font-bold text-xs pb-1 mb-1 border-b border-border/40">${d[xAxisKey]}</div>`;

      barSeries.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-sans tabular-nums font-semibold text-xs">${val.toLocaleString()}</span>
        </div>`;
      });

      const lineVal = d[lineSeries.key] || 0;
      tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1.5 pt-1 border-t border-border/40">
        <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span class="inline-block w-2.5 h-2.5 rounded-full" style="background-color: ${lineSeries.color}"></span>
          ${lineSeries.name}
        </span>
        <span class="font-sans tabular-nums font-bold text-xs" style="color: ${lineSeries.color}">${lineVal.toLocaleString()}</span>
      </div>`;

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = "block";

      const tipWidth = tooltip.offsetWidth || 150;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 60) + "px";
      draw(idx);
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const W = rect.width;
      const cL = PAD.left,
        cR = W - PAD.right;
      const cW = cR - cL;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const idx = Math.floor(((mx - cL) / cW) * data.length);
      if (idx < 0 || idx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      let tooltipContent = `<div class="font-bold text-xs pb-1 mb-1 border-b border-border/40">${d[xAxisKey]}</div>`;

      barSeries.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-sans tabular-nums font-semibold text-xs">${val.toLocaleString()}</span>
        </div>`;
      });

      const lineVal = d[lineSeries.key] || 0;
      tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1.5 pt-1 border-t border-border/40">
        <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span class="inline-block w-2.5 h-2.5 rounded-full" style="background-color: ${lineSeries.color}"></span>
          ${lineSeries.name}
        </span>
        <span class="font-sans tabular-nums font-bold text-xs" style="color: ${lineSeries.color}">${lineVal.toLocaleString()}</span>
      </div>`;

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = "block";

      const tipWidth = tooltip.offsetWidth || 150;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, my - 60) + "px";
      draw(idx);
    };

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw();
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouch, { passive: true });
    canvas.addEventListener("touchmove", handleTouch, { passive: true });
    canvas.addEventListener("touchend", handleMouseLeave);
    window.addEventListener("resize", resize);

    let animId: number | null = null;
    if (hasAnimatedRef.current) {
      draw(undefined, 1);
    } else {
      let startTime: number | null = null;
      const duration = 800;

      function animate(timestamp: number) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const t = Math.min(1, elapsed / duration);
        const progress = 1 - Math.pow(1 - t, 3);
        draw(undefined, progress);
        if (t < 1) {
          animId = requestAnimationFrame(animate);
        } else {
          animId = null;
          hasAnimatedRef.current = true;
          draw(undefined, 1);
        }
      }
      animId = requestAnimationFrame(animate);
    }

    const ro = new ResizeObserver(() => {
      if (animId) cancelAnimationFrame(animId);
      resize();
    });
    ro.observe(container);

    const resizeTimer = window.setTimeout(resize, 60);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.clearTimeout(resizeTimer);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("touchmove", handleTouch);
      canvas.removeEventListener("touchend", handleMouseLeave);
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, [data, barSeries, lineSeries, xAxisKey, isDark]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 chart-animate-in">
      <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Chart legend">
        {[...barSeries, lineSeries].map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: series.color }} />
            {series.name}
          </span>
        ))}
      </div>
      <div ref={containerRef} className="w-full flex-1 min-w-0 min-h-0 relative chart-shimmer-border">
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-3 border font-mono text-[10px] shadow-lg rounded-none hidden z-10 backdrop-blur-md",
          isDark
            ? "bg-black/95 border-zinc-800 text-white shadow-2xl"
            : "bg-white/95 border-slate-300 text-slate-900 shadow-xl"
        )}
      ></div>
      </div>
    </div>
  );
}
