"use client";

import { useEffect, useRef } from "react";
import { useThemeStore } from "@/store/themeStore";

export function IntegrationPipelinesChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipDateRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    const tooltipDate = tooltipDateRef.current;
    const tooltipValue = tooltipValueRef.current;

    if (!canvas || !container || !tooltip || !tooltipDate || !tooltipValue) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ââ Seeded RNG ââ
    let seed = 1337;
    function rng() {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    }

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function fmtDate(d: Date) {
      return months[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
    }
    function fmtFullDate(d: Date) {
      return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
    }
    function fmtK(v: number) {
      if (v >= 1000) return (v / 1000).toFixed(0) + "K";
      return v.toString();
    }

    // ââ OFT cumulative data (growing from ~0 to ~2961) ââ
    const oftStart = new Date(2022, 5, 1);
    const oftMonths = 48;
    const oftData: Array<{ date: Date; value: number }> = [];
    let oftCum = 0;
    for (let m = 0; m < oftMonths; m++) {
      const date = new Date(oftStart);
      date.setMonth(date.getMonth() + m);
      const t = m / oftMonths;
      // Slower S-curve with a visible inflection
      let growth = 20 + Math.floor(120 * Math.pow(t, 2.2) * (0.6 + rng() * 0.8));
      // Spike around month 6-8 (Dec 2022)
      if (m >= 6 && m <= 8) {
        growth += Math.floor(80 * (1 - Math.abs(m - 7) / 2) * rng());
      }
      oftCum += growth;
      oftData.push({ date, value: oftCum });
    }
    const oftScale = 2961 / oftCum;
    oftData.forEach((d) => (d.value = Math.round(d.value * oftScale)));

    const maxVal = Math.max(...oftData.map((d) => d.value));
    const yMax = Math.ceil(maxVal / 500) * 500;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += 500) yTicks.push(v);

    const PAD = { top: 16, right: 50, bottom: 40, left: 10 };
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

      // Grid lines + Y labels
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
        ctx.fillText(fmtK(v), cR + 38, y);
      });

      // X labels
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xStep = Math.max(1, Math.floor(oftData.length / 8));
      for (let i = 0; i < oftData.length; i += xStep) {
        const x = cL + (i / (oftData.length - 1)) * cW;
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(fmtDate(oftData[i].date), x, cB + 10);
      }

      // Area fill path
      ctx.beginPath();
      for (let i = 0; i < oftData.length; i++) {
        const x = cL + (i / (oftData.length - 1)) * cW;
        const y = cB - (oftData[i].value / yMax) * cH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Fill under
      ctx.lineTo(cR, cB);
      ctx.lineTo(cL, cB);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, cT, 0, cB);

      const hexToFill = (c: string, a: number) => {
        const h = c.replace("#", "");
        const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
        const rv = parseInt(full.substring(0, 2), 16);
        const gv = parseInt(full.substring(2, 4), 16);
        const bv = parseInt(full.substring(4, 6), 16);
        return `rgba(${rv},${gv},${bv},${a})`;
      };

      grad.addColorStop(0, hexToFill(color, 0.08));
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fill();

      // Highlight point
      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < oftData.length) {
        const hx = cL + (highlightIdx / (oftData.length - 1)) * cW;
        const hy = cB - (oftData[highlightIdx].value / yMax) * cH;

        // Vertical dashed line
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, cT);
        ctx.lineTo(hx, cB);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dot
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
      const cL = PAD.left,
        cR = W - PAD.right;
      const cW = cR - cL;

      if (mx < cL || mx > cR) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const ratio = (mx - cL) / cW;
      const idx = Math.round(ratio * (oftData.length - 1));
      if (idx < 0 || idx >= oftData.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = oftData[idx];
      tooltipDate.textContent = fmtFullDate(d.date);
      tooltipValue.innerHTML = `<span class="w-2 h-2 rounded-[1px] inline-block mr-1.5" style="background:${color}"></span> Pipelines <b>₹{d.value.toLocaleString()}</b>`;

      tooltip.style.display = "block";
      const tipX = mx + 16;
      tooltip.style.left = (tipX + 200 > W ? mx - 210 : tipX) + "px";
      tooltip.style.top = Math.max(0, e.clientY - rect.top - 50) + "px";

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
  }, [isDark]);

  return (
    <div className="bg-card border border-border rounded-none p-5 font-mono w-full relative">
      <div className="flex justify-between items-center gap-4 mb-4">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Scheduled Integration Pipelines
        </span>
        <span className="text-sm font-semibold text-foreground">2,961</span>
      </div>

      <div ref={containerRef} className="relative w-full h-[280px]">
        <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>

        {/* Custom Tooltip */}
        <div
          ref={tooltipRef}
          className={`absolute pointer-events-none border border-border p-2 font-mono text-[11px] shadow-xl min-w-[165px] rounded-none hidden z-10 ${isDark ? "bg-[#141414]/95 text-white" : "bg-white/95 text-foreground"}`}
        >
          <div ref={tooltipDateRef} className="text-muted-foreground mb-0.5"></div>
          <div ref={tooltipValueRef} className="flex items-center text-xs mt-1"></div>
        </div>
      </div>
    </div>
  );
}
