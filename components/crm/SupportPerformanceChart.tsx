"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/store/themeStore";

export function SupportPerformanceChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

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

    const PAD = { top: 16, right: 50, bottom: 80, left: 10 };
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
        const barH = (values[i] / yMax) * cH;
        const y = cB - barH;

        // Bar gradient
        const grad = ctx.createLinearGradient(x, y, x, cB);
        grad.addColorStop(0, highlightIdx === i ? "#c4b5fd" : barColors[i % 2]);
        grad.addColorStop(1, highlightIdx === i ? "#7c3aed" : i % 2 === 0 ? "#6d28d9" : "#4c1d95");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barH);

        // X label (rotated)
        ctx.save();
        ctx.translate(x + barWidth / 2, cB + 8);
        ctx.rotate(-Math.PI / 4);
        ctx.font = '9px "Roboto Mono", monospace';
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillStyle = highlightIdx === i ? (isDark ? "#fff" : "#000") : "#757575";
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

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw();
    };

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
                  : "text-foreground after:content-[''] after:absolute after:left-0 after:bottom-[-2px] after:w-full after:h-[1px] after:bg-card font-semibold"
                : isDark
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground hover:text-muted-foreground"
            }`}
          >
            Resolved Tickets
          </button>
          <span className={`select-none ${isDark ? "text-foreground" : "text-foreground"}`}>|</span>
          <button
            onClick={() => setMetricType("time")}
            className={`cursor-pointer pb-0.5 relative transition-colors ${
              metricType === "time"
                ? isDark
                  ? "text-white after:content-[''] after:absolute after:left-0 after:bottom-[-2px] after:w-full after:h-[1px] after:bg-white"
                  : "text-foreground after:content-[''] after:absolute after:left-0 after:bottom-[-2px] after:w-full after:h-[1px] after:bg-card font-semibold"
                : isDark
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground hover:text-muted-foreground"
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
