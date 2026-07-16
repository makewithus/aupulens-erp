"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

interface SalesVisualizationProps {
  availableDataTypes: Array<{ value: string; label: string }>;
  defaultDataType?: string;
  title?: string;
  className?: string;
}

// ── Organic looking wave dummy data generators when DB is empty ──
const getDummyData = (type: string, dateRangeStr: string) => {
  const days = Number(dateRangeStr) || 30;
  const data: any[] = [];

  if (type.includes("status_breakdown") || type.includes("status")) {
    return [
      { name: "Draft", value: 18 },
      { name: "Sent", value: 32 },
      { name: "Posted", value: 76 },
      { name: "Closed", value: 44 },
      { name: "Cancelled", value: 9 },
    ];
  }

  const from = new Date();
  from.setDate(from.getDate() - days);

  let seed = 1337;
  function rng() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let i = 0; i <= days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    const cycle = Math.sin((i / days) * Math.PI * 2.5);
    const baseOrders = Math.round(18 + cycle * 8 + rng() * 10);
    const baseQuotations = Math.round(26 + cycle * 12 + rng() * 14);
    const baseRevenue = Math.round(160000 + cycle * 60000 + rng() * 80000);

    data.push({
      date: dateStr,
      orders: Math.max(2, baseOrders),
      quotations: Math.max(4, baseQuotations),
      revenue: Math.max(10000, baseRevenue),
    });
  }

  return data;
};

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const fmtDate = (d: Date) =>
  months[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
const fmtFullDate = (d: Date) =>
  d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
const fmtK = (v: number) => {
  if (v >= 100000) return (v / 100000).toFixed(0) + "L";
  if (v >= 1000) return (v / 1000).toFixed(0) + "K";
  return v.toString();
};

export function SalesVisualization({
  availableDataTypes,
  defaultDataType,
  title = "Sales KPIs",
  className = "",
}: SalesVisualizationProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [selectedDataType, setSelectedDataType] = useState(
    defaultDataType || availableDataTypes[0]?.value || "orders_trend",
  );
  const [dateRange, setDateRange] = useState("30");
  const [groupBy, setGroupBy] = useState("day");

  const [visualizationData, setVisualizationData] = useState<any[]>([]);
  const [isLoadingViz, setIsLoadingViz] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipDateRef = useRef<HTMLDivElement>(null);
  const tooltipValueRef = useRef<HTMLDivElement>(null);

  // ── Fetch dynamic DB values or fallback to dummy waves ──
  const fetchVisualizationData = useCallback(async () => {
    if (!selectedDataType) return;
    try {
      setIsLoadingViz(true);
      const res = await fetch(
        `/api/sales/visualization?type=${selectedDataType}&dateRange=${dateRange}&groupBy=${groupBy}`,
      );
      if (!res.ok) throw new Error("Failed to fetch visualization data");
      const result = await res.json();
      if (!result.data || result.data.length === 0) {
        const dummy = getDummyData(selectedDataType, dateRange);
        setVisualizationData(dummy);
        setIsDemo(true);
      } else {
        setVisualizationData(result.data);
        setIsDemo(false);
      }
    } catch (err) {
      console.error("Error fetching visualization:", err);
      const dummy = getDummyData(selectedDataType, dateRange);
      setVisualizationData(dummy);
      setIsDemo(true);
    } finally {
      setIsLoadingViz(false);
    }
  }, [selectedDataType, dateRange, groupBy]);

  useEffect(() => {
    fetchVisualizationData();
  }, [fetchVisualizationData]);

  const isStatus = selectedDataType.includes("status_breakdown");
  const isRevenue = selectedDataType === "revenue_trend";
  const isOrders = selectedDataType === "orders_trend";
  const isConversion = selectedDataType === "quotation_to_order";
  const isTimeSeriesData = !isStatus;

  // ── Dynamic aggregated headers ──
  const headerLabel = useMemo(() => {
    const matched = availableDataTypes.find((d) => d.value === selectedDataType);
    return matched ? matched.label : "Trend Analysis";
  }, [selectedDataType, availableDataTypes]);

  const headerVal = useMemo(() => {
    if (visualizationData.length === 0) return "0";
    if (isRevenue) {
      const sum = visualizationData.reduce((acc, d) => acc + (d.revenue || 0), 0);
      return "₹" + sum.toLocaleString("en-IN");
    }
    if (isOrders) {
      const sum = visualizationData.reduce((acc, d) => acc + (d.orders || 0), 0);
      return sum.toLocaleString();
    }
    if (isConversion) {
      const sumOrders = visualizationData.reduce((acc, d) => acc + (d.orders || 0), 0);
      const sumQuotes = visualizationData.reduce((acc, d) => acc + (d.quotations || 0), 0);
      return `${sumOrders.toLocaleString()} Orders / ${sumQuotes.toLocaleString()} Quotes`;
    }
    if (isStatus) {
      const sum = visualizationData.reduce((acc, d) => acc + (d.value || 0), 0);
      return sum.toLocaleString() + " records";
    }
    return "0";
  }, [visualizationData, isRevenue, isOrders, isConversion, isStatus]);

  // ── Canvas draw effect loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    const tooltipDate = tooltipDateRef.current;
    const tooltipValue = tooltipValueRef.current;

    if (!canvas || !container || !tooltip || !tooltipDate || !tooltipValue || visualizationData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get yMax and ticks dynamically
    const maxVal = Math.max(
      1,
      ...visualizationData.map((d: any) => {
        if (isConversion) return Math.max(d.orders || 0, d.quotations || 0);
        if (isRevenue) return d.revenue || 0;
        if (isOrders) return d.orders || 0;
        if (isStatus) return d.value || 0;
        return 0;
      })
    );

    let step = 10;
    if (maxVal > 1000000) step = 200000;
    else if (maxVal > 100000) step = 50000;
    else if (maxVal > 20000) step = 10000;
    else if (maxVal > 5000) step = 1000;
    else if (maxVal > 500) step = 100;
    else if (maxVal > 50) step = 10;
    else step = 5;

    const yMax = Math.ceil(maxVal / step) * step;
    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += step) yTicks.push(v);

    const PAD = { top: 16, right: 50, bottom: 40, left: 10 };

    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const crosshairColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";

    const hexToFill = (hex: string, a: number) => {
      const h = hex.replace("#", "");
      const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
      const rv = parseInt(full.substring(0, 2), 16);
      const gv = parseInt(full.substring(2, 4), 16);
      const bv = parseInt(full.substring(4, 6), 16);
      return `rgba(${rv},${gv},${bv},${a})`;
    };

    function drawSingleLine(colorStr: string, field: string) {
      if (!ctx || !canvas) return;
      const W = canvas.width / (window.devicePixelRatio || 1);
      const H = canvas.height / (window.devicePixelRatio || 1);
      const cL = PAD.left,
        cR = W - PAD.right,
        cT = PAD.top,
        cB = H - PAD.bottom;
      const cW = cR - cL,
        cH = cB - cT;

      ctx.beginPath();
      for (let i = 0; i < visualizationData.length; i++) {
        const x = cL + (i / (visualizationData.length - 1)) * cW;
        const val = visualizationData[i][field] || 0;
        const y = cB - (val / yMax) * cH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colorStr;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Fill under
      ctx.lineTo(cR, cB);
      ctx.lineTo(cL, cB);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, cT, 0, cB);
      grad.addColorStop(0, hexToFill(colorStr, 0.08));
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fill();
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

      // Draw Grid Lines + Y Axis Labels
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      yTicks.forEach((v) => {
        const y = cB - (v / yMax) * cH;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cL, y);
        ctx.lineTo(cR, y);
        ctx.stroke();
        ctx.fillStyle = "#757575";
        ctx.fillText(fmtK(v), cR + 38, y);
      });

      // Draw X Axis Labels
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const xStep = Math.max(1, Math.floor(visualizationData.length / 8));
      for (let i = 0; i < visualizationData.length; i += xStep) {
        const x = cL + (i / (visualizationData.length - 1)) * cW;
        ctx.fillStyle = "#757575";
        const labelText = isStatus
          ? visualizationData[i].name
          : visualizationData[i].date
          ? fmtDate(new Date(visualizationData[i].date))
          : "";
        ctx.fillText(labelText || "", x, cB + 10);
      }

      // Draw Line paths
      if (isConversion) {
        drawSingleLine("#6CADF5", "orders");
        drawSingleLine("#f59e0b", "quotations");
      } else if (isRevenue) {
        drawSingleLine("#8AE06C", "revenue");
      } else if (isOrders) {
        drawSingleLine("#6CADF5", "orders");
      } else {
        // Status breakdown count
        drawSingleLine("#A77DFF", "value");
      }

      // Hover Crosshair guides + highlight dots
      if (
        highlightIdx !== undefined &&
        highlightIdx >= 0 &&
        highlightIdx < visualizationData.length
      ) {
        const hx = cL + (highlightIdx / (visualizationData.length - 1)) * cW;

        // Vertical guide line
        ctx.strokeStyle = crosshairColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, cT);
        ctx.lineTo(hx, cB);
        ctx.stroke();
        ctx.setLineDash([]);

        // Highlight circle dots
        const drawDot = (yVal: number, fillHex: string) => {
          const hy = cB - (yVal / yMax) * cH;
          ctx.beginPath();
          ctx.arc(hx, hy, 4, 0, Math.PI * 2);
          ctx.fillStyle = fillHex;
          ctx.fill();
          ctx.strokeStyle = isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
        };

        if (isConversion) {
          drawDot(visualizationData[highlightIdx].orders || 0, "#6CADF5");
          drawDot(visualizationData[highlightIdx].quotations || 0, "#f59e0b");
        } else if (isRevenue) {
          drawDot(visualizationData[highlightIdx].revenue || 0, "#8AE06C");
        } else if (isOrders) {
          drawDot(visualizationData[highlightIdx].orders || 0, "#6CADF5");
        } else {
          drawDot(visualizationData[highlightIdx].value || 0, "#A77DFF");
        }
      }
    }

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

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvas) return;
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
      const idx = Math.round(ratio * (visualizationData.length - 1));
      if (idx < 0 || idx >= visualizationData.length) {
        tooltip.style.display = "none";
        draw();
        return;
      }

      const d = visualizationData[idx];

      // Format Date in tooltip header
      const headerDateText = isStatus
        ? d.name
        : d.date
        ? fmtFullDate(new Date(d.date))
        : "";
      tooltipDate.textContent = headerDateText || "";

      // Tooltip values template
      if (isConversion) {
        tooltipValue.innerHTML = `
          <div class="flex items-center gap-1.5 text-[11px] mb-1">
            <span style="width:8px; height:8px; border-radius:1px; display:inline-block; background:#6CADF5"></span>
            <span class="text-muted-foreground/80">Orders</span>
            <b class="ml-4 font-bold text-foreground">${(d.orders || 0).toLocaleString()}</b>
          </div>
          <div class="flex items-center gap-1.5 text-[11px]">
            <span style="width:8px; height:8px; border-radius:1px; display:inline-block; background:#f59e0b"></span>
            <span class="text-muted-foreground/80">Quotations</span>
            <b class="ml-4 font-bold text-foreground">${(d.quotations || 0).toLocaleString()}</b>
          </div>
        `;
      } else if (isRevenue) {
        tooltipValue.innerHTML = `
          <span style="width:8px; height:8px; border-radius:1px; display:inline-block; background:#8AE06C"></span>
          <span class="ml-1 text-muted-foreground/80">Revenue</span>
          <b class="ml-4 font-bold text-foreground">₹${(d.revenue || 0).toLocaleString()}</b>
        `;
      } else if (isOrders) {
        tooltipValue.innerHTML = `
          <span style="width:8px; height:8px; border-radius:1px; display:inline-block; background:#6CADF5"></span>
          <span class="ml-1 text-muted-foreground/80">Orders</span>
          <b class="ml-4 font-bold text-foreground">${(d.orders || 0).toLocaleString()}</b>
        `;
      } else {
        tooltipValue.innerHTML = `
          <span style="width:8px; height:8px; border-radius:1px; display:inline-block; background:#A77DFF"></span>
          <span class="ml-1 text-muted-foreground/80">Count</span>
          <b class="ml-4 font-bold text-foreground">${(d.value || 0).toLocaleString()}</b>
        `;
      }

      tooltip.style.display = "block";
      const tipX = mx + 16;
      tooltip.style.left = (tipX + 210 > W ? mx - 220 : tipX) + "px";
      tooltip.style.top = Math.max(0, e.clientY - rect.top - 60) + "px";

      draw(idx);
    };

    const handleMouseLeave = () => {
      tooltip.style.display = "none";
      draw();
    };

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
  }, [visualizationData, isDark, theme, isConversion, isRevenue, isOrders, isStatus]);

  return (
    <Card
      className={cn(
        "overflow-hidden border border-border/40 shadow-none bg-background rounded-none p-8 font-mono",
        className,
      )}
    >
      <div className="flex flex-col gap-1 mb-6">
        <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/60">
          Charts & Analytics {isDemo && <span className="text-amber-500/70 ml-2 font-mono normal-case tracking-normal">(Demo Data - DB Empty)</span>}
        </span>
        <h3 className="text-xl font-medium tracking-tight text-foreground uppercase">
          {title}
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-6 mb-5 font-mono text-[13px] border-b border-border/20 pb-4">
        {availableDataTypes.map((d, idx) => (
          <span key={d.value} className="flex items-center gap-6">
            <button
              onClick={() => setSelectedDataType(d.value)}
              className={cn(
                "bg-none border-none cursor-pointer py-1 relative transition-colors duration-200 text-[11px] font-semibold",
                selectedDataType === d.value
                  ? "text-foreground after:content-[''] after:absolute after:left-0 after:bottom-[-18px] after:w-full after:h-[1px] after:bg-foreground"
                  : "text-muted-foreground/50 hover:text-foreground",
              )}
            >
              {d.label}
            </button>
            {idx < availableDataTypes.length - 1 && (
              <span className="text-border/40 select-none">|</span>
            )}
          </span>
        ))}
      </div>

      {/* Filters & Toggles bar */}
      <div className="flex flex-wrap items-center gap-6 p-4 border border-border/40 bg-white/[0.01] rounded-none mb-6">
        {isTimeSeriesData && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
              Date Range
            </span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent border-0 text-xs font-medium text-foreground focus:ring-0 focus:outline-none cursor-pointer p-0"
            >
              <option value="7" className="bg-background text-foreground">
                Last 7 days
              </option>
              <option value="30" className="bg-background text-foreground">
                Last 30 days
              </option>
              <option value="90" className="bg-background text-foreground">
                Last 90 days
              </option>
              <option value="365" className="bg-background text-foreground">
                Last 12 months
              </option>
            </select>
          </div>
        )}

        {isTimeSeriesData && <div className="w-[1px] h-7 bg-border/40" />}

        {isTimeSeriesData && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
              Interval
            </span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="bg-transparent border-0 text-xs font-medium text-foreground focus:ring-0 focus:outline-none cursor-pointer p-0"
            >
              <option value="day" className="bg-background text-foreground">
                Day
              </option>
              <option value="week" className="bg-background text-foreground">
                Week
              </option>
              <option value="month" className="bg-background text-foreground">
                Month
              </option>
            </select>
          </div>
        )}

        <span
          onClick={() => {
            setDateRange("30");
            setGroupBy("day");
          }}
          className="text-[11px] uppercase text-muted-foreground/50 hover:text-foreground cursor-pointer ml-auto select-none"
        >
          Reset
        </span>
      </div>

      {/* Panel Header */}
      <div className="flex items-center gap-2 mb-4 font-mono text-[12px] text-muted-foreground/60 uppercase">
        <span className="font-semibold text-foreground/80">{headerLabel}</span>
        <span className="text-border/60">|</span>
        <span className="font-medium text-foreground tracking-wide font-sans text-sm">
          {headerVal}
        </span>
      </div>

      {/* Chart Canvas Container */}
      <div ref={containerRef} className="relative w-full h-[320px] mt-2">
        {isLoadingViz ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
          </div>
        ) : visualizationData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 border border-dashed border-border/40">
            <p className="text-xs font-semibold uppercase tracking-wider">
              No data available
            </p>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="block w-full h-full cursor-crosshair"
            ></canvas>

            {/* Custom Tooltip */}
            <div
              ref={tooltipRef}
              className="absolute pointer-events-none bg-[#141414]/95 border border-border/40 p-3 font-mono text-[11px] text-foreground shadow-xl min-w-[200px] rounded-none hidden z-10"
            >
              <div
                ref={tooltipDateRef}
                className="text-muted-foreground/60 mb-1"
              ></div>
              <div
                ref={tooltipValueRef}
                className="flex flex-col gap-1 mt-1 text-xs"
              ></div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
