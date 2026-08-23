"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

interface RenewalSummary {
  expiring7: number;
  expiring30: number;
  expiring60: number;
  expiring90: number;
  expiredActive: number;
  renewalPipelineValue90Days: number;
}

export function UpcomingRenewalsChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<RenewalSummary | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipDateRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/crm/renewals")
      .then((res) => res.json())
      .then((d) => { if (d.success) setSummary(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const bars = summary ? [
    { label: "Within 7 days", value: summary.expiring7, color: "#e11d48" },
    { label: "Within 30 days", value: summary.expiring30, color: "#f59e0b" },
    { label: "Within 60 days", value: summary.expiring60, color: "#facc15" },
    { label: "Within 90 days", value: summary.expiring90, color: "#a78bfa" },
    { label: "Expired, not renewed", value: summary.expiredActive, color: "#757575" },
  ] : [];

  const hasData = bars.some((b) => b.value > 0);
  const drawRef = useRef<(idx?: number) => void>(() => {});

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

    const n = bars.length;
    const maxVal = Math.max(...bars.map((b) => b.value), 1);
    const PAD = { top: 20, right: 20, bottom: 40, left: 10 };

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
      const slot = cW / n;
      const barW = slot * 0.5;

      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      bars.forEach((b, i) => {
        const x = cL + slot * i + slot / 2;
        const barH = (b.value / maxVal) * cH;
        const y = cB - barH;
        const isHighlight = highlightIdx === i;

        ctx.fillStyle = isHighlight ? b.color : b.color + "cc";
        ctx.fillRect(x - barW / 2, y, barW, barH);

        ctx.fillStyle = isDark ? "#e5e5e5" : "#171717";
        ctx.font = '11px "Roboto Mono", monospace';
        ctx.fillText(String(b.value), x, y - 16);

        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.font = '9px "Roboto Mono", monospace';
        ctx.fillText(b.label, x, cB + 8);
      });
    }

    drawRef.current = draw;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const cL = PAD.left, cR = W - PAD.right, cW = cR - cL;
      const slot = cW / n;

      if (mx < cL || mx > cR) { tooltip.style.display = "none"; draw(); return; }
      const idx = Math.floor((mx - cL) / slot);
      if (idx < 0 || idx >= n) { tooltip.style.display = "none"; draw(); return; }

      const b = bars[idx];
      tooltipDate.textContent = b.label;
      tooltipValue.textContent = `${b.value} contract(s)`;

      tooltip.style.display = "block";
      const tipX = mx + 16;
      tooltip.style.left = (tipX + 180 > W ? mx - 190 : tipX) + "px";
      tooltip.style.top = Math.max(0, e.clientY - rect.top - 40) + "px";
      draw(idx);
    };

    const handleMouseLeave = () => { tooltip.style.display = "none"; draw(); };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", resize);

    setTimeout(resize, 140);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [isDark, summary, loading, hasData]);

  function fmtHeader(v: number) {
    if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
    if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + " L";
    return "₹" + v.toLocaleString("en-IN");
  }

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${isDark ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-800"}`}>
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-white" : "text-neutral-900"}`}>Upcoming Renewals</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">Contracts by expiry window</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Renewal Pipeline (90d)</span>
          <span className="text-sm font-semibold text-violet-400">{summary ? fmtHeader(summary.renewalPipelineValue90Days || 0) : "—"}</span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[360px]">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading renewals data…</div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No contracts due for renewal in the next 90 days.</div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>
            <div ref={tooltipRef} className={`absolute pointer-events-none p-2 font-mono text-[11px] shadow-xl min-w-[180px] rounded-none hidden z-10 border ${isDark ? "bg-[#141414]/95 border-neutral-800 text-white" : "bg-white/95 border-neutral-200 text-neutral-800"}`}>
              <div ref={tooltipDateRef} className="text-neutral-500 mb-0.5"></div>
              <div ref={tooltipValueRef} className="flex items-center text-xs mt-1"></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
