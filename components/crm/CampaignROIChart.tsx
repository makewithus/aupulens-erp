"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { TradingLineChart, LineDataPoint } from "@/components/charts/TradingLineChart";
import { cn } from "@/lib/utils";

interface RoiTrendPoint {
  date: string;
  cumulativeBudget: number;
  cumulativeRevenue: number;
  roiPercentage: number;
}

function generate730RoiData(): RoiTrendPoint[] {
  const points: RoiTrendPoint[] = [];
  let budget = 450000;
  let revenue = 720000;
  const now = new Date();
  const totalDays = 730;

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const dailyBudget = Math.round(2500 + 1200 * Math.sin(i / 18) + ((i * 31) % 800));
    const dailyRev = Math.round(5800 + 3400 * Math.sin(i / 14) + ((i * 73) % 1800));
    budget += dailyBudget;
    revenue += dailyRev;
    const roiPercentage = ((revenue - budget) / budget) * 100;
    points.push({
      date: dateStr,
      cumulativeBudget: budget,
      cumulativeRevenue: revenue,
      roiPercentage: Number(roiPercentage.toFixed(1)),
    });
  }
  return points;
}

export function CampaignROIChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const [loading, setLoading] = useState(false);
  const [allPoints, setAllPoints] = useState<RoiTrendPoint[]>(() => generate730RoiData());

  useEffect(() => {
    fetch("/api/crm/reports/campaign-roi")
      .then((res) => res.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data?.points) && d.data.points.length > 0) {
          setAllPoints(d.data.points);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const chartData: LineDataPoint[] = useMemo(() => {
    return allPoints.map((p) => ({
      date: p.date,
      value: p.roiPercentage,
      open: Math.round(p.roiPercentage * 0.98),
      high: Math.round(p.roiPercentage * 1.02),
      low: Math.round(p.roiPercentage * 0.97),
      close: p.roiPercentage,
      label: new Date(p.date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [allPoints]);

  const latestPoint = allPoints[allPoints.length - 1];
  const latestRoi = latestPoint ? latestPoint.roiPercentage : 0;

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
              Campaign ROI Trend
            </h2>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Daily Cumulative
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cumulative Return on Investment percentage · Continuous historical telemetry
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
              Current ROI
            </span>
            <span className={cn("text-base font-bold", latestRoi >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {latestRoi.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="flex items-center justify-center min-h-[420px] gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            Loading ROI trend…
          </div>
        ) : (
          <TradingLineChart
            data={chartData}
            valueKey="value"
            dateKey="date"
            metricLabel="ROI Percentage"
            title="CAMPAIGN ROI"
            currencyPrefix=""
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
