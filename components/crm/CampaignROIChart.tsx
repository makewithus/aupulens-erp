"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

interface CampaignBar {
  name: string;
  roi: number;
}

export function CampaignROIChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [bars, setBars] = useState<CampaignBar[]>([]);
  const [globalRoi, setGlobalRoi] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<(idx?: number) => void>(() => {});

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/reports/campaigns").then((res) => res.json()),
      fetch("/api/crm/reports/roi").then((res) => res.json()),
    ])
      .then(([campaignsRes, roiRes]) => {
        if (campaignsRes.success) {
          const top = (campaignsRes.data.topCampaigns || []).map((c: any) => ({
            name: c.campaign_name || "Unnamed Campaign",
            roi: c.roi_percentage || 0,
          }));
          setBars(top);
        }
        if (roiRes.success) setGlobalRoi(roiRes.data.roiPercentage || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const hasData = bars.length > 0;

  useEffect(() => {
    if (loading || !hasData) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    const tooltipValue = tooltipValueRef.current;
    if (!canvas || !container || !tooltip || !tooltipValue) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = bars.length;
    const maxAbs = Math.max(...bars.map((b) => Math.abs(b.roi)), 1);
    const PAD = { top: 10, right: 60, bottom: 10, left: 10 };
    const rowGap = 10;

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
      const chartW = chartR - chartL;
      const rowH = (H - PAD.top - PAD.bottom - rowGap * (n - 1)) / n;

      ctx.font = '10px "Roboto Mono", monospace';

      bars.forEach((b, i) => {
        const y = PAD.top + i * (rowH + rowGap);
        const isHighlight = highlightIdx === i;
        const color = b.roi >= 0 ? "#10b981" : "#e11d48";

        // Track
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        ctx.fillRect(chartL, y, chartW, rowH);

        // Bar
        const barW = Math.max(2, (Math.abs(b.roi) / maxAbs) * chartW);
        ctx.fillStyle = isHighlight ? color : color + "cc";
        ctx.fillRect(chartL, y, barW, rowH);

        // Campaign name (inside bar if it fits, else after track)
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDark ? "#e5e5e5" : "#171717";
        ctx.textAlign = "left";
        ctx.fillText(b.name, chartL + 8, y + rowH / 2);

        // ROI value, right-aligned past the track
        ctx.textAlign = "left";
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(`${b.roi.toFixed(0)}%`, chartR + 8, y + rowH / 2);
      });
    }

    drawRef.current = draw;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const my = e.clientY - rect.top;
      const H = rect.height;
      const rowH = (H - PAD.top - PAD.bottom - rowGap * (n - 1)) / n;
      const idx = Math.floor((my - PAD.top) / (rowH + rowGap));
      if (idx < 0 || idx >= n) { tooltip.style.display = "none"; draw(); return; }

      const b = bars[idx];
      tooltipValue.textContent = `${b.name}: ${b.roi.toFixed(1)}% ROI`;
      tooltip.style.display = "block";
      const tipX = e.clientX - rect.left + 16;
      tooltip.style.left = (tipX + 220 > rect.width ? e.clientX - rect.left - 230 : tipX) + "px";
      tooltip.style.top = Math.max(0, my - 20) + "px";
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
  }, [isDark, bars, loading, hasData]);

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${isDark ? "bg-neutral-900 border-neutral-800 text-white" : "bg-white border-neutral-200 text-neutral-800"}`}>
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-white" : "text-neutral-900"}`}>Campaign ROI</h3>
          <p className="text-[10px] text-neutral-500 mt-0.5">Top campaigns by return, all time</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Global ROI</span>
          <span className={`text-sm font-semibold ${globalRoi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{globalRoi.toFixed(1)}%</span>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading campaign data…</div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No campaigns with attributed revenue yet.</div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>
            <div ref={tooltipRef} className={`absolute pointer-events-none p-2 font-mono text-[11px] shadow-xl min-w-[180px] rounded-none hidden z-10 border ${isDark ? "bg-[#141414]/95 border-neutral-800 text-white" : "bg-white/95 border-neutral-200 text-neutral-800"}`}>
              <div ref={tooltipValueRef}></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
