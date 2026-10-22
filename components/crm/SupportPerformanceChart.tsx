"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/store/themeStore";

export function SupportPerformanceChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const [metricType, setMetricType] = useState<"tickets" | "time">("tickets");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const drawRef = useRef<(highlightIdx?: number) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;

    if (!canvas || !container || !tooltip) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const channels = [
      "Email Tickets",
      "Live Chat",
      "Phone Support",
      "Self Service",
      "AI Agent",
      "Social Media",
      "Partner Portal",
      "WhatsApp API",
      "Community",
      "Others"
    ];

    // Support ticket counts
    const ticketCounts = [9200, 7800, 8500, 5400, 21400, 4200, 3800, 15400, 11200, 5200];
    // Average resolution time in minutes
    const resolutionTimes = [180, 45, 90, 10, 15, 120, 240, 60, 150, 80];

    const values = metricType === "tickets" ? ticketCounts : resolutionTimes;
    const suffix = metricType === "tickets" ? " tickets" : " mins";

    function fmtValue(v: number) {
      if (metricType === "tickets") {
        if (v >= 1000) return (v / 1000).toFixed(0) + "K";
        return v.toString();
      } else {
        return v + "m";
      }
    }

    const maxVal = Math.max(...values);
    let step = 5000;
    if (metricType === "time") {
      step = 50;
    }

    const yMax = Math.ceil(maxVal / step) * step;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += step) yTicks.push(v);

    const PAD = { top: 28, right: 50, bottom: 80, left: 10 };
    const barColors = ["#a78bfa", "#8b5cf6"];

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

      // Grid + Y labels
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
        ctx.fillText(fmtValue(v), cR + 38, y);
      });

      // Bars
      const n = values.length;
      const groupWidth = cW / n;
      const barWidth = groupWidth * 0.55;
      const gap = (groupWidth - barWidth) / 2;

      for (let i = 0; i < n; i++) {
        const x = cL + i * groupWidth + gap;
        const isHighlight = highlightIdx === i;

        if (isHighlight) {
          ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)";
          ctx.fillRect(cL + i * groupWidth, cT, groupWidth, cH);
        }

        const barH = (values[i] / yMax) * cH;
        const bH = 4;
        const bG = 1.5;
        const unitH = bH + bG;
        const totalBricks = Math.max(1, Math.round(barH / unitH));

        for (let b = 0; b < totalBricks; b++) {
          const by = cB - (b + 1) * unitH + bG;
          let brickColor = isDark
            ? isHighlight ? "#FFFFFF" : "#A77DFF"
            : isHighlight ? "#6E38D9" : "#8C5CE6";

          if (!isHighlight && totalBricks > 6) {
            const rel = b / totalBricks;
            if (rel >= 0.72 && rel <= 0.86) {
              // Image 2 white brick mixture band in dark mode, dark band in light mode
              brickColor = isDark ? "#FFFFFF" : "#1E293B";
            } else if (b % 4 === 0) {
              brickColor = isDark ? "#8AE06C" : "#16A34A";
            }
          }

          ctx.fillStyle = brickColor;
          ctx.fillRect(Math.round(x), Math.round(by), Math.max(1, Math.round(barWidth)), Math.round(bH));
        }

        // Numeric value directly above each bar so user can read directly
        const barTopY = cB - totalBricks * unitH;
        ctx.save();
        ctx.font = 'bold 10px "Roboto Mono", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = isHighlight
          ? (isDark ? "#ffffff" : "#0f172a")
          : (isDark ? "#f2f2f2" : "#1e293b");
        ctx.fillText(fmtValue(values[i]), x + barWidth / 2, barTopY - 3);
        ctx.restore();

        // X label (rotated)
        ctx.save();
        ctx.translate(x + barWidth / 2, cB + 8);
        ctx.rotate(-Math.PI / 4);
        ctx.font = '10px "Roboto Mono", monospace';
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillStyle = highlightIdx === i ? (isDark ? "#ffffff" : "#0f172a") : (isDark ? "#a1a1aa" : "#334155");
        ctx.fillText(channels[i], 0, 0);
        ctx.restore();
      }
    }

    drawRef.current = draw;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const W = rect.width;
      const cL = PAD.left,
        cR = W - PAD.right;
      const cW = cR - cL;
      const n = values.length;
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

      tooltip.textContent = channels[idx] + ": " + values[idx].toLocaleString() + suffix;
      tooltip.style.display = "block";
      tooltip.style.left = mx + 16 + "px";
      tooltip.style.top = Math.max(0, e.clientY - rect.top - 30) + "px";
      draw(idx);
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const W = rect.width;
      const cL = PAD.left,
        cR = W - PAD.right;
      const cW = cR - cL;
      const n = channels.length;
      const slot = cW / n;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const idx = Math.floor((mx - cL) / slot);
      if (idx < 0 || idx >= n) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      tooltip.textContent = channels[idx] + ": " + values[idx].toLocaleString() + suffix;
      tooltip.style.display = "block";
      tooltip.style.left = mx + 16 + "px";
      tooltip.style.top = Math.max(0, touch.clientY - rect.top - 30) + "px";
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
  }, [metricType, isDark]);

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative border ${
      isDark ? "bg-card border-border text-white" : "bg-white border-border text-foreground"
    }`}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-white" : "text-foreground"}`}>
            Support Channel Performance
          </h3>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-3 text-[10px]">
          <button
            onClick={() => setMetricType("tickets")}
            className={`cursor-pointer pb-0.5 relative transition-colors ${
              metricType === "tickets"
                ? isDark
                  ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-2px] after:w-full after:h-[1px] after:bg-white"
                  : "text-slate-900 font-bold after:content-[''] after:absolute after:left-0 after:bottom-[-2px] after:w-full after:h-[1.5px] after:bg-slate-900"
                : isDark
                ? "text-muted-foreground hover:text-white"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Resolved Tickets
          </button>
          <span className={`select-none ${isDark ? "text-zinc-600" : "text-zinc-300"}`}>|</span>
          <button
            onClick={() => setMetricType("time")}
            className={`cursor-pointer pb-0.5 relative transition-colors ${
              metricType === "time"
                ? isDark
                  ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-2px] after:w-full after:h-[1px] after:bg-white"
                  : "text-slate-900 font-bold after:content-[''] after:absolute after:left-0 after:bottom-[-2px] after:w-full after:h-[1.5px] after:bg-slate-900"
                : isDark
                ? "text-muted-foreground hover:text-white"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Resolution Time
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative w-full h-[320px]">
        <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>

        {/* Custom Tooltip */}
        <div
          ref={tooltipRef}
          className={`absolute pointer-events-none p-2 font-mono text-[11px] shadow-xl min-w-[130px] rounded-none hidden z-10 border ${
            isDark ? "bg-[#141414]/95 border-border text-white" : "bg-white/95 border-border text-foreground"
          }`}
        ></div>
      </div>
    </div>
  );
}
