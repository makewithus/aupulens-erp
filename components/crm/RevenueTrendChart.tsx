"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

interface RevenueTrendPoint {
  monthKey: string;
  label: string;
  monthValue: number;
  cumulativeValue: number;
}

export function RevenueTrendChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<RevenueTrendPoint[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipDateRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/crm/reports/revenue-trend?months=12")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) { setPoints(d.data.points); setTotalRevenue(d.data.totalRevenue); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const hasData = totalRevenue > 0;

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

    function fmtLakhs(v: number) {
      if (v >= 10000000) return "₹" + (v / 10000000).toFixed(1) + "Cr";
      if (v >= 100000) return "₹" + (v / 100000).toFixed(1) + "L";
      if (v >= 1000) return "₹" + (v / 1000).toFixed(0) + "K";
      return "₹" + v.toString();
    }

    const n = points.length;
    const maxVal = Math.max(...points.map((d) => d.cumulativeValue), 1);
    const yMax = Math.ceil(maxVal / 100000) * 100000 || 100000;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += yMax / 5) yTicks.push(Math.round(v));

    const PAD = { top: 16, right: 60, bottom: 30, left: 10 };
    const color = "#10b981";

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

      const cL = PAD.left, cR = W - PAD.right, cT = PAD.top, cB = H - PAD.bottom;
      const cW = cR - cL, cH = cB - cT;

      ctx.font = '10px "Roboto Mono", monospace';
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
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(fmtLakhs(v), cR + 45, y);
      });

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      points.forEach((p, i) => {
        const x = cL + (n === 1 ? 0.5 : i / (n - 1)) * cW;
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(p.label, x, cB + 10);
      });

      ctx.beginPath();
      points.forEach((p, i) => {
        const x = cL + (n === 1 ? 0.5 : i / (n - 1)) * cW;
        const y = cB - (p.cumulativeValue / yMax) * cH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.lineTo(cR, cB);
      ctx.lineTo(cL, cB);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, cT, 0, cB);
      const hexToFill = (c: string, a: number) => {
        const h = c.replace("#", "");
        const rv = parseInt(h.substring(0, 2), 16);
        const gv = parseInt(h.substring(2, 4), 16);
        const bv = parseInt(h.substring(4, 6), 16);
        return `rgba(${rv},${gv},${bv},${a})`;
      };
      grad.addColorStop(0, hexToFill(color, 0.08));
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fill();

      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < n) {
        const hx = cL + (n === 1 ? 0.5 : highlightIdx / (n - 1)) * cW;
        const hy = cB - (points[highlightIdx].cumulativeValue / yMax) * cH;

        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, cT);
        ctx.lineTo(hx, cB);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const cL = PAD.left, cR = W - PAD.right, cW = cR - cL;

      if (mx < cL || mx > cR) { tooltip.style.display = "none"; draw(); return; }

      const ratio = (mx - cL) / cW;
      const idx = Math.round(ratio * (n - 1));
      if (idx < 0 || idx >= n) { tooltip.style.display = "none"; draw(); return; }

      const p = points[idx];
      tooltipDate.textContent = p.label;
      tooltipValue.innerHTML = `<span class="w-2 h-2 rounded-[1px] inline-block mr-1.5" style="background:${color}"></span> Cumulative Rev <b>₹${p.cumulativeValue.toLocaleString("en-IN")}</b>`;

      tooltip.style.display = "block";
      const tipX = mx + 16;
      tooltip.style.left = (tipX + 210 > W ? mx - 220 : tipX) + "px";
      tooltip.style.top = Math.max(0, e.clientY - rect.top - 50) + "px";
      draw(idx);
    };

    const handleMouseLeave = () => { tooltip.style.display = "none"; draw(); };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", resize);

    setTimeout(resize, 120);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [isDark, points, loading, hasData]);

  function fmtHeader(v: number) {
    if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
    if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + " L";
    return "₹" + v.toLocaleString("en-IN");
  }

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${isDark ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-800"}`}>
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-white" : "text-neutral-900"}`}>Cumulative Revenue Trend</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">Closed Won deals, last 12 months</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Revenue (12 mo)</span>
          <span className="text-sm font-semibold text-emerald-400">{fmtHeader(totalRevenue)}</span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[360px]">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading revenue data…</div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No Closed Won deals in the last 12 months yet.</div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>
            <div ref={tooltipRef} className={`absolute pointer-events-none p-2 font-mono text-[11px] shadow-xl min-w-[200px] rounded-none hidden z-10 border ${isDark ? "bg-[#141414]/95 border-neutral-800 text-white" : "bg-white/95 border-neutral-200 text-neutral-800"}`}>
              <div ref={tooltipDateRef} className="text-neutral-500 mb-0.5"></div>
              <div ref={tooltipValueRef} className="flex items-center text-xs mt-1"></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
