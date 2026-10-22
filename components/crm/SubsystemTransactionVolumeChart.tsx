"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/store/themeStore";
import { cn } from "@/lib/utils";
import { BRAND_COLORS, ERP_MODULE_PALETTE } from "@/lib/constants/brandColors";
import { Activity, Layers, BarChart2 } from "lucide-react";

export function SubsystemTransactionVolumeChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [centerVal, setCenterVal] = useState("10.6M");
  const [centerTitle, setCenterTitle] = useState("ALL MODULES");
  const [centerSub, setCenterSub] = useState("Total Transactions");
  const [centerColor, setCenterColor] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState(-1);

  // Chains with verified Image 1 color palette & module parameters
  const chains = [
    { name: "Finance & Accounts", value: 2420000, color: "#A77DFF" }, // Brand Purple
    { name: "Supply Chain", value: 1180000, color: "#6CADF5" }, // Brand Blue
    { name: "Inventory Management", value: 1540000, color: "#8AE06C" }, // Brand Green
    { name: "Human Resources", value: 1310000, color: "#F1DF38" }, // Brand Yellow
    { name: "Customer Relations (CRM)", value: 890000, color: "#F56868" }, // Brand Red
    { name: "Warehouse Logistics", value: 1060000, color: "#B595FF" }, // Lavender
    { name: "Billing & Invoicing", value: 980000, color: "#88C2FF" }, // Sky
    { name: "Sales & Order Desk", value: 420000, color: "#A6EB8D" }, // Mint
    { name: "Manufacturing Orders", value: 350000, color: "#F6E668" }, // Gold
    { name: "Platform Infrastructure", value: 470000, color: "#757575" }, // Secondary Grey
  ];

  const total = chains.reduce((s, c) => s + c.value, 0);

  const formatShort = (val: number) => {
    if (val >= 1000000) return (val / 1000000).toFixed(2) + "M";
    if (val >= 1000) return (val / 1000).toFixed(0) + "K";
    return val.toLocaleString();
  };

  // Maintain refs for drawing to bypass stale state in event listeners
  const drawRef = useRef<(hIdx: number, progress: number) => void>(() => {});
  const hoveredIdxRef = useRef(-1);
  hoveredIdxRef.current = hoveredIdx;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 340;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2,
      cy = size / 2;
    const outerR = 140,
      innerR = 85;

    let animProgress = 0;
    let animFrame: number;

    const hexToRgba = (hex: string, a: number) => {
      const h = hex.replace("#", "");
      const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
      const r = parseInt(full.substring(0, 2), 16) || 0;
      const g = parseInt(full.substring(2, 4), 16) || 0;
      const b = parseInt(full.substring(4, 6), 16) || 0;
      return `rgba(${r},${g},${b},${a})`;
    };

    function drawDonut(hIdx: number, progress: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      let startAngle = -Math.PI / 2;
      const ap = Math.min(progress, 1);

      chains.forEach((c, i) => {
        const sliceAngle = (c.value / total) * Math.PI * 2 * ap;
        const endAngle = startAngle + sliceAngle;
        const isHovered = hIdx === i;
        const r = isHovered ? outerR + 9 : outerR;
        const ir = isHovered ? innerR - 4 : innerR;

        // Shadow for hovered segment
        if (isHovered) {
          ctx.save();
          ctx.shadowColor = c.color;
          ctx.shadowBlur = 20;
        }

        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.arc(cx, cy, ir, endAngle, startAngle, true);
        ctx.closePath();

        // Gradient fill
        const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR + 10);
        grad.addColorStop(0, hexToRgba(c.color, 0.88));
        grad.addColorStop(1, c.color);
        ctx.fillStyle = isHovered ? c.color : grad;
        ctx.fill();

        // High contrast divider between slices
        ctx.strokeStyle = isDark ? "#0A0A0A" : "#FFFFFF";
        ctx.lineWidth = isHovered ? 3.5 : 2.5;
        ctx.stroke();

        if (isHovered) ctx.restore();

        startAngle = endAngle;
      });

      // Inner glow ring
      const innerGrad = ctx.createRadialGradient(cx, cy, innerR - 10, cx, cy, innerR + 2);
      innerGrad.addColorStop(0, "transparent");
      innerGrad.addColorStop(0.7, isDark ? "rgba(167, 125, 255, 0.12)" : "rgba(167, 125, 255, 0.08)");
      innerGrad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.fillStyle = innerGrad;
      ctx.fill();
    }

    drawRef.current = drawDonut;

    function animateIn() {
      animProgress += 0.035;
      drawDonut(hoveredIdxRef.current, animProgress);
      if (animProgress < 1) {
        animFrame = requestAnimationFrame(animateIn);
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (size / rect.width);
      const my = (e.clientY - rect.top) * (size / rect.height);
      const dx = mx - cx,
        dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < innerR || dist > outerR + 12) {
        if (hoveredIdxRef.current !== -1) {
          setHoveredIdx(-1);
          setCenterTitle("ALL MODULES");
          setCenterVal("10.6M");
          setCenterSub("Total Transactions");
          setCenterColor(null);
          drawDonut(-1, 1);
        }
        return;
      }

      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      let cumAngle = -Math.PI / 2;
      let found = -1;
      for (let i = 0; i < chains.length; i++) {
        const sa = (chains[i].value / total) * Math.PI * 2;
        if (angle >= cumAngle && angle < cumAngle + sa) {
          found = i;
          break;
        }
        cumAngle += sa;
      }

      if (found !== hoveredIdxRef.current) {
        setHoveredIdx(found);
        if (found >= 0) {
          const c = chains[found];
          const pct = ((c.value / total) * 100).toFixed(1);
          setCenterTitle(c.name.toUpperCase());
          setCenterVal(formatShort(c.value));
          setCenterSub(`${pct}% of Total Volume`);
          setCenterColor(c.color);
        } else {
          setCenterTitle("ALL MODULES");
          setCenterVal("10.6M");
          setCenterSub("Total Transactions");
          setCenterColor(null);
        }
        drawDonut(found, 1);
      }
    };

    const handleMouseLeave = () => {
      setHoveredIdx(-1);
      setCenterTitle("ALL MODULES");
      setCenterVal("10.6M");
      setCenterSub("Total Transactions");
      setCenterColor(null);
      drawDonut(-1, 1);
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = (touch.clientX - rect.left) * (size / rect.width);
      const my = (touch.clientY - rect.top) * (size / rect.height);
      const dx = mx - cx,
        dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < innerR || dist > outerR + 12) {
        if (hoveredIdxRef.current !== -1) {
          setHoveredIdx(-1);
          setCenterTitle("ALL MODULES");
          setCenterVal("10.6M");
          setCenterSub("Total Transactions");
          setCenterColor(null);
          drawDonut(-1, 1);
        }
        return;
      }

      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      const normAngle = angle + Math.PI / 2;

      let acc = 0;
      let found = -1;
      for (let i = 0; i < chains.length; i++) {
        const slice = (chains[i].value / total) * Math.PI * 2;
        if (normAngle >= acc && normAngle < acc + slice) {
          found = i;
          break;
        }
        acc += slice;
      }

      if (found !== hoveredIdxRef.current) {
        setHoveredIdx(found);
        if (found !== -1) {
          const c = chains[found];
          const pct = ((c.value / total) * 100).toFixed(1);
          setCenterTitle(c.name.toUpperCase());
          setCenterVal(formatShort(c.value));
          setCenterSub(`${pct}% of Total Volume`);
          setCenterColor(c.color);
        } else {
          setCenterTitle("ALL MODULES");
          setCenterVal("10.6M");
          setCenterSub("Total Transactions");
          setCenterColor(null);
        }
        drawDonut(found, 1);
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouch, { passive: true });
    canvas.addEventListener("touchmove", handleTouch, { passive: true });
    canvas.addEventListener("touchend", handleMouseLeave);

    animateIn();

    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("touchmove", handleTouch);
      canvas.removeEventListener("touchend", handleMouseLeave);
    };
  }, [isDark]);

  return (
    <div
      className={cn(
        "border p-4 sm:p-6 font-mono w-full relative flex flex-col transition-colors duration-200",
        isDark
          ? "bg-[#161616] border-[#272727] text-[#F2F2F2] shadow-md"
          : "bg-white border-zinc-200 text-zinc-900 shadow-sm"
      )}
    >
      {/* Header bar with descriptive title and real-time feed badge */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-5 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-[#A77DFF] font-bold">
              Subsystem Telemetry
            </span>
            <span className="text-[11px] text-muted-foreground">•</span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Live Event Bus
            </span>
          </div>
          <h3 className="text-base font-bold tracking-tight mt-0.5 text-foreground">
            Workflows & Transaction Volume by Module
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 font-sans">
            Real-time message broker volume across ERP microservices, database writes, and integration triggers.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1 bg-[#A77DFF]/10 border border-[#A77DFF]/30 text-[#A77DFF] text-[11px] uppercase font-bold tracking-wider">
          <span className="w-2 h-2 rounded-full bg-[#8AE06C] animate-pulse"></span>
          <span>100% Operational</span>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row items-center justify-between gap-8 flex-1 min-h-[380px]">
        {/* Canvas container with absolute-centered values */}
        <div className="relative w-full max-w-[340px] aspect-square flex-shrink-0 flex items-center justify-center mx-auto">
          <canvas ref={canvasRef} className="block cursor-pointer w-full h-full max-w-[340px] max-h-[340px]"></canvas>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none font-mono max-w-[190px]">
            <div
              className="text-[10px] font-bold uppercase tracking-wider truncate mb-1"
              style={{ color: centerColor || (isDark ? "#757575" : "#64748B") }}
            >
              {centerTitle}
            </div>
            <div
              className="text-3xl md:text-4xl font-black tracking-tight"
              style={{ color: centerColor || (isDark ? "#F2F2F2" : "#0F172A") }}
            >
              {centerVal}
            </div>
            <div className="text-[11px] font-semibold text-muted-foreground mt-1 tracking-tight">
              {centerSub}
            </div>
          </div>
        </div>

        {/* Dynamic Legend with 3 clear readable columns */}
        <div className="flex flex-col gap-1.5 text-xs w-full max-w-xl">
          {/* Table Header for Legend */}
          <div className="flex items-center justify-between pb-1.5 border-b border-border/40 text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2">
            <span className="w-1/2">Subsystem Module</span>
            <span className="w-1/4 text-right">Transactions</span>
            <span className="w-1/4 text-right">Share</span>
          </div>

          {chains.map((c, i) => {
            const pct = ((c.value / total) * 100).toFixed(1);
            const isHovered = hoveredIdx === i;
            return (
              <div
                key={c.name}
                className={cn(
                  "flex items-center justify-between py-2 px-3 transition-all cursor-pointer border",
                  isHovered
                    ? isDark
                      ? "bg-[#272727] border-[#A77DFF]/50 text-white shadow-xs"
                      : "bg-slate-100 border-[#A77DFF]/40 text-slate-950 font-bold shadow-xs"
                    : isDark
                      ? "bg-transparent border-transparent text-zinc-300 hover:bg-[#202020] hover:text-white"
                      : "bg-transparent border-transparent text-zinc-700 hover:bg-slate-50 hover:text-zinc-950 font-medium"
                )}
                onMouseEnter={() => {
                  setHoveredIdx(i);
                  setCenterTitle(c.name.toUpperCase());
                  setCenterVal(formatShort(c.value));
                  setCenterSub(`${pct}% of Total Volume`);
                  setCenterColor(c.color);
                  drawRef.current(i, 1);
                }}
                onMouseLeave={() => {
                  setHoveredIdx(-1);
                  setCenterTitle("ALL MODULES");
                  setCenterVal("10.6M");
                  setCenterSub("Total Transactions");
                  setCenterColor(null);
                  drawRef.current(-1, 1);
                }}
              >
                {/* Module Column */}
                <div className="flex items-center gap-2.5 w-1/2 truncate pr-2">
                  <span
                    className="w-3 h-3 rounded-none inline-block flex-shrink-0 shadow-xs"
                    style={{ backgroundColor: c.color }}
                  ></span>
                  <span className="truncate">{c.name}</span>
                </div>

                {/* Volume Column */}
                <div className="w-1/4 text-right tabular-nums text-muted-foreground font-mono">
                  {c.value.toLocaleString()}
                </div>

                {/* Percentage Share Column */}
                <div className="w-1/4 text-right font-bold tabular-nums">
                  <span
                    className="px-2 py-0.5 rounded text-[10px]"
                    style={{
                      backgroundColor: `${c.color}20`,
                      color: c.color,
                      border: `1px solid ${c.color}40`,
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer metrics bar for high-level comprehension */}
      <div className="mt-5 pt-3 border-t border-border/40 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-[10px] uppercase text-muted-foreground block">Peak Channel</span>
          <span className="font-bold text-[#A77DFF]">Finance & Accounts (22.8%)</span>
        </div>
        <div>
          <span className="text-[10px] uppercase text-muted-foreground block">Average Throughput</span>
          <span className="font-bold text-foreground">353,000 txns / day</span>
        </div>
        <div>
          <span className="text-[10px] uppercase text-muted-foreground block">Network Latency</span>
          <span className="font-bold text-[#8AE06C]">18ms median</span>
        </div>
        <div>
          <span className="text-[10px] uppercase text-muted-foreground block">Payload Status</span>
          <span className="font-bold text-foreground">Zero Dropped Packets</span>
        </div>
      </div>
    </div>
  );
}

export default SubsystemTransactionVolumeChart;
