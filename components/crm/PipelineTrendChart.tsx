"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

interface MonthlyPipelinePoint {
  monthKey: string;
  label: string;
  totalValue: number;
  weightedValue: number;
  byStage: Record<string, number>;
}

const STAGE_COLORS: Record<string, string> = {
  "Prospecting": "#6366f1",
  "Discovery": "#3b82f6",
  "Requirement Gathering": "#f59e0b",
  "Solution Fit": "#facc15",
  "Proposal Sent": "#ec4899",
  "Negotiation": "#dc2626",
  "Approval": "#8b5cf6",
  "Closed Won": "#22c55e",
  "Closed Lost": "#757575",
};
const FALLBACK_COLORS = ["#6366f1", "#3b82f6", "#f59e0b", "#facc15", "#ec4899", "#dc2626", "#8b5cf6", "#22c55e", "#a78bfa"];
const stageColor = (stage: string, idx: number) => STAGE_COLORS[stage] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

export function PipelineTrendChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [isAdvanced, setIsAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<MonthlyPipelinePoint[]>([]);
  const [stages, setStages] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipDateRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    fetch("/api/crm/reports/pipeline-trend?months=12")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) { setMonths(d.data.months); setStages(d.data.stages); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const hasData = months.some((m) => m.totalValue > 0);

  useEffect(() => {
    if (loading || !hasData) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    const tooltipDate = tooltipDateRef.current;
    const tooltipValue = tooltipValueRef.current;
    if (!canvas || !container || !tooltip || !tooltipDate || !tooltipValue) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = months.length;
    const maxValue = Math.max(...months.map((d) => d.totalValue), 1);
    const yMax = Math.ceil(maxValue / 100000) * 100000 || 100000;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += yMax / 5) yTicks.push(Math.round(v));

    const PAD = { top: 20, right: 60, bottom: 30, left: 10 };

    function formatLakhs(v: number) {
      if (v >= 10000000) return "₹" + (v / 10000000).toFixed(1) + "Cr";
      if (v >= 100000) return "₹" + (v / 100000).toFixed(1) + "L";
      if (v >= 1000) return "₹" + (v / 1000).toFixed(0) + "K";
      return "₹" + v.toString();
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

      const chartL = PAD.left, chartR = W - PAD.right, chartT = PAD.top, chartB = H - PAD.bottom;
      const chartW = chartR - chartL, chartH = chartB - chartT;

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

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      months.forEach((m, i) => {
        const x = chartL + (n === 1 ? 0.5 : i / (n - 1)) * chartW;
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(m.label, x, chartB + 8);
      });

      if (isAdvanced && stages.length) {
        const stacked: number[][] = [];
        for (let d = 0; d < n; d++) {
          let cumulative = 0;
          const row: number[] = [];
          for (let c = 0; c < stages.length; c++) {
            cumulative += months[d].byStage[stages[c]] || 0;
            row.push(cumulative);
          }
          stacked.push(row);
        }
        for (let c = stages.length - 1; c >= 0; c--) {
          ctx.beginPath();
          for (let d = 0; d < n; d++) {
            const x = chartL + (n === 1 ? 0.5 : d / (n - 1)) * chartW;
            const y = chartB - (stacked[d][c] / yMax) * chartH;
            if (d === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          for (let d = n - 1; d >= 0; d--) {
            const x = chartL + (n === 1 ? 0.5 : d / (n - 1)) * chartW;
            const bottomVal = c > 0 ? stacked[d][c - 1] : 0;
            const y = chartB - (bottomVal / yMax) * chartH;
            ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = stageColor(stages[c], c) + "55";
          ctx.fill();
          ctx.beginPath();
          for (let d = 0; d < n; d++) {
            const x = chartL + (n === 1 ? 0.5 : d / (n - 1)) * chartW;
            const y = chartB - (stacked[d][c] / yMax) * chartH;
            if (d === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = stageColor(stages[c], c);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        months.forEach((m, i) => {
          const x = chartL + (n === 1 ? 0.5 : i / (n - 1)) * chartW;
          const y = chartB - (m.totalValue / yMax) * chartH;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.9)" : "rgba(10,10,10,0.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.lineTo(chartR, chartB);
        ctx.lineTo(chartL, chartB);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, chartT, 0, chartB);
        grad.addColorStop(0, isDark ? "rgba(255,255,255,0.06)" : "rgba(10,10,10,0.06)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }

      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < n) {
        const x = chartL + (n === 1 ? 0.5 : highlightIdx / (n - 1)) * chartW;
        const m = months[highlightIdx];
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartT);
        ctx.lineTo(x, chartB);
        ctx.stroke();
        ctx.setLineDash([]);

        const y = chartB - (m.totalValue / yMax) * chartH;
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
      const chartL = PAD.left, chartR = W - PAD.right, chartW = chartR - chartL;

      if (mx < chartL || mx > chartR) { tooltip.style.display = "none"; draw(); return; }

      const ratio = (mx - chartL) / chartW;
      const idx = Math.round(ratio * (n - 1));
      if (idx < 0 || idx >= n) { tooltip.style.display = "none"; draw(); return; }

      const m = months[idx];
      tooltipDate.textContent = m.label;
      tooltipValue.textContent = m.totalValue.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

      tooltip.style.display = "block";
      const tipX = mx + 16;
      const tipY = e.clientY - rect.top - 40;
      tooltip.style.left = (tipX + 180 > W ? mx - 190 : tipX) + "px";
      tooltip.style.top = Math.max(0, tipY) + "px";
      draw(idx);
    };

    const handleMouseLeave = () => { tooltip.style.display = "none"; draw(); };

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
  }, [isAdvanced, isDark, months, stages, loading, hasData]);

  useEffect(() => { drawRef.current(); }, [isAdvanced]);

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${isDark ? "bg-card border-border text-white" : "bg-white border-border text-foreground"}`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className={`text-lg font-normal uppercase mt-1 ${isDark ? "text-white" : "text-foreground"}`}>Sales Pipeline Trend</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">New pipeline value created per month, last 12 months</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <button
            onClick={() => setIsAdvanced(false)}
            className={`cursor-pointer pb-0.5 relative transition-colors ${!isAdvanced ? (isDark ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-4px] after:w-full after:h-[1px] after:bg-white font-medium" : "text-foreground after:content-[''] after:absolute after:left-0 after:bottom-[-4px] after:w-full after:h-[1px] after:bg-card font-semibold") : (isDark ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground hover:text-muted-foreground")}`}
          >
            Overview
          </button>
          <button
            onClick={() => setIsAdvanced(true)}
            className={`cursor-pointer pb-0.5 relative transition-colors ${isAdvanced ? (isDark ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-4px] after:w-full after:h-[1px] after:bg-white font-medium" : "text-foreground after:content-[''] after:absolute after:left-0 after:bottom-[-4px] after:w-full after:h-[1px] after:bg-card font-semibold") : (isDark ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground hover:text-muted-foreground")}`}
          >
            By Stage
          </button>
        </div>
      </div>

      {isAdvanced && stages.length > 0 && (
        <div className={`flex flex-wrap gap-x-4 gap-y-2 mb-4 text-[10px] border-b pb-3 ${isDark ? "border-border/60" : "border-border/60"}`}>
          {stages.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-[1px] inline-block" style={{ backgroundColor: stageColor(s, i) }}></span>
              {s}
            </div>
          ))}
        </div>
      )}

      <div ref={containerRef} className="relative w-full h-[360px] mt-2">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading pipeline data…</div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No opportunities created in the last 12 months yet.</div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>
            <div ref={tooltipRef} className={`absolute pointer-events-none p-2.5 font-mono text-[11px] shadow-xl min-w-[150px] rounded-none hidden z-10 border ${isDark ? "bg-[#141414]/95 border-border text-white" : "bg-white/95 border-border text-foreground"}`}>
              <div ref={tooltipDateRef} className="text-muted-foreground mb-0.5"></div>
              <div ref={tooltipValueRef} className="font-semibold text-xs text-indigo-400"></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
