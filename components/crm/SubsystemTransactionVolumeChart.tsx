"use client";

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/store/themeStore";

export function SubsystemTransactionVolumeChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [centerVal, setCenterVal] = useState("10.6M");
  const [hoveredIdx, setHoveredIdx] = useState(-1);

  const chains = [
    { name: "Finance", value: 2420000, color: "#6366f1" },
    { name: "Supply Chain", value: 1180000, color: "#e11d48" },
    { name: "Inventory", value: 1540000, color: "#3b82f6" },
    { name: "Human Resources", value: 1310000, color: "#f59e0b" },
    { name: "CRM", value: 890000, color: "#facc15" },
    { name: "Warehouse Mgmt", value: 1060000, color: "#ec4899" },
    { name: "Billing", value: 980000, color: "#8b5cf6" },
    { name: "Sales & Order", value: 420000, color: "#22c55e" },
    { name: "Manufacturing", value: 350000, color: "#1e3a5f" },
    { name: "Others", value: 470000, color: "#555555" }
  ];

  const total = chains.reduce((s, c) => s + c.value, 0);

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
      const r = parseInt(full.substring(0, 2), 16);
      const g = parseInt(full.substring(2, 4), 16);
      const b = parseInt(full.substring(4, 6), 16);
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
        const r = isHovered ? outerR + 8 : outerR;
        const ir = isHovered ? innerR - 4 : innerR;

        // Shadow for hovered
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
        grad.addColorStop(0, hexToRgba(c.color, 0.8));
        grad.addColorStop(1, c.color);
        ctx.fillStyle = isHovered ? c.color : grad;
        ctx.fill();

        // Subtle border between slices
        ctx.strokeStyle = isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (isHovered) ctx.restore();

        startAngle = endAngle;
      });

      // Inner glow ring
      const innerGrad = ctx.createRadialGradient(cx, cy, innerR - 10, cx, cy, innerR + 2);
      innerGrad.addColorStop(0, "transparent");
      innerGrad.addColorStop(0.7, isDark ? "rgba(167, 139, 250, 0.05)" : "rgba(167, 139, 250, 0.02)");
      innerGrad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.fillStyle = innerGrad;
      ctx.fill();
    }

    drawRef.current = drawDonut;

    function animateIn() {
      animProgress += 0.025;
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

      if (dist < innerR || dist > outerR + 10) {
        if (hoveredIdxRef.current !== -1) {
          setHoveredIdx(-1);
          setCenterVal("10.6M");
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
          setCenterVal((chains[found].value / 1000000).toFixed(1) + "M");
        } else {
          setCenterVal("10.6M");
        }
        drawDonut(found, 1);
      }
    };

    const handleMouseLeave = () => {
      setHoveredIdx(-1);
      setCenterVal("10.6M");
      drawDonut(-1, 1);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    animateIn();

    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isDark]);

  return (
    <div className="bg-card border border-border rounded-none p-6 font-mono w-full relative flex flex-col">
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Subsystem Transaction Volume
          </span>
          <h3 className="text-sm font-normal text-foreground uppercase mt-0.5">
            Workflows by Module
          </h3>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-center justify-between gap-6 flex-1 min-h-[380px]">
        {/* Canvas container with absolute-centered values */}
        <div className="relative w-[340px] h-[340px] flex-shrink-0">
          <canvas ref={canvasRef} className="block"></canvas>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none font-mono">
            <div className="text-2xl md:text-3xl font-medium text-foreground tracking-tighter">
              {centerVal}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest mt-1">
              Total Workflows
            </div>
          </div>
        </div>

        {/* Dynamic Legend */}
        <div className="flex flex-col gap-1.5 text-[10px] text-muted-foreground max-w-xs w-full">
          {chains.map((c, i) => {
            const pct = ((c.value / total) * 100).toFixed(1);
            const isHovered = hoveredIdx === i;
            return (
              <div
                key={c.name}
                className={`flex items-center justify-between py-0.5 px-2 transition-colors cursor-pointer rounded-[2px] ${
                  isHovered ? "bg-accent text-foreground" : "hover:bg-accent/40 hover:text-foreground"
                }`}
                onMouseEnter={() => {
                  setHoveredIdx(i);
                  setCenterVal((c.value / 1000000).toFixed(1) + "M");
                  drawRef.current(i, 1);
                }}
                onMouseLeave={() => {
                  setHoveredIdx(-1);
                  setCenterVal("10.6M");
                  drawRef.current(-1, 1);
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-[1px] inline-block flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  ></span>
                  <span>{c.name}</span>
                </div>
                <span className="font-semibold text-foreground">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
