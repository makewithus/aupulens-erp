"use client";

import React, { useMemo } from "react";
import { useThemeStore } from "@/store/themeStore";
import { TradingLineChart, LineDataPoint } from "@/components/charts/TradingLineChart";
import { cn } from "@/lib/utils";

function generate730IntegrationPipelines(): LineDataPoint[] {
  const points: LineDataPoint[] = [];
  const totalDays = 730;
  const now = new Date();
  let cumulative = 420;

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    // Daily active data flow pipelines
    const t = (totalDays - i) / totalDays;
    const baseDaily = 2 + Math.floor(5 * Math.pow(t, 1.6));
    const noise = ((i * 19) % 5) - 2;
    const dailyInc = Math.max(1, Math.round((baseDaily + noise) * (isWeekend ? 0.5 : 1.0)));

    cumulative += dailyInc;

    points.push({
      date: dateStr,
      value: cumulative,
      open: cumulative - dailyInc,
      high: cumulative + 2,
      low: cumulative - dailyInc,
      close: cumulative,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }

  return points;
}

export function IntegrationPipelinesChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const chartData = useMemo(() => generate730IntegrationPipelines(), []);
  const latestCount = chartData[chartData.length - 1]?.value || 2961;

  return (
    <div
      className={cn(
        "rounded-lg border font-mono w-full relative transition-colors duration-200",
        isDark ? "bg-[#0b0e11] border-border text-white" : "bg-white border-border text-foreground"
      )}
    >
      <div className="flex justify-between items-center gap-4 p-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-sm font-semibold uppercase tracking-wider">
              Scheduled Integration Pipelines
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Active cross-system ETL data ingestion & orchestration pipelines
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
            Active Pipelines
          </span>
          <span className="text-base font-bold text-white">
            {latestCount.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="p-3">
        <TradingLineChart
          data={chartData}
          valueKey="value"
          dateKey="date"
          metricLabel="Active Pipelines"
          title="INTEGRATION PIPELINES"
          currencyPrefix=""
          colorTheme="white"
          height={380}
          showTopStats={true}
          showToolbar={true}
          showMA={true}
          isDark={isDark}
        />
      </div>
    </div>
  );
}
