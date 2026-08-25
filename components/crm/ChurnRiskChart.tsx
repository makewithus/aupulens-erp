"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

export function ChurnRiskChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [cohorts, setCohorts] = useState<{ name: string; value: number; color: string }[]>([]);
  const [centerVal, setCenterVal] = useState("0");
  const [defaultCenterVal, setDefaultCenterVal] = useState("0");
  const [hoveredIdx, setHoveredIdx] = useState(-1);

  useEffect(() => {
    fetch("/api/crm/churn")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) {
          const s = d.data;
          const built = [
            { name: "Low Risk", value: s.low || 0, color: "#22c55e" },
            { name: "Medium Risk", value: s.medium || 0, color: "#facc15" },
            { name: "High Risk", value: s.high || 0, color: "#f59e0b" },
            { name: "Critical Risk", value: s.critical || 0, color: "#e11d48" },
          ];
          setCohorts(built);
          const totalAccounts = built.reduce((sum, c) => sum + c.value, 0);
          setCenterVal(String(totalAccounts));
          setDefaultCenterVal(String(totalAccounts));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const total = cohorts.reduce((s, c) => s + c.value, 0) || 1;

  // Maintain refs for drawing to bypass state closure issues in animation frames
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

      cohorts.forEach((c, i) => {
        const sliceAngle = (c.value / total) * Math.PI * 2 * ap;
        const endAngle = startAngle + sliceAngle;
        const isHovered = hIdx === i;
        const r = isHovered ? outerR + 4 : outerR;

        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
        ctx.closePath();

        // Flat fill — no glow/radial gradient, matches the minimal palette
        // used across the Reports page's line charts.
        ctx.fillStyle = isHovered ? c.color : hexToRgba(c.color, 0.85);
        ctx.fill();

        // Thin separator between slices
        ctx.strokeStyle = isDark ? "#0a0a0a" : "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        startAngle = endAngle;
      });
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
          setCenterVal(defaultCenterVal);
          drawDonut(-1, 1);
        }
        return;
      }

      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      let cumAngle = -Math.PI / 2;
      let found = -1;
      for (let i = 0; i < cohorts.length; i++) {
        const sa = (cohorts[i].value / total) * Math.PI * 2;
        if (angle >= cumAngle && angle < cumAngle + sa) {
          found = i;
          break;
        }
        cumAngle += sa;
      }

      if (found !== hoveredIdxRef.current) {
        setHoveredIdx(found);
        if (found >= 0) {
          setCenterVal(cohorts[found].value.toString());
        } else {
          setCenterVal(defaultCenterVal);
        }
        drawDonut(found, 1);
      }
    };

    const handleMouseLeave = () => {
      setHoveredIdx(-1);
      setCenterVal(defaultCenterVal);
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
  }, [isDark, cohorts, defaultCenterVal]);

  return (
    <div className={`rounded-lg p-6 font-mono w-full relative flex flex-col border ${
      isDark ? "bg-card border-border text-white" : "bg-white border-border text-foreground"
    }`}>
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-white" : "text-foreground"}`}>
            Churn Risk Segments
          </h3>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1 min-h-[340px] gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading churn data…</div>
      ) : total <= 1 && cohorts.every((c) => c.value === 0) ? (
        <div className="flex items-center justify-center flex-1 min-h-[340px] text-sm text-muted-foreground">No accounts scored for churn risk yet.</div>
      ) : (
      <div className="flex flex-col lg:flex-row items-center justify-between gap-6 flex-1 min-h-[340px]">
        {/* Canvas container with absolute-centered value */}
        <div className="relative w-[340px] h-[340px] flex-shrink-0 mx-auto">
          <canvas ref={canvasRef} className="block"></canvas>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none font-mono">
            <div className={`text-2xl md:text-3xl font-medium tracking-tighter ${isDark ? "text-white" : "text-foreground"}`}>
              {centerVal}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest mt-1">
              Active Accounts
            </div>
          </div>
        </div>

        {/* Dynamic Legend */}
        <div className="flex flex-col gap-1.5 text-[10px] text-muted-foreground max-w-xs w-full mx-auto">
          {cohorts.map((c, i) => {
            const pct = ((c.value / total) * 100).toFixed(1);
            const isHovered = hoveredIdx === i;
            return (
              <div
                key={c.name}
                className={`flex items-center justify-between py-0.5 px-2 transition-colors cursor-pointer rounded-[2px] ${
                  isHovered
                    ? isDark
                      ? "bg-accent text-white"
                      : "bg-accent text-foreground font-semibold"
                    : isDark
                    ? "hover:bg-accent/40 hover:text-foreground"
                    : "hover:bg-accent/50 hover:text-muted-foreground"
                }`}
                onMouseEnter={() => {
                  setHoveredIdx(i);
                  setCenterVal(c.value.toString());
                  drawRef.current(i, 1);
                }}
                onMouseLeave={() => {
                  setHoveredIdx(-1);
                  setCenterVal(defaultCenterVal);
                  drawRef.current(-1, 1);
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-[1px] inline-block flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  ></span>
                  <span className={isDark ? "text-muted-foreground" : "text-muted-foreground"}>{c.name}</span>
                </div>
                <span className={`font-semibold ${isDark ? "text-white" : "text-foreground"}`}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
