"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Helper to format values
function formatShortVal(v: number) {
  if (v >= 10000000) return (v / 10000000).toFixed(1) + "Cr";
  if (v >= 100000) return (v / 100000).toFixed(0) + "L";
  if (v >= 1000) return (v / 1000).toFixed(0) + "K";
  return v.toString();
}

// Helper to draw rounded rectangle (only top corners for vertical bars, right corners for horizontal bars)
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  corners: { tl?: boolean; tr?: boolean; bl?: boolean; br?: boolean } = {}
) {
  ctx.beginPath();
  ctx.moveTo(x + (corners.tl ? r : 0), y);
  ctx.lineTo(x + w - (corners.tr ? r : 0), y);
  if (corners.tr) ctx.arcTo(x + w, y, x + w, y + h, r);
  else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - (corners.br ? r : 0));
  if (corners.br) ctx.arcTo(x + w, y + h, x, y + h, r);
  else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + (corners.bl ? r : 0), y + h);
  if (corners.bl) ctx.arcTo(x, y + h, x, y, r);
  else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + (corners.tl ? r : 0));
  if (corners.tl) ctx.arcTo(x, y, x + w, y, r);
  else ctx.lineTo(x, y);
  ctx.closePath();
}

interface SeriesConfig {
  key: string;
  name: string;
  color: string;
}

// ── 1. CANVAS AREA CHART (LINE/AREA WITH GRADIENTS) ──
export function CanvasAreaChart({
  data,
  xAxisKey,
  series,
  isDark = true,
}: {
  data: any[];
  xAxisKey: string;
  series: SeriesConfig[];
  isDark?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip || !data || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const PAD = { top: 25, right: 30, bottom: 35, left: 45 };

    // Calculate max Y value across all series keys
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

    function draw(highlightIdx?: number) {
      if (!ctx || !canvas) return;
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
      ctx.fillStyle = isDark ? "#888" : "#555";

      yTicks.forEach((v) => {
        const y = cB - (v / yMax) * cH;
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
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
      const step = Math.ceil(data.length / 7);
      data.forEach((d, i) => {
        if (i % step === 0 || i === data.length - 1) {
          const x = cL + (i / (data.length - 1)) * cW;
          ctx.fillText(String(d[xAxisKey]), x, cB + 10);
        }
      });

      // Draw Area + Line for each series
      series.forEach((s) => {
        // Draw Area Fill
        ctx.beginPath();
        data.forEach((d, i) => {
          const x = cL + (i / (data.length - 1)) * cW;
          const y = cB - ((Number(d[s.key]) || 0) / yMax) * cH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineTo(cR, cB);
        ctx.lineTo(cL, cB);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, cT, 0, cB);
        grad.addColorStop(0, `${s.color}22`);
        grad.addColorStop(1, `${s.color}00`);
        ctx.fillStyle = grad;
        ctx.fill();

        // Draw Line stroke
        ctx.beginPath();
        data.forEach((d, i) => {
          const x = cL + (i / (data.length - 1)) * cW;
          const y = cB - ((Number(d[s.key]) || 0) / yMax) * cH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Crosshair and Interactive circles
      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < data.length) {
        const hx = cL + (highlightIdx / (data.length - 1)) * cW;

        // Draw vertical dashed line
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, cT);
        ctx.lineTo(hx, cB);
        ctx.stroke();
        ctx.setLineDash([]);

        // Interactive Dot for each series
        series.forEach((s) => {
          const val = Number(data[highlightIdx][s.key]) || 0;
          const hy = cB - (val / yMax) * cH;

          ctx.beginPath();
          ctx.arc(hx, hy, 4, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? "#000" : "#fff";
          ctx.fill();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        });
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const cL = PAD.left,
        cR = W - PAD.right;
      const cW = cR - cL;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const ratio = (mx - cL) / cW;
      const idx = Math.round(ratio * (data.length - 1));
      if (idx < 0 || idx >= data.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      let tooltipContent = `<div class="font-bold text-foreground text-xs border-b border-border/40 pb-1 mb-1">${d[xAxisKey]}</div>`;
      series.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2 h-2 rounded-full" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-mono font-semibold text-foreground text-xs">${val.toLocaleString()}</span>
        </div>`;
      });

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = "block";

      const tipWidth = tooltip.offsetWidth || 140;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(10, e.clientY - rect.top - 60) + "px";
      draw(idx);
    };

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw();
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", resize);

    setTimeout(resize, 100);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [data, series, xAxisKey, isDark]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-3 border font-mono text-[10px] shadow-lg rounded-none hidden z-10 backdrop-blur-sm",
          isDark ? "bg-black/95 border-neutral-800 text-white" : "bg-white/95 border-neutral-200 text-neutral-800"
        )}
      ></div>
    </div>
  );
}

// ── 2. CANVAS BAR CHART (VERTICAL/HORIZONTAL) ──
export function CanvasBarChart({
  data,
  xAxisKey,
  series,
  layout = "vertical",
  isDark = true,
}: {
  data: any[];
  xAxisKey: string;
  series: SeriesConfig[];
  layout?: "vertical" | "horizontal";
  isDark?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip || !data || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isVert = layout === "vertical";
    const PAD = isVert 
      ? { top: 20, right: 20, bottom: 35, left: 45 } 
      : { top: 15, right: 30, bottom: 25, left: 110 };

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

    function draw(highlightIdx?: number) {
      if (!ctx || !canvas) return;
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

      ctx.font = '9px "Roboto Mono", monospace';
      ctx.fillStyle = isDark ? "#888" : "#555";

      if (isVert) {
        // Draw gridlines (horizontal) and Y ticks
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ticks.forEach((v) => {
          const y = cB - (v / ticksMax) * cH;
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cL, y);
          ctx.lineTo(cR, y);
          ctx.stroke();

          ctx.fillText(formatShortVal(v), cL - 10, y);
        });

        // Draw X labels
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        data.forEach((d, i) => {
          const x = cL + (i + 0.5) * (cW / data.length);
          ctx.fillText(String(d[xAxisKey]), x, cB + 10);
        });

        // Draw vertical bars
        const groupW = cW / data.length;
        const totalBarW = groupW * 0.7;
        const singleBarW = totalBarW / series.length;
        const groupGap = (groupW - totalBarW) / 2;

        data.forEach((d, i) => {
          const isSelected = highlightIdx === i;
          
          if (isSelected) {
            // Draw background hover row card
            ctx.fillStyle = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)";
            ctx.fillRect(cL + i * groupW, cT, groupW, cH);
          }

          series.forEach((s, sIdx) => {
            const val = Number(d[s.key]) || 0;
            const barH = (val / ticksMax) * cH;
            const bx = cL + i * groupW + groupGap + sIdx * singleBarW;
            const by = cB - barH;

            ctx.fillStyle = s.color;
            ctx.globalAlpha = isSelected ? 1 : 0.85;
            
            drawRoundRect(ctx, bx, by, singleBarW - 1, barH, Math.min(3, barH), { tl: true, tr: true });
            ctx.fill();
            ctx.globalAlpha = 1;
          });
        });
      } else {
        // Draw gridlines (vertical) and X ticks
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ticks.forEach((v) => {
          const x = cL + (v / ticksMax) * cW;
          ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, cT);
          ctx.lineTo(x, cB);
          ctx.stroke();

          ctx.fillText(formatShortVal(v), x, cB + 15);
        });

        // Draw Y labels (Category/Names)
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        data.forEach((d, i) => {
          const y = cT + (i + 0.5) * (cH / data.length);
          const name = String(d[xAxisKey]);
          const dispName = name.length > 15 ? name.substring(0, 13) + ".." : name;
          ctx.fillText(dispName, cL - 10, y);
        });

        // Draw horizontal bars
        const groupH = cH / data.length;
        const totalBarH = groupH * 0.7;
        const singleBarH = totalBarH / series.length;
        const groupGap = (groupH - totalBarH) / 2;

        data.forEach((d, i) => {
          const isSelected = highlightIdx === i;

          if (isSelected) {
            ctx.fillStyle = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)";
            ctx.fillRect(cL, cT + i * groupH, cW, groupH);
          }

          series.forEach((s, sIdx) => {
            const val = Number(d[s.key]) || 0;
            const barW = (val / ticksMax) * cW;
            const bx = cL;
            const by = cT + i * groupH + groupGap + sIdx * singleBarH;

            ctx.fillStyle = s.color;
            ctx.globalAlpha = isSelected ? 1 : 0.85;

            drawRoundRect(ctx, bx, by, barW, singleBarH - 1, Math.min(3, barW), { tr: true, br: true });
            ctx.fill();
            ctx.globalAlpha = 1;
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
      let tooltipContent = `<div class="font-bold text-foreground text-xs border-b border-border/40 pb-1 mb-1">${d[xAxisKey]}</div>`;
      series.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2.5 h-2.5 rounded-full" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-mono font-semibold text-foreground text-xs">${val.toLocaleString()}</span>
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
    window.addEventListener("resize", resize);

    setTimeout(resize, 100);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [data, series, xAxisKey, layout, isDark]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-3 border font-mono text-[10px] shadow-lg rounded-none hidden z-10 backdrop-blur-sm",
          isDark ? "bg-black/95 border-neutral-800 text-white" : "bg-white/95 border-neutral-200 text-neutral-800"
        )}
      ></div>
    </div>
  );
}

// ── 3. CANVAS PIE/DONUT CHART (INTERACTIVE WITH SLICE SHIFT) ──
export function CanvasPieChart({
  data,
  nameKey,
  valueKey,
  colors,
  isDark = true,
}: {
  data: any[];
  nameKey: string;
  valueKey: string;
  colors: string[];
  isDark?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

    function draw(highlightIdx?: number) {
      if (!ctx || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const radius = Math.min(cx, cy) * 0.75;
      const innerRadius = radius * 0.55;

      let startAngle = -Math.PI / 2;

      data.forEach((d, i) => {
        const val = Number(d[valueKey]) || 0;
        if (val === 0) return;
        const sliceAngle = (val / totalVal) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;
        const isHovered = highlightIdx === i;

        // Shift slice center slightly outward on hover
        let scx = cx;
        let scy = cy;
        if (isHovered) {
          const midAngle = startAngle + sliceAngle / 2;
          scx += Math.cos(midAngle) * 8;
          scy += Math.sin(midAngle) * 8;
        }

        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(scx, scy, radius, startAngle, endAngle);
        ctx.arc(scx, scy, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fill();

        // Draw a small border divider
        ctx.strokeStyle = isDark ? "#000" : "#fff";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        startAngle = endAngle;
      });

      // Draw center text inside the donut hole
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isDark ? "#fff" : "#000";
      ctx.font = 'bold 11px "Roboto Mono", monospace';
      ctx.fillText("TOTAL", cx, cy - 8);
      ctx.font = 'bold 14px "Roboto Mono", monospace';
      ctx.fillText(formatShortVal(totalVal), cx, cy + 8);
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
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      else if (angle < 0) angle += Math.PI * 2;

      let startAngle = -Math.PI / 2;
      let matchedIdx = -1;

      for (let i = 0; i < data.length; i++) {
        const val = Number(data[i][valueKey]) || 0;
        if (val === 0) continue;
        const sliceAngle = (val / totalVal) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        let adjustedAngle = angle;
        if (angle >= -Math.PI / 2 && angle < startAngle) {
          adjustedAngle += Math.PI * 2;
        }

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

      tooltip.innerHTML = `<div class="font-bold text-foreground text-xs pb-1 border-b border-border/40 flex items-center gap-1.5">
        <span class="inline-block w-2 h-2 rounded-full" style="background-color: ${colors[matchedIdx % colors.length]}"></span>
        ${d[nameKey]}
      </div>
      <div class="flex items-center justify-between gap-6 mt-1.5 font-mono text-xs">
        <span class="text-[10px] text-muted-foreground uppercase">Value:</span>
        <span class="font-bold">${val.toLocaleString()}</span>
      </div>
      <div class="flex items-center justify-between gap-6 mt-0.5 font-mono text-xs">
        <span class="text-[10px] text-muted-foreground uppercase">Ratio:</span>
        <span class="font-bold text-primary">${pct}%</span>
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
    window.addEventListener("resize", resize);

    setTimeout(resize, 100);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [data, colors, nameKey, valueKey, isDark]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-3 border font-mono text-[10px] shadow-lg rounded-none hidden z-10 backdrop-blur-sm",
          isDark ? "bg-black/95 border-neutral-800 text-white" : "bg-white/95 border-neutral-200 text-neutral-800"
        )}
      ></div>
    </div>
  );
}

// ── 4. CANVAS COMPOSED CHART (BARS + OVERLAY LINE) ──
export function CanvasComposedChart({
  data,
  xAxisKey,
  barSeries,
  lineSeries,
  isDark = true,
}: {
  data: any[];
  xAxisKey: string;
  barSeries: SeriesConfig[];
  lineSeries: SeriesConfig;
  isDark?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip || !data || data.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const PAD = { top: 25, right: 45, bottom: 35, left: 45 };

    // Max values for left Y-axis (bars) and right Y-axis (line)
    const maxBarVal = Math.max(...data.flatMap((d) => barSeries.map((s) => Number(d[s.key]) || 0)), 10);
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

    function draw(highlightIdx?: number) {
      if (!ctx || !canvas) return;
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

      ctx.font = '9px "Roboto Mono", monospace';
      ctx.fillStyle = isDark ? "#888" : "#555";

      // Draw gridlines and tick labels (left Y-axis and right Y-axis)
      yTicks.forEach((ratio) => {
        const y = cB - ratio * cH;
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();

        // Left ticks (bars)
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDark ? "#888" : "#555";
        ctx.fillText(formatShortVal(ratio * yBarMax), cL - 10, y);

        // Right ticks (line)
        ctx.textAlign = "left";
        ctx.fillStyle = lineSeries.color;
        ctx.fillText(formatShortVal(ratio * yLineMax), cR + 10, y);
      });

      // Draw X axis values
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isDark ? "#888" : "#555";
      data.forEach((d, i) => {
        const x = cL + (i + 0.5) * (cW / data.length);
        ctx.fillText(String(d[xAxisKey]), x, cB + 10);
      });

      // Draw vertical bars
      const groupW = cW / data.length;
      const totalBarW = groupW * 0.65;
      const singleBarW = totalBarW / barSeries.length;
      const groupGap = (groupW - totalBarW) / 2;

      data.forEach((d, i) => {
        const isSelected = highlightIdx === i;

        if (isSelected) {
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)";
          ctx.fillRect(cL + i * groupW, cT, groupW, cH);
        }

        barSeries.forEach((s, sIdx) => {
          const val = Number(d[s.key]) || 0;
          const barH = (val / yBarMax) * cH;
          const bx = cL + i * groupW + groupGap + sIdx * singleBarW;
          const by = cB - barH;

          ctx.fillStyle = s.color;
          ctx.globalAlpha = isSelected ? 1 : 0.85;

          drawRoundRect(ctx, bx, by, singleBarW - 1, barH, Math.min(3, barH), { tl: true, tr: true });
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      });

      // Draw line overlay
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = cL + (i + 0.5) * (cW / data.length);
        const y = cB - ((Number(d[lineSeries.key]) || 0) / yLineMax) * cH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineSeries.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw line dots
      data.forEach((d, i) => {
        const x = cL + (i + 0.5) * (cW / data.length);
        const y = cB - ((Number(d[lineSeries.key]) || 0) / yLineMax) * cH;
        const isSelected = highlightIdx === i;

        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "#000" : "#fff";
        ctx.fill();
        ctx.strokeStyle = lineSeries.color;
        ctx.lineWidth = 2.5;
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
      let tooltipContent = `<div class="font-bold text-foreground text-xs border-b border-border/40 pb-1 mb-1">${d[xAxisKey]}</div>`;
      barSeries.forEach((s) => {
        const val = d[s.key] || 0;
        tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1">
          <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span class="inline-block w-2.5 h-2.5 rounded-full" style="background-color: ${s.color}"></span>
            ${s.name}
          </span>
          <span class="font-mono font-semibold text-foreground text-xs">${val.toLocaleString()}</span>
        </div>`;
      });
      const lineVal = d[lineSeries.key] || 0;
      tooltipContent += `<div class="flex items-center justify-between gap-4 mt-1 border-t border-border/20 pt-1">
        <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span class="inline-block w-2.5 h-2.5 rounded-full" style="background-color: ${lineSeries.color}"></span>
          ${lineSeries.name}
        </span>
        <span class="font-mono font-semibold text-foreground text-xs" style="color: ${lineSeries.color}">${lineVal.toLocaleString()}</span>
      </div>`;

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = "block";

      const tipWidth = tooltip.offsetWidth || 145;
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
    window.addEventListener("resize", resize);

    setTimeout(resize, 100);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [data, barSeries, lineSeries, xAxisKey, isDark]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-3 border font-mono text-[10px] shadow-lg rounded-none hidden z-10 backdrop-blur-sm",
          isDark ? "bg-black/95 border-neutral-800 text-white" : "bg-white/95 border-neutral-200 text-neutral-800"
        )}
      ></div>
    </div>
  );
}
