"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/store/themeStore";

export function PipelineTrendChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [isAdvanced, setIsAdvanced] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipDateRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);

  // Maintain reference to drawing function for React-state driven redraws
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    const tooltipDate = tooltipDateRef.current;
    const tooltipValue = tooltipValueRef.current;

    if (!canvas || !container || !tooltip || !tooltipDate || !tooltipValue) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── Data generation (seeded RNG logic) ──
    const startDate = new Date(2025, 5, 12);
    const days = 366;
    const segments = [
      { name: "Enterprise Deals", color: "#6366f1" },
      { name: "Mid-Market", color: "#e11d48" },
      { name: "SMB Sales", color: "#3b82f6" },
      { name: "Inbound Leads", color: "#f59e0b" },
      { name: "Outbound Leads", color: "#facc15" },
      { name: "Partner Channels", color: "#dc2626" },
      { name: "Direct Sales", color: "#1e3a5f" },
      { name: "Online Signups", color: "#22c55e" },
      { name: "Upsells/Expansion", color: "#ec4899" },
      { name: "Renewals", color: "#8b5cf6" },
      { name: "Others", color: "#a78bfa" }
    ];

    let seed = 42;
    function rng() {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    const dailyData: Array<{ date: Date; value: number }> = [];
    const segmentDaily: number[][] = segments.map(() => []);

    for (let d = 0; d < days; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      const dayOfYear = d;

      // Base value: ~₹1.8L to ₹2.6L
      let base = 180000 + rng() * 80000;

      // Big spike around day 20-35 (early July 2025 - Q2 push)
      if (dayOfYear >= 18 && dayOfYear <= 40) {
        const peak = 1 - Math.abs(dayOfYear - 28) / 12;
        base += peak * 1700000 * (0.6 + rng() * 0.4);
      }
      // Secondary smaller spikes
      if (dayOfYear >= 55 && dayOfYear <= 65) {
        base += (1 - Math.abs(dayOfYear - 60) / 6) * 500000 * rng();
      }
      // Elevated period around Sep-Oct '25 (day 80-130)
      if (dayOfYear >= 80 && dayOfYear <= 130) {
        base += rng() * 250000;
      }
      // March 2026 spike (Q4 closeout, day ~265-290)
      if (dayOfYear >= 265 && dayOfYear <= 295) {
        const peak2 = 1 - Math.abs(dayOfYear - 280) / 15;
        base += peak2 * 400000 * (0.5 + rng() * 0.5);
      }

      // Add noise
      base += (rng() - 0.5) * 80000;
      base = Math.max(50000, base);

      dailyData.push({ date, value: Math.round(base) });

      // Split among segments
      const weights = segments.map(() => 0.3 + rng() * 0.7);
      const wSum = weights.reduce((a, b) => a + b, 0);
      segments.forEach((_, i) => {
        segmentDaily[i].push(Math.round((base * weights[i]) / wSum));
      });
    }

    const maxValue = Math.max(...dailyData.map((d) => d.value));
    const yMax = Math.ceil(maxValue / 200000) * 200000;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += 200000) yTicks.push(v);

    const PAD = { top: 20, right: 60, bottom: 50, left: 10 };

    function formatLakhs(v: number) {
      if (v >= 10000000) return "₹" + (v / 10000000).toFixed(1) + "Cr";
      if (v >= 100000) return "₹" + (v / 100000).toFixed(0) + "L";
      if (v >= 1000) return "₹" + (v / 1000).toFixed(0) + "K";
      return "₹" + v.toString();
    }

    function formatDate(d: Date) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return months[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
    }

    function formatFullDate(d: Date) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
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
      draw();
    }

    function draw(highlightIdx?: number) {
      if (!ctx || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const chartL = PAD.left;
      const chartR = W - PAD.right;
      const chartT = PAD.top;
      const chartB = H - PAD.bottom;
      const chartW = chartR - chartL;
      const chartH = chartB - chartT;

      // Y-axis grid + labels
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
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(formatLakhs(v), chartR + 40, y);
      });

      // X-axis labels
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xLabelStep = Math.floor(days / 12);
      for (let i = 0; i < days; i += xLabelStep) {
        const x = chartL + (i / (days - 1)) * chartW;
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(formatDate(dailyData[i].date), x, chartB + 12);
      }

      if (isAdvanced) {
        // Stacked area chart
        const stacked: number[][] = [];
        for (let d = 0; d < days; d++) {
          let cumulative = 0;
          const row: number[] = [];
          for (let c = 0; c < segments.length; c++) {
            cumulative += segmentDaily[c][d];
            row.push(cumulative);
          }
          stacked.push(row);
        }

        // Draw from top segment to bottom
        for (let c = segments.length - 1; c >= 0; c--) {
          ctx.beginPath();
          // Top edge
          for (let d = 0; d < days; d++) {
            const x = chartL + (d / (days - 1)) * chartW;
            const y = chartB - (stacked[d][c] / yMax) * chartH;
            if (d === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          // Bottom edge
          for (let d = days - 1; d >= 0; d--) {
            const x = chartL + (d / (days - 1)) * chartW;
            const bottomVal = c > 0 ? stacked[d][c - 1] : 0;
            const y = chartB - (bottomVal / yMax) * chartH;
            ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = segments[c].color + "55";
          ctx.fill();

          // Line on top
          ctx.beginPath();
          for (let d = 0; d < days; d++) {
            const x = chartL + (d / (days - 1)) * chartW;
            const y = chartB - (stacked[d][c] / yMax) * chartH;
            if (d === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = segments[c].color;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      } else {
        // Overview: single line with subtle fill
        ctx.beginPath();
        for (let d = 0; d < days; d++) {
          const x = chartL + (d / (days - 1)) * chartW;
          const y = chartB - (dailyData[d].value / yMax) * chartH;
          if (d === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.9)" : "rgba(10,10,10,0.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fill
        ctx.lineTo(chartR, chartB);
        ctx.lineTo(chartL, chartB);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, chartT, 0, chartB);
        grad.addColorStop(0, isDark ? "rgba(255,255,255,0.06)" : "rgba(10,10,10,0.06)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Highlight guides + dots on hover
      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < days) {
        const x = chartL + (highlightIdx / (days - 1)) * chartW;
        const d = dailyData[highlightIdx];

        // Crosshair
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartT);
        ctx.lineTo(x, chartB);
        ctx.stroke();
        ctx.setLineDash([]);

        // Highlight dot
        const y = chartB - (d.value / yMax) * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "#fff" : "#000";
        ctx.fill();
        ctx.strokeStyle = isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    drawRef.current = draw;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const H = rect.height;
      const chartL = PAD.left;
      const chartR = W - PAD.right;
      const chartW = chartR - chartL;

      if (mx < chartL || mx > chartR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const ratio = (mx - chartL) / chartW;
      const idx = Math.round(ratio * (days - 1));
      if (idx < 0 || idx >= days) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = dailyData[idx];
      tooltipDate.textContent = formatFullDate(d.date);
      tooltipValue.textContent = d.value.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

      tooltip.style.display = "block";
      const tipX = mx + 16;
      const tipY = e.clientY - rect.top - 40;
      tooltip.style.left = (tipX + 180 > W ? mx - 190 : tipX) + "px";
      tooltip.style.top = Math.max(0, tipY) + "px";

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
  }, [isAdvanced, isDark]);

  // Redraw when modes switch
  useEffect(() => {
    drawRef.current();
  }, [isAdvanced]);

  const segmentsLegend = [
    { name: "Enterprise", color: "#6366f1" },
    { name: "Mid-Market", color: "#e11d48" },
    { name: "SMB", color: "#3b82f6" },
    { name: "Inbound", color: "#f59e0b" },
    { name: "Outbound", color: "#facc15" },
    { name: "Partner Channels", color: "#dc2626" },
    { name: "Direct", color: "#1e3a5f" },
    { name: "Online Signups", color: "#22c55e" },
    { name: "Upsells", color: "#ec4899" },
    { name: "Renewals", color: "#8b5cf6" },
    { name: "Others", color: "#a78bfa" }
  ];

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${
      isDark ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-800"
    }`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className={`text-lg font-normal uppercase mt-1 ${isDark ? "text-white" : "text-neutral-900"}`}>
            Sales Pipeline Trend
          </h2>
        </div>

        {/* Tab switching */}
        <div className="flex items-center gap-4 text-xs">
          <button
            onClick={() => setIsAdvanced(false)}
            className={`cursor-pointer pb-0.5 relative transition-colors ${
              !isAdvanced
                ? isDark
                  ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-4px] after:w-full after:h-[1px] after:bg-white font-medium"
                  : "text-neutral-900 after:content-[''] after:absolute after:left-0 after:bottom-[-4px] after:w-full after:h-[1px] after:bg-neutral-900 font-semibold"
                : isDark
                ? "text-neutral-500 hover:text-neutral-300"
                : "text-neutral-450 hover:text-neutral-600"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setIsAdvanced(true)}
            className={`cursor-pointer pb-0.5 relative transition-colors ${
              isAdvanced
                ? isDark
                  ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-4px] after:w-full after:h-[1px] after:bg-white font-medium"
                  : "text-neutral-900 after:content-[''] after:absolute after:left-0 after:bottom-[-4px] after:w-full after:h-[1px] after:bg-neutral-900 font-semibold"
                : isDark
                ? "text-neutral-500 hover:text-neutral-300"
                : "text-neutral-450 hover:text-neutral-600"
            }`}
          >
            Advanced Breakdown
          </button>
        </div>
      </div>

      {/* Advanced Legend */}
      {isAdvanced && (
        <div className={`flex flex-wrap gap-x-4 gap-y-2 mb-4 text-[10px] border-b pb-3 ${
          isDark ? "border-neutral-800/60" : "border-neutral-200/60"
        }`}>
          {segmentsLegend.map((c) => (
            <div key={c.name} className="flex items-center gap-1.5 text-neutral-400">
              <span
                className="w-2 h-2 rounded-[1px] inline-block"
                style={{ backgroundColor: c.color }}
              ></span>
              {c.name}
            </div>
          ))}
        </div>
      )}

      {/* Chart Canvas Area */}
      <div ref={containerRef} className="relative w-full h-[360px] mt-2">
        <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>

        {/* Custom Tooltip */}
        <div
          ref={tooltipRef}
          className={`absolute pointer-events-none p-2.5 font-mono text-[11px] shadow-xl min-w-[150px] rounded-none hidden z-10 border ${
            isDark ? "bg-[#141414]/95 border-neutral-800 text-white" : "bg-white/95 border-neutral-200 text-neutral-800"
          }`}
        >
          <div ref={tooltipDateRef} className="text-neutral-500 mb-0.5"></div>
          <div ref={tooltipValueRef} className="font-semibold text-xs text-indigo-400"></div>
        </div>
      </div>
    </div>
  );
}
