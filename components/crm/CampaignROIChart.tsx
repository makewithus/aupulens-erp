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

export function CampaignROIChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const [loading, setLoading] = useState(true);
  const [allPoints, setAllPoints] = useState<RoiTrendPoint[]>([]);

  useEffect(() => {
    fetch("/api/crm/reports/roi-trend?days=365")
      .then((res) => res.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data?.points)) setAllPoints(d.data.points);
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
  const latestRoi = latestPoint?.roiPercentage;

  return (
    <div
      className={cn(
        "rounded-lg border font-mono w-full relative transition-colors duration-200",
        isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-[#e5e5e5] text-foreground"
      )}
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 border-b border-[#272727]/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8AE06C] animate-pulse"></span>
            <h2 className="text-base font-semibold uppercase tracking-wider">
              Campaign ROI Trend
            </h2>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#8AE06C]/15 text-[#8AE06C] border border-[#8AE06C]/30">
              Daily Cumulative
            </span>
          </div>
          <p className="text-[11px] text-[#757575] mt-0.5">
            Cumulative Return on Investment percentage · Continuous historical telemetry
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <span className="text-[10px] text-[#757575] uppercase tracking-wider block">
              Current ROI
            </span>
            <span className={cn("text-base font-bold", latestRoi == null ? "text-muted-foreground" : latestRoi >= 0 ? (isDark ? "text-[#8AE06C]" : "text-[#16A34A]") : "text-[#F56868]")}>
              {latestRoi == null ? "—" : `${latestRoi.toFixed(1)}%`}
            </span>
          </div>
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="flex items-center justify-center min-h-[420px] gap-2 text-[#757575] text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[#8AE06C]" />
            Loading ROI trend…
          </div>
        ) : allPoints.length === 0 ? (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
            No campaign budget or attributed revenue history is available.
          </div>
        ) : (
          <TradingLineChart
            data={chartData}
            valueKey="value"
            dateKey="date"
            metricLabel="ROI Percentage"
            title="CAMPAIGN ROI"
            currencyPrefix=""
            colorTheme="white"
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
