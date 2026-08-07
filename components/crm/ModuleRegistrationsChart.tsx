"use client";

import { useEffect, useRef } from "react";
import { useThemeStore } from "@/store/themeStore";

export function ModuleRegistrationsChart() {
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

    // ââ UAC cumulative data (growing from ~0 to ~71235) ââ
    const uacStart = new Date(2022, 5, 1); // Jun 2022
    const uacMonths = 48; // 4 years of monthly data
    const uacData: Array<{ date: Date; value: number }> = [];
    let uacCum = 0;
    for (let m = 0; m < uacMonths; m++) {
      const date = new Date(uacStart);
      date.setMonth(date.getMonth() + m);
      // S-curve growth: slow start, rapid mid, plateau
      const t = m / uacMonths;
      const growth = 800 + Math.floor(2200 * Math.pow(t, 1.8) * (0.7 + rng() * 0.6));
      uacCum += growth;
      uacData.push({ date, value: uacCum });
    }
    // Normalize to ~71235
    const uacScale = 71235 / uacCum;
    uacData.forEach((d) => (d.value = Math.round(d.value * uacScale)));

    const maxVal = Math.max(...uacData.map((d) => d.value));
    const yMax = Math.ceil(maxVal / 10000) * 10000;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += 10000) yTicks.push(v);

    const PAD = { top: 16, right: 50, bottom: 40, left: 10 };
    const color = null; // defaults to white-ish

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
      const xStep = Math.max(1, Math.floor(uacData.length / 8));
      for (let i = 0; i < uacData.length; i += xStep) {
        const x = cL + (i / (uacData.length - 1)) * cW;
        ctx.fillStyle = isDark ? "#757575" : "#666";
        ctx.fillText(fmtDate(uacData[i].date), x, cB + 10);
      }

      // Area fill path
      ctx.beginPath();
      for (let i = 0; i < uacData.length; i++) {
        const x = cL + (i / (uacData.length - 1)) * cW;
        const y = cB - (uacData[i].value / yMax) * cH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.85)" : "rgba(10,10,10,0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Fill under
      ctx.lineTo(cR, cB);
      ctx.lineTo(cL, cB);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, cT, 0, cB);

      const hexToFill = (c: string | null, a: number) => {
        if (!c) return isDark ? `rgba(255,255,255,${a})` : `rgba(10,10,10,${a})`;
        if (c.startsWith("rgba")) return c + a + ")";
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
      if (highlightIdx !== undefined && highlightIdx >= 0 && highlightIdx < uacData.length) {
        const hx = cL + (highlightIdx / (uacData.length - 1)) * cW;
        const hy = cB - (uacData[highlightIdx].value / yMax) * cH;

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
        ctx.fillStyle = isDark ? "#fff" : "#000";
        ctx.fill();
        ctx.strokeStyle = isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
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
      const idx = Math.round(ratio * (uacData.length - 1));
      if (idx < 0 || idx >= uacData.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = uacData[idx];
      tooltipDate.textContent = fmtFullDate(d.date);
      tooltipValue.innerHTML = `<span class="w-2 h-2 rounded-[1px] inline-block mr-1.5" style="background:${
        isDark ? "#fff" : "#000"
      }"></span> Registrations <b>₹{d.value.toLocaleString()}</b>`;

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

    setTimeout(resize, 120);
    resize();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, [isDark]);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-none p-5 font-mono w-full relative">
      <div className="flex justify-between items-center gap-4 mb-4">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          Enterprise Module Registrations
        </span>
        <span className="text-sm font-semibold text-white">71,235</span>
      </div>

      <div ref={containerRef} className="relative w-full h-[280px]">
        <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair"></canvas>

        {/* Custom Tooltip */}
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none bg-[#141414]/95 border border-neutral-800 p-2 font-mono text-[11px] text-white shadow-xl min-w-[165px] rounded-none hidden z-10"
        >
          <div ref={tooltipDateRef} className="text-neutral-500 mb-0.5"></div>
          <div ref={tooltipValueRef} className="flex items-center text-xs mt-1"></div>
        </div>
      </div>
    </div>
  );
}
