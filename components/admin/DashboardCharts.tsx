"use client";

import { useEffect, useRef, useState } from "react";
import { ChartCard } from "./ChartCard";
import { useThemeStore } from "@/store/themeStore";
import { Send, BarChart3, TrendingUp, Sparkles } from "lucide-react";

interface DashboardChartsProps {
  summary: any;
  formatCurrency: (value: number) => string;
  enabledModules: readonly string[];
}

export function DashboardCharts({
  summary,
  formatCurrency,
  enabledModules,
}: DashboardChartsProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const revenue = summary.finance.totalRevenue;
  const expenses = summary.finance.totalExpenses;
  const net = summary.finance.netIncome;

  const profitAvailable = summary.finance.profitAvailable === true;
  const margin = profitAvailable && revenue > 0 ? (net / revenue) * 100 : null;
  const chartData = summary.chartData || [];
  const hasFinance = enabledModules.includes("finance");
  const hasSales = enabledModules.includes("sales");

  if (!hasFinance && !hasSales) return null;

  return (
    <div className="grid grid-cols-1 gap-1 lg:grid-cols-3">
      {hasFinance && <ChartCard
        title="Financial Health"
        subtitle="All time · Posted revenue, costs & net income"
      >
        <div className="flex min-h-[220px] sm:min-h-[260px] lg:h-[300px] flex-col justify-between font-mono">
          <div className="flex items-start justify-between gap-8">
            <div className="flex-1 space-y-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Revenue
                </p>
                <p className="mt-1 font-sans tabular-nums text-3xl font-bold tracking-tighter text-foreground">
                  {formatCurrency(revenue)}
                </p>
              </div>

              <div className="h-px bg-accent/60" />

              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Expenses
                </p>
                <p className="mt-1 font-sans tabular-nums text-2xl font-semibold tracking-tight text-foreground">
                  {formatCurrency(expenses)}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Net Income
              </span>
              <span className={cn("text-lg font-semibold", !profitAvailable ? "text-muted-foreground" : net >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {profitAvailable ? formatCurrency(net) : "Unavailable"}
              </span>
            </div>

            <div className={cn("h-1.5 overflow-hidden rounded", isDark ? "bg-accent" : "bg-accent")}>
              <div
                className="h-full bg-emerald-500 transition-all duration-1000"
                style={{ width: `${Math.max(0, Math.min(100, margin ?? 0))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Profit Margin</span>
              <span className="font-semibold text-foreground">
                {margin === null ? "Unavailable" : `${margin.toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>
      </ChartCard>}

      {hasFinance && <ChartCard
        title="Revenue Trend"
        subtitle="Last 6 months performance"
      >
        <div className="h-[220px] sm:h-[260px] lg:h-[300px] relative w-full">
          <RevenueCanvas data={chartData} formatCurrency={formatCurrency} isDark={isDark} />
        </div>
      </ChartCard>}

      {hasSales && <ChartCard
        title="Order Activity"
        subtitle="Monthly operational counts"
      >
        <div className="h-[220px] sm:h-[260px] lg:h-[300px] relative w-full">
          <OrdersCanvas data={chartData} isDark={isDark} />
        </div>
      </ChartCard>}
    </div>
  );
}

// ── SUB-COMPONENT: REVENUE CANVAS ──
function RevenueCanvas({
  data,
  formatCurrency,
  isDark,
}: {
  data: any[];
  formatCurrency: (v: number) => string;
  isDark: boolean;
}) {
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

    const maxVal = Math.max(0, ...data.map((d) => Number(d.revenue) || 0));
    const hasData = maxVal > 0;
    const roundStep = hasData
      ? Math.max(10000, Math.pow(10, Math.max(1, Math.floor(Math.log10(maxVal))) - 1) * 5)
      : 10000;
    const yMax = hasData ? Math.ceil(maxVal / roundStep) * roundStep : 10000;
    const yTicks = hasData ? [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax] : [0, yMax * 0.5, yMax];

    const lineColor = isDark ? "#FFFFFF" : "#0F172A";
    const areaFillTop = isDark ? "rgba(255, 255, 255, 0.22)" : "rgba(15, 23, 42, 0.12)";
    const areaFillBottom = isDark ? "rgba(255, 255, 255, 0.01)" : "rgba(15, 23, 42, 0.01)";

    function resize() {
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
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

      const isMobile = W < 420;
      const PAD = {
        top: isMobile ? 18 : 20,
        right: isMobile ? 12 : 18,
        bottom: isMobile ? 32 : 36,
        left: isMobile ? 12 : 16,
      };

      const cL = PAD.left,
        cR = W - PAD.right,
        cT = PAD.top,
        cB = H - PAD.bottom;
      const cW = cR - cL,
        cH = cB - cT;

      // Draw gridlines
      ctx.font = isMobile ? '8.5px "Roboto Mono", monospace' : '9px "Roboto Mono", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      yTicks.forEach((v) => {
        const y = cB - (v / yMax) * cH;
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();

        ctx.fillStyle = isDark ? "#666" : "#888";
        if (v > 0 && hasData) {
          ctx.fillText(formatShortVal(v), cR, y - 6);
        }
      });

      // Draw X Axis months
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = isMobile ? '8.5px "Roboto Mono", monospace' : '9px "Roboto Mono", monospace';
      data.forEach((d, i) => {
        const x = cL + (i / Math.max(1, data.length - 1)) * cW;
        ctx.fillStyle = isDark ? "#888" : "#666";
        ctx.fillText(d.month, x, cB + (isMobile ? 8 : 10));
      });

      if (!hasData) {
        // Clean zero-activity message when all 6 months have 0 revenue
        ctx.save();
        ctx.font = isMobile ? '10px "Roboto Mono", monospace' : '11px "Roboto Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.45)" : "rgba(15, 23, 42, 0.45)";
        ctx.fillText("No revenue transactions recorded in this period", (cL + cR) / 2, (cT + cB) / 2);
        ctx.restore();

        // Subtle baseline
        ctx.beginPath();
        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(15, 23, 42, 0.2)";
        ctx.setLineDash([4, 4]);
        ctx.moveTo(cL, cB);
        ctx.lineTo(cR, cB);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }

      // Draw Line
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = cL + (i / (data.length - 1)) * cW;
        const y = cB - (d.revenue / yMax) * cH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(15, 23, 42, 0.2)";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Area fill
      ctx.lineTo(cR, cB);
      ctx.lineTo(cL, cB);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, cT, 0, cB);
      grad.addColorStop(0, areaFillTop);
      grad.addColorStop(1, areaFillBottom);
      ctx.fillStyle = grad;
      ctx.fill();

      // Highlight points
      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < data.length) {
        const hx = cL + (highlightIdx / (data.length - 1)) * cW;
        const hy = cB - (data[highlightIdx].revenue / yMax) * cH;

        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, cT);
        ctx.lineTo(hx, cB);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "#ffffff" : "#0f172a";
        ctx.fill();
        ctx.strokeStyle = isDark ? "#ffffff" : "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    function formatShortVal(v: number) {
      if (v >= 10000000) return (v / 10000000).toFixed(1) + "Cr";
      if (v >= 100000) return (v / 100000).toFixed(0) + "L";
      if (v >= 1000) return (v / 1000).toFixed(0) + "K";
      return v.toString();
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const isMobile = W < 420;
      const cL = isMobile ? 12 : 16;
      const cR = W - (isMobile ? 12 : 18);
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
      tooltip.innerHTML = `<span class="text-muted-foreground font-mono text-[9px] uppercase tracking-wider block">${d.month} Revenue</span><span class="font-semibold text-emerald-600 dark:text-emerald-400 font-sans tabular-nums text-xs mt-0.5 block">${formatCurrency(
        d.revenue
      )}</span>`;

      tooltip.style.display = "block";
      const tipWidth = tooltip.offsetWidth || 120;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(0, e.clientY - rect.top - 45) + "px";
      draw(idx);
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const W = rect.width;
      const isMobile = W < 420;
      const cL = isMobile ? 12 : 16;
      const cR = W - (isMobile ? 12 : 18);
      const cW = cR - cL;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const n = data.length;
      const ratio = (mx - cL) / cW;
      const idx = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
      if (idx < 0 || idx >= n) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      tooltip.innerHTML = `<span class="text-muted-foreground font-mono text-[9px] uppercase tracking-wider block">${d.month} Revenue</span><span class="font-semibold text-emerald-600 dark:text-emerald-400 font-sans tabular-nums text-xs mt-0.5 block">${formatCurrency(
        d.revenue
      )}</span>`;

      tooltip.style.display = "block";
      const tipWidth = tooltip.offsetWidth || 120;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(0, touch.clientY - rect.top - 45) + "px";
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

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(container);

    setTimeout(resize, 60);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("touchmove", handleTouch);
      canvas.removeEventListener("touchend", handleMouseLeave);
      ro.disconnect();
    };
  }, [data, isDark, formatCurrency]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[180px]">
      <canvas ref={canvasRef} className="block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-2 border font-mono text-[10px] shadow-lg rounded hidden z-10 backdrop-blur-sm",
          isDark ? "bg-[#141414]/90 border-border text-white" : "bg-white/90 border-border text-foreground"
        )}
      ></div>
    </div>
  );
}

// ── SUB-COMPONENT: ORDERS CANVAS ──
function OrdersCanvas({ data, isDark }: { data: any[]; isDark: boolean }) {
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

    const maxVal = Math.max(0, ...data.map((d) => Number(d.orders) || 0));
    const hasData = maxVal > 0;
    const roundStep = maxVal > 100 ? 50 : maxVal > 20 ? 10 : 5;
    const yMax = hasData ? Math.ceil(maxVal / roundStep) * roundStep || 10 : 5;
    const yTicks = hasData ? [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax] : [0, yMax];

    function resize() {
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
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

      const isMobile = W < 420;
      const PAD = {
        top: isMobile ? 24 : 28,
        right: isMobile ? 12 : 18,
        bottom: isMobile ? 32 : 36,
        left: isMobile ? 12 : 16,
      };

      const cL = PAD.left,
        cR = W - PAD.right,
        cT = PAD.top,
        cB = H - PAD.bottom;
      const cW = cR - cL,
        cH = cB - cT;

      // Draw gridlines
      ctx.font = isMobile ? '8.5px "Roboto Mono", monospace' : '9px "Roboto Mono", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      yTicks.forEach((v) => {
        const y = cB - (v / yMax) * cH;
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();

        ctx.fillStyle = isDark ? "#666" : "#888";
        if (v > 0 && hasData) {
          ctx.fillText(Math.round(v).toString(), cR, y - 6);
        }
      });

      if (!hasData) {
        ctx.save();
        ctx.font = isMobile ? '10px "Roboto Mono", monospace' : '11px "Roboto Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.45)" : "rgba(15, 23, 42, 0.45)";
        ctx.fillText("No order activity recorded in this period", (cL + cR) / 2, (cT + cB) / 2 - 10);
        ctx.restore();
      }

      // Draw bars
      const n = data.length;
      const groupWidth = cW / n;
      const barWidth = groupWidth * 0.48;
      const gap = (groupWidth - barWidth) / 2;

      data.forEach((d, i) => {
        const x = cL + i * groupWidth + gap;
        const barH = d.orders > 0 ? (d.orders / yMax) * cH : 2.5;
        const y = cB - barH;

        const grad = ctx.createLinearGradient(x, y, x, cB);
        if (d.orders === 0) {
          grad.addColorStop(0, isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.12)");
          grad.addColorStop(1, isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.04)");
        } else if (isDark) {
          grad.addColorStop(0, highlightIdx === i ? "#FFFFFF" : "#D3BDFF");
          grad.addColorStop(0.3, highlightIdx === i ? "#D3BDFF" : "#B595FF");
          grad.addColorStop(0.7, highlightIdx === i ? "#B595FF" : "#A77DFF");
          grad.addColorStop(1, highlightIdx === i ? "#A77DFF" : "#7C3AED");
        } else {
          grad.addColorStop(0, highlightIdx === i ? "#B595FF" : "#9353E8");
          grad.addColorStop(0.5, highlightIdx === i ? "#9353E8" : "#7C3AED");
          grad.addColorStop(1, highlightIdx === i ? "#6E38D9" : "#5B21B6");
        }
        ctx.fillStyle = grad;

        const r = Math.min(3, barWidth / 2);
        ctx.beginPath();
        ctx.moveTo(x, cB);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barWidth - r, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
        ctx.lineTo(x + barWidth, cB);
        ctx.closePath();
        ctx.fill();

        // Numeric value directly on top of each bar
        ctx.save();
        ctx.font = isMobile ? 'bold 9px "Roboto Mono", monospace' : 'bold 10px "Roboto Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = highlightIdx === i
          ? (isDark ? "#ffffff" : "#0f172a")
          : (isDark ? (d.orders > 0 ? "#f2f2f2" : "#71717a") : (d.orders > 0 ? "#1e293b" : "#94a3b8"));
        ctx.fillText(d.orders.toString(), x + barWidth / 2, y - 3);
        ctx.restore();

        // Month text below
        ctx.font = isMobile ? '8.5px "Roboto Mono", monospace' : '9px "Roboto Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = highlightIdx === i ? (isDark ? "#fff" : "#000") : isDark ? "#888" : "#666";
        ctx.fillText(d.month, x + barWidth / 2, cB + (isMobile ? 8 : 10));
      });
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const isMobile = W < 420;
      const cL = isMobile ? 12 : 16;
      const cR = W - (isMobile ? 12 : 18);
      const cW = cR - cL;
      const n = data.length;
      const groupWidth = cW / n;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const idx = Math.floor((mx - cL) / groupWidth);
      if (idx < 0 || idx >= n) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      tooltip.innerHTML = `<span class="text-muted-foreground font-mono text-[9px] uppercase tracking-wider block">${d.month} Orders</span><span class="font-semibold text-purple-600 dark:text-purple-400 font-mono text-xs mt-0.5 block"><span class="font-sans tabular-nums">${d.orders}</span> orders</span>`;

      tooltip.style.display = "block";
      const tipWidth = tooltip.offsetWidth || 110;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(0, e.clientY - rect.top - 45) + "px";
      draw(idx);
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const W = rect.width;
      const isMobile = W < 420;
      const cL = isMobile ? 12 : 16;
      const cR = W - (isMobile ? 12 : 18);
      const cW = cR - cL;
      const n = data.length;
      const groupWidth = cW / n;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const idx = Math.floor((mx - cL) / groupWidth);
      if (idx < 0 || idx >= n) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = data[idx];
      tooltip.innerHTML = `<span class="text-muted-foreground font-mono text-[9px] uppercase tracking-wider block">${d.month} Orders</span><span class="font-semibold text-purple-600 dark:text-purple-400 font-mono text-xs mt-0.5 block"><span class="font-sans tabular-nums">${d.orders}</span> orders</span>`;

      tooltip.style.display = "block";
      const tipWidth = tooltip.offsetWidth || 110;
      const tipX = mx + 16;
      tooltip.style.left = (tipX + tipWidth > W ? mx - tipWidth - 16 : tipX) + "px";
      tooltip.style.top = Math.max(0, touch.clientY - rect.top - 45) + "px";
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

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(container);

    setTimeout(resize, 60);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("touchmove", handleTouch);
      canvas.removeEventListener("touchend", handleMouseLeave);
      ro.disconnect();
    };
  }, [data, isDark]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[180px]">
      <canvas ref={canvasRef} className="block cursor-crosshair w-full h-full"></canvas>
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-none p-2 border font-mono text-[10px] shadow-lg rounded hidden z-10 backdrop-blur-sm",
          isDark ? "bg-[#141414]/90 border-border text-white" : "bg-white/90 border-border text-foreground"
        )}
      ></div>
    </div>
  );
}

// Helper function
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
