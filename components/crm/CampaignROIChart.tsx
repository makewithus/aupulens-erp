"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

interface RoiTrendPoint {
  date: string;
  cumulativeBudget: number;
  cumulativeRevenue: number;
  roiPercentage: number;
}

const ZOOM_PRESETS = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
  { label: "1Y", days: 365 },
];

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CampaignROIChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [allPoints, setAllPoints] = useState<RoiTrendPoint[]>([]);
  // [startIdx, endIdx) into allPoints — the currently zoomed/panned window.
  const [range, setRange] = useState<[number, number]>([0, 0]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipDateRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<(idx?: number) => void>(() => {});
  const rangeRef = useRef(range);
  rangeRef.current = range;

  useEffect(() => {
    fetch("/api/crm/reports/roi-trend?days=365")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) {
          const points: RoiTrendPoint[] = d.data.points;
          setAllPoints(points);
          setRange([0, points.length]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visiblePoints = useMemo(() => allPoints.slice(range[0], range[1]), [allPoints, range]);
  const latestRoi = allPoints[allPoints.length - 1]?.roiPercentage || 0;
  const hasData = allPoints.some((p) => p.cumulativeBudget > 0);

  const setZoomDays = useCallback((days: number) => {
    setAllPointsLenSafeRange(days);
  }, [allPoints.length]);

  function setAllPointsLenSafeRange(days: number) {
    setRange((prev) => {
      const total = allPoints.length;
      if (total === 0) return prev;
      const width = Math.min(total, days);
      return [total - width, total];
    });
  }

  const zoomBy = (factor: number, anchorRatio = 0.5) => {
    setRange(([s, e]) => {
      const total = allPoints.length;
      const width = e - s;
      const newWidth = Math.max(7, Math.min(total, Math.round(width * factor)));
      const anchor = s + width * anchorRatio;
      let newStart = Math.round(anchor - newWidth * anchorRatio);
      let newEnd = newStart + newWidth;
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd > total) { newStart -= newEnd - total; newEnd = total; }
      newStart = Math.max(0, newStart);
      return [newStart, newEnd];
    });
  };

  const resetZoom = () => setRange([0, allPoints.length]);

  const pan = useCallback((startRange: [number, number], dxPoints: number) => {
    const total = allPoints.length;
    const width = startRange[1] - startRange[0];
    let newStart = startRange[0] + dxPoints;
    let newEnd = newStart + width;
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > total) { newStart -= newEnd - total; newEnd = total; }
    setRange([Math.max(0, newStart), Math.min(total, newEnd)]);
  }, [allPoints.length]);

  // Refs so the wheel/drag handlers (bound once per effect run below) always
  // call the latest zoom/pan logic without needing to re-bind on every range change.
  const zoomByRef = useRef(zoomBy);
  zoomByRef.current = zoomBy;
  const panRef = useRef(pan);
  panRef.current = pan;

  useEffect(() => {
    if (loading || !hasData || visiblePoints.length === 0) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    const tooltipDate = tooltipDateRef.current;
    const tooltipValue = tooltipValueRef.current;
    if (!canvas || !container || !tooltip || !tooltipDate || !tooltipValue) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function fmtLakhs(v: number) {
      const sign = v < 0 ? "-" : "";
      v = Math.abs(v);
      if (v >= 10000000) return sign + "₹" + (v / 10000000).toFixed(1) + "Cr";
      if (v >= 100000) return sign + "₹" + (v / 100000).toFixed(1) + "L";
      if (v >= 1000) return sign + "₹" + (v / 1000).toFixed(0) + "K";
      return sign + "₹" + v.toString();
    }

    const n = visiblePoints.length;
    const roiValues = visiblePoints.map((p) => p.roiPercentage);
    const minRoi = Math.min(0, ...roiValues);
    const maxRoi = Math.max(0, ...roiValues);
    const pad = Math.max(5, (maxRoi - minRoi) * 0.15);
    const yMin = minRoi - pad;
    const yMax = maxRoi + pad;
    const yRange = yMax - yMin || 1;

    const PAD = { top: 16, right: 60, bottom: 30, left: 10 };
    const color = "#a78bfa";

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

    function yToPixel(v: number, cB: number, cH: number) {
      return cB - ((v - yMin) / yRange) * cH;
    }

    function draw(highlightIdx?: number) {
      if (!ctx || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const cL = PAD.left, cR = W - PAD.right, cT = PAD.top, cB = H - PAD.bottom;
      const cW = cR - cL, cH = cB - cT;

      // Y gridlines (5 ticks across the ROI% range)
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) {
        const v = yMin + (yRange * i) / 4;
        const y = yToPixel(v, cB, cH);
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(`${v.toFixed(0)}%`, cR + 50, y);
      }

      // Zero line, emphasized
      const zeroY = yToPixel(0, cB, cH);
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cL, zeroY);
      ctx.lineTo(cR, zeroY);
      ctx.stroke();

      // X labels
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xStep = Math.max(1, Math.floor(n / 8));
      for (let i = 0; i < n; i += xStep) {
        const x = cL + (n === 1 ? 0.5 : i / (n - 1)) * cW;
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(fmtDateShort(visiblePoints[i].date), x, cB + 8);
      }

      // Line + gradient fill (matches PipelineTrendChart/RevenueTrendChart visual language)
      ctx.beginPath();
      visiblePoints.forEach((p, i) => {
        const x = cL + (n === 1 ? 0.5 : i / (n - 1)) * cW;
        const y = yToPixel(p.roiPercentage, cB, cH);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      const x0 = cL, x1 = cR;
      ctx.lineTo(x1, zeroY);
      ctx.lineTo(x0, zeroY);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, cT, 0, cB);
      const hexToFill = (c: string, a: number) => {
        const h = c.replace("#", "");
        const rv = parseInt(h.substring(0, 2), 16);
        const gv = parseInt(h.substring(2, 4), 16);
        const bv = parseInt(h.substring(4, 6), 16);
        return `rgba(${rv},${gv},${bv},${a})`;
      };
      grad.addColorStop(0, hexToFill(color, 0.22));
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fill();

      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < n) {
        const hx = cL + (n === 1 ? 0.5 : highlightIdx / (n - 1)) * cW;
        const hy = yToPixel(visiblePoints[highlightIdx].roiPercentage, cB, cH);

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

    drawRef.current = draw;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const cL = PAD.left, cR = W - PAD.right, cW = cR - cL;

      if (mx < cL || mx > cR) { tooltip.style.display = "none"; draw(); return; }
      const ratio = (mx - cL) / cW;
      const idx = Math.round(ratio * (n - 1));
      if (idx < 0 || idx >= n) { tooltip.style.display = "none"; draw(); return; }

      const p = visiblePoints[idx];
      tooltipDate.textContent = fmtDate(p.date);
      tooltipValue.innerHTML = `
        <div class="flex items-center gap-1.5 text-[11px]"><span style="width:8px;height:8px;border-radius:1px;display:inline-block;background:${color}"></span> ROI <b class="ml-1">${p.roiPercentage.toFixed(1)}%</b></div>
        <div class="text-[10px] text-muted-foreground/70 mt-1">Revenue ${fmtLakhs(p.cumulativeRevenue)} / Budget ${fmtLakhs(p.cumulativeBudget)}</div>
      `;

      tooltip.style.display = "block";
      const tipX = mx + 16;
      tooltip.style.left = (tipX + 210 > W ? mx - 220 : tipX) + "px";
      tooltip.style.top = Math.max(0, e.clientY - rect.top - 55) + "px";
      draw(idx);
    };
    const handleMouseLeave = () => { tooltip.style.display = "none"; draw(); };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cL = PAD.left, cR = rect.width - PAD.right, cW = cR - cL;
      const ratio = Math.min(1, Math.max(0, ((e.clientX - rect.left) - cL) / cW));
      const factor = e.deltaY < 0 ? 0.85 : 1.15;
      zoomByRef.current(factor, ratio);
    };

    let isDragging = false;
    let dragStartX = 0;
    let dragStartRange: [number, number] = [0, 0];
    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartRange = rangeRef.current;
      canvas.style.cursor = "grabbing";
    };
    const handleMouseUp = () => { isDragging = false; canvas.style.cursor = "crosshair"; };
    const handleDragMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const rect = canvas.getBoundingClientRect();
      const cL = PAD.left, cR = rect.width - PAD.right, cW = cR - cL;
      const width = dragStartRange[1] - dragStartRange[0];
      const dxPoints = Math.round((-(e.clientX - dragStartX) / cW) * width);
      panRef.current(dragStartRange, dxPoints);
    };

    // Touch support (phones/tablets): one finger pans, two fingers pinch-zoom.
    // Trackpad pinch gestures land as ctrlKey+wheel in Chrome/Firefox/Safari,
    // which handleWheel above already covers — this block is for real touch.
    let touchMode: "none" | "pan" | "pinch" = "none";
    let touchStartX = 0;
    let touchStartRange: [number, number] = [0, 0];
    let pinchStartDist = 0;
    let pinchStartRange: [number, number] = [0, 0];
    let pinchAnchorRatio = 0.5;

    const touchDist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const handleTouchStart = (e: TouchEvent) => {
      tooltip.style.display = "none";
      if (e.touches.length === 2) {
        touchMode = "pinch";
        pinchStartDist = touchDist(e.touches);
        pinchStartRange = rangeRef.current;
        const rect = canvas.getBoundingClientRect();
        const cL = PAD.left, cR = rect.width - PAD.right, cW = cR - cL;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        pinchAnchorRatio = Math.min(1, Math.max(0, (midX - cL) / cW));
      } else if (e.touches.length === 1) {
        touchMode = "pan";
        touchStartX = e.touches[0].clientX;
        touchStartRange = rangeRef.current;
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (touchMode === "pinch" && e.touches.length === 2) {
        e.preventDefault();
        const dist = touchDist(e.touches);
        if (pinchStartDist > 0) {
          const factor = pinchStartDist / dist;
          const width = pinchStartRange[1] - pinchStartRange[0];
          const total = allPoints.length;
          const newWidth = Math.max(7, Math.min(total, Math.round(width * factor)));
          const anchor = pinchStartRange[0] + width * pinchAnchorRatio;
          let newStart = Math.round(anchor - newWidth * pinchAnchorRatio);
          let newEnd = newStart + newWidth;
          if (newStart < 0) { newEnd -= newStart; newStart = 0; }
          if (newEnd > total) { newStart -= newEnd - total; newEnd = total; }
          setRange([Math.max(0, newStart), Math.min(total, newEnd)]);
        }
      } else if (touchMode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cL = PAD.left, cR = rect.width - PAD.right, cW = cR - cL;
        const width = touchStartRange[1] - touchStartRange[0];
        const dxPoints = Math.round((-(e.touches[0].clientX - touchStartX) / cW) * width);
        panRef.current(touchStartRange, dxPoints);
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) touchMode = "none";
      else if (e.touches.length === 1) {
        // Two-finger pinch ended with one finger still down — hand off to pan.
        touchMode = "pan";
        touchStartX = e.touches[0].clientX;
        touchStartRange = rangeRef.current;
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);
    canvas.addEventListener("touchcancel", handleTouchEnd);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("resize", resize);

    setTimeout(resize, 100);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("resize", resize);
    };
  }, [isDark, visiblePoints, loading, hasData, allPoints.length]);

  const currentWindowDays = range[1] - range[0];

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${isDark ? "bg-card border-border text-white" : "bg-white border-border text-foreground"}`}>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-white" : "text-foreground"}`}>Campaign ROI Trend</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Cumulative ROI by day — scroll/pinch to zoom, drag to pan</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Current ROI</span>
            <span className={`text-sm font-semibold ${latestRoi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{latestRoi.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {ZOOM_PRESETS.map((z) => (
          <button
            key={z.label}
            onClick={() => setZoomDays(z.days)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              currentWindowDays === Math.min(z.days, allPoints.length)
                ? isDark ? "border-violet-500 text-violet-300 bg-violet-950/30" : "border-violet-400 text-violet-700 bg-violet-50"
                : isDark ? "border-border text-muted-foreground hover:text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {z.label}
          </button>
        ))}
        <div className="w-px h-4 bg-accent/40 mx-1" />
        <button onClick={() => zoomBy(0.7, 0.5)} title="Zoom in" className={`p-1.5 rounded border ${isDark ? "border-border hover:bg-accent" : "border-border hover:bg-accent"}`}>
          <ZoomIn className="h-3 w-3" />
        </button>
        <button onClick={() => zoomBy(1.4, 0.5)} title="Zoom out" className={`p-1.5 rounded border ${isDark ? "border-border hover:bg-accent" : "border-border hover:bg-accent"}`}>
          <ZoomOut className="h-3 w-3" />
        </button>
        <button onClick={resetZoom} title="Reset zoom" className={`p-1.5 rounded border ${isDark ? "border-border hover:bg-accent" : "border-border hover:bg-accent"}`}>
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      <div ref={containerRef} className="relative w-full h-[320px]">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading ROI trend…</div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No campaigns with committed budget yet.</div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>
            <div ref={tooltipRef} className={`absolute pointer-events-none p-2.5 font-mono text-[11px] shadow-xl min-w-[190px] rounded-none hidden z-10 border ${isDark ? "bg-[#141414]/95 border-border text-white" : "bg-white/95 border-border text-foreground"}`}>
              <div ref={tooltipDateRef} className="text-muted-foreground mb-1"></div>
              <div ref={tooltipValueRef}></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
