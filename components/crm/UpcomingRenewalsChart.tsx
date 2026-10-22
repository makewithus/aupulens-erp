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

const DEMO_RENEWAL_SUMMARY: RenewalSummary = {
  expiring7: 14,
  expiring30: 48,
  expiring60: 72,
  expiring90: 115,
  expiredActive: 23,
  renewalPipelineValue90Days: 18450000,
};

export function UpcomingRenewalsChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<RenewalSummary>(DEMO_RENEWAL_SUMMARY);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipDateRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/crm/renewals")
      .then((res) => res.json())
      .then((d) => {
        if (d.success && d.data && (d.data.expiring7 || d.data.expiring30 || d.data.expiring60 || d.data.expiring90)) {
          setSummary(d.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeSummary = summary || DEMO_RENEWAL_SUMMARY;

  const bars = [
    { label: "Within 7 days", value: activeSummary.expiring7, color: isDark ? "#F56868" : "#DC2626" },
    { label: "Within 30 days", value: activeSummary.expiring30, color: isDark ? "#F1DF38" : "#D97706" },
    { label: "Within 60 days", value: activeSummary.expiring60, color: isDark ? "#A77DFF" : "#7C3AED" },
    { label: "Within 90 days", value: activeSummary.expiring90, color: isDark ? "#6CADF5" : "#2563EB" },
    { label: "Expired", value: activeSummary.expiredActive, color: isDark ? "#757575" : "#4B5563" },
  ];

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
    const PAD = { top: 24, right: 20, bottom: 44, left: 14 };

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
      const barW = Math.min(slot * 0.52, 48);

      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      bars.forEach((b, i) => {
        const x = cL + slot * i + slot / 2;
        const barH = (b.value / maxVal) * cH;
        const isHighlight = highlightIdx === i;

        if (isHighlight) {
          ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)";
          ctx.fillRect(cL + slot * i, cT, slot, cH);
        }

        const bH = 4;
        const bG = 1.5;
        const unitH = bH + bG;
        const totalBricks = Math.max(1, Math.round(barH / unitH));

        for (let br = 0; br < totalBricks; br++) {
          const by = cB - (br + 1) * unitH + bG;
          let brickColor = b.color;
          if (isHighlight) {
            brickColor = isDark ? "#FFFFFF" : "#111827";
          } else if (totalBricks > 6) {
            const rel = br / totalBricks;
            if (rel >= 0.72 && rel <= 0.86) {
              brickColor = isDark ? "#F2F2F2" : "#1F2937";
            }
          }
          ctx.fillStyle = brickColor;
          ctx.fillRect(Math.round(x - barW / 2), Math.round(by), Math.max(1, Math.round(barW)), Math.round(bH));
        }

        const barTopY = cB - totalBricks * unitH;
        ctx.fillStyle = isHighlight ? (isDark ? "#ffffff" : "#111827") : (isDark ? "#F2F2F2" : "#1F2937");
        ctx.font = 'bold 11px "Roboto Mono", monospace';
        ctx.fillText(String(b.value), x, barTopY - 12);

        ctx.fillStyle = isDark ? "#757575" : "#4B5563";
        ctx.font = '9px "Roboto Mono", monospace';
        const labelText = cW < 420
          ? b.label.replace("Within ", "< ").replace("days", "d").replace("Over ", "> ")
          : b.label;
        ctx.fillText(labelText, x, cB + 10);
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

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
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
      tooltip.style.top = Math.max(0, touch.clientY - rect.top - 40) + "px";
      draw(idx);
    };

    const handleMouseLeave = () => { tooltip.style.display = "none"; draw(); };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouch, { passive: true });
    canvas.addEventListener("touchmove", handleTouch, { passive: true });
    canvas.addEventListener("touchend", handleMouseLeave);
    window.addEventListener("resize", resize);

    setTimeout(resize, 140);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("touchmove", handleTouch);
      canvas.removeEventListener("touchend", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [isDark, summary, loading, hasData]);

  function fmtHeader(v: number) {
    if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
    if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + " L";
    return "₹" + v.toLocaleString("en-IN");
  }

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-[#e5e5e5] text-foreground"}`}>
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-[#F2F2F2]" : "text-foreground"}`}>Upcoming Renewals</h3>
          <p className="text-[10px] text-[#757575] mt-0.5">Contracts by expiry window</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-[#757575] uppercase tracking-wider block">Renewal Pipeline (90d)</span>
          <span className={`text-sm font-semibold ${isDark ? "text-[#A77DFF]" : "text-[#7C3AED]"}`}>{summary ? fmtHeader(summary.renewalPipelineValue90Days || 0) : "—"}</span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[320px]">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-[#757575] text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading renewals data…</div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full text-sm text-[#757575]">No contracts due for renewal in the next 90 days.</div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>
            <div ref={tooltipRef} className={`absolute pointer-events-none p-2 font-mono text-[11px] shadow-xl min-w-[180px] rounded-none hidden z-10 border ${isDark ? "bg-[#161616]/95 border-[#272727] text-[#F2F2F2]" : "bg-white/95 border-[#e5e5e5] text-foreground"}`}>
              <div ref={tooltipDateRef} className="text-[#757575] mb-0.5"></div>
              <div ref={tooltipValueRef} className="flex items-center text-xs mt-1 font-semibold"></div>
            </div>
          </>
        )}
      </div>

      {/* Visual Legend */}
      <div className="mt-4 pt-3 border-t border-dashed border-[#272727]/50 flex flex-wrap items-center justify-between gap-2 text-[10px]">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: b.color }} />
            <span className="text-[#757575]">{b.label}:</span>
            <span className={`font-semibold ${isDark ? "text-[#F2F2F2]" : "text-slate-900"}`}>{b.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
