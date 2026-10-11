"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { TradingLineChart, LineDataPoint } from "@/components/charts/TradingLineChart";
import { cn } from "@/lib/utils";

interface RevenueTrendPoint {
  monthKey: string;
  label: string;
  monthValue: number;
  cumulativeValue: number;
}

interface DailyRevenuePoint {
  date: string;
  dayValue: number;
  cumulativeValue: number;
}

export function RevenueTrendChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<RevenueTrendPoint[]>([]);
  const [dailyPoints, setDailyPoints] = useState<DailyRevenuePoint[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    fetch("/api/crm/reports/revenue-trend?months=12")
      .then((res) => res.json())
      .then((d) => {
        if (d.success && d.data) {
          if (Array.isArray(d.data.points)) setPoints(d.data.points);
          if (Array.isArray(d.data.dailyPoints)) setDailyPoints(d.data.dailyPoints);
          if (typeof d.data.totalRevenue === "number") setTotalRevenue(d.data.totalRevenue);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const chartData: LineDataPoint[] | undefined = useMemo(() => {
    if (dailyPoints.length > 0) {
      return dailyPoints.map((p) => ({
        date: p.date,
        value: p.cumulativeValue,
        open: Math.round(p.cumulativeValue * 0.99),
        high: Math.round(p.cumulativeValue * 1.01),
        low: Math.round(p.cumulativeValue * 0.985),
        close: p.cumulativeValue,
        label: new Date(p.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      }));
    }
    if (points.length > 0) {
      return points.map((p) => ({
        date: p.label,
        value: p.cumulativeValue,
        open: p.cumulativeValue,
        high: p.cumulativeValue,
        low: p.cumulativeValue,
        close: p.cumulativeValue,
        label: p.label,
      }));
    }
    return undefined;
  }, [dailyPoints, points]);

  function fmtHeader(v: number) {
    if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2) + " Cr";
    if (v >= 100000) return "₹" + (v / 100000).toFixed(2) + " L";
    return "₹" + v.toLocaleString("en-IN");
  }

  return (
    <div
      className={cn(
        "rounded-lg border font-mono w-full relative transition-colors duration-200",
        isDark ? "bg-[#0b0e11] border-border text-white" : "bg-white border-border text-foreground"
      )}
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <h2 className="text-base font-semibold uppercase tracking-wider">
              Cumulative Revenue Trend
            </h2>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Closed Won
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Closed Won deals accumulation over time · Continuous daily telemetry
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
            Revenue (12 mo)
          </span>
          <span className="text-base font-bold text-emerald-400">
            {fmtHeader(totalRevenue)}
          </span>
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="flex items-center justify-center min-h-[440px] gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            Loading revenue telemetry…
          </div>
        ) : (
          <TradingLineChart
            data={chartData}
            valueKey="value"
            dateKey="date"
            metricLabel="Cumulative Revenue"
            title="REVENUE TREND"
            currencyPrefix="₹"
            colorTheme="emerald"
            height={440}
            showTopStats={true}
            showToolbar={true}
            showMA={true}
            isDark={isDark}
          />
        )}
      </div>
    </div>
  );
}
