"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

const DEMO_CHURN_COHORTS = [
  { name: "Low Risk", value: 142, color: "#8AE06C" },
  { name: "Medium Risk", value: 58, color: "#F1DF38" },
  { name: "High Risk", value: 24, color: "#6CADF5" },
  { name: "Critical Risk", value: 9, color: "#F56868" },
];

export function ChurnRiskChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [cohorts, setCohorts] = useState<{ name: string; value: number; color: string }[]>(DEMO_CHURN_COHORTS);
  const [centerVal, setCenterVal] = useState("233");
  const [defaultCenterVal, setDefaultCenterVal] = useState("233");
  const [hoveredIdx, setHoveredIdx] = useState(-1);

  useEffect(() => {
    fetch("/api/crm/churn")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) {
          const s = d.data;
          const built = [
            { name: "Low Risk", value: s.low || 0, color: "#8AE06C" },
            { name: "Medium Risk", value: s.medium || 0, color: "#F1DF38" },
            { name: "High Risk", value: s.high || 0, color: "#6CADF5" },
            { name: "Critical Risk", value: s.critical || 0, color: "#F56868" },
          ];
          const totalAccounts = built.reduce((sum, c) => sum + c.value, 0);
          if (totalAccounts > 0) {
            setCohorts(built);
            setCenterVal(String(totalAccounts));
            setDefaultCenterVal(String(totalAccounts));
          }
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
      const ap = Math.max(0, Math.min(progress, 1));
      const radiusScale = 0.88 + 0.12 * ap;

      cohorts.forEach((c, i) => {
        const sliceAngle = (c.value / total) * Math.PI * 2 * ap;
        const endAngle = startAngle + sliceAngle;
        const isHovered = hIdx === i;
        const r = (isHovered ? outerR + 4 : outerR) * radiusScale;
        const inR = innerR * radiusScale;

        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.arc(cx, cy, inR, endAngle, startAngle, true);
        ctx.closePath();

        // Flat fill — matches the minimal palette
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

    const startTime = performance.now();
    const duration = 850;
    function animateIn(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      drawDonut(hoveredIdxRef.current, easeOut);
      if (t < 1) {
        animFrame = requestAnimationFrame(animateIn);
      } else {
        drawDonut(hoveredIdxRef.current, 1);
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(animFrame);
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

    animFrame = requestAnimationFrame(animateIn);

    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isDark, cohorts, defaultCenterVal]);

  return (
    <div className={`chart-animate-in chart-shimmer-border rounded-lg p-6 font-mono w-full relative flex flex-col border ${
      isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-[#e5e5e5] text-foreground"
    }`}>
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <h3 className={`text-lg font-normal uppercase mt-0.5 ${isDark ? "text-[#F2F2F2]" : "text-foreground"}`}>
            Churn Risk Segments
          </h3>
          <p className="text-[10px] text-[#757575] mt-0.5">Account health risk cohorts breakdown</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1 min-h-[340px] gap-2 text-[#757575] text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading churn data…</div>
      ) : total <= 1 && cohorts.every((c) => c.value === 0) ? (
        <div className="flex items-center justify-center flex-1 min-h-[340px] text-sm text-[#757575]">No accounts scored for churn risk yet.</div>
      ) : (
      <div className="flex flex-col lg:flex-row items-center justify-between gap-6 flex-1 min-h-[340px]">
        {/* Canvas container with absolute-centered value */}
        <div className="relative w-[340px] h-[340px] flex-shrink-0 mx-auto">
          <canvas ref={canvasRef} className="block"></canvas>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none font-mono">
            <div className={`text-2xl md:text-3xl font-medium tracking-tighter ${isDark ? "text-[#F2F2F2]" : "text-foreground"}`}>
              {centerVal}
            </div>
            <div className="text-[9px] text-[#757575] uppercase tracking-widest mt-1">
              Active Accounts
            </div>
          </div>
        </div>

        {/* Dynamic Legend */}
        <div className="flex flex-col gap-2 text-xs text-[#757575] max-w-sm w-full mx-auto">
          {cohorts.map((c, i) => {
            const pct = ((c.value / total) * 100).toFixed(1);
            const isHovered = hoveredIdx === i;
            return (
              <div
                key={c.name}
                className={`flex items-center justify-between py-1.5 px-2.5 transition-colors cursor-pointer rounded border ${
                  isHovered
                    ? isDark
                      ? "bg-[#161616] border-[#525252] text-[#F2F2F2]"
                      : "bg-[#f4f4f5] border-[#d4d4d8] text-foreground font-semibold"
                    : isDark
                    ? "bg-[#161616]/40 border-[#272727]/60 hover:border-[#525252]"
                    : "bg-white border-[#e5e5e5] hover:bg-slate-50"
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
                  <span className={isDark ? "text-[#F2F2F2]" : "text-[#1F2937]"}>{c.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#757575] font-mono text-[11px]">{c.value} accts</span>
                  <span className={`font-semibold tabular-nums text-xs ${isDark ? "text-[#F2F2F2]" : "text-[#111827]"}`}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
