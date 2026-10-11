"use client";

import React, { useMemo } from "react";
import { useThemeStore } from "@/store/themeStore";
import { TradingLineChart, LineDataPoint } from "@/components/charts/TradingLineChart";
import { cn } from "@/lib/utils";

function generate730ModuleRegistrations(): LineDataPoint[] {
  const points: LineDataPoint[] = [];
  const totalDays = 730;
  const now = new Date();
  let cumulative = 12400;

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    // Organic daily additions with growth acceleration
    const t = (totalDays - i) / totalDays;
    const baseDaily = 45 + Math.floor(95 * Math.pow(t, 1.4));
    const noise = ((i * 47) % 35) - 15;
    const dailyInc = Math.max(8, Math.round((baseDaily + noise) * (isWeekend ? 0.4 : 1.0)));

    cumulative += dailyInc;

    points.push({
      date: dateStr,
      value: cumulative,
      open: cumulative - dailyInc,
      high: cumulative + Math.round(dailyInc * 0.2),
      low: cumulative - dailyInc,
      close: cumulative,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }

  return points;
}

export function ModuleRegistrationsChart() {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  const chartData = useMemo(() => generate730ModuleRegistrations(), []);
  const latestCount = chartData[chartData.length - 1]?.value || 71235;

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
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-sm font-semibold uppercase tracking-wider">
              Enterprise Module Registrations
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Active module provisioning & enterprise license activation over time
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
            Total Provisioned
          </span>
          <span className="text-base font-bold text-cyan-400">
            {latestCount.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="p-3">
        <TradingLineChart
          data={chartData}
          valueKey="value"
          dateKey="date"
          metricLabel="Registered Users"
          title="MODULE REGISTRATIONS"
          currencyPrefix=""
          colorTheme="electric-blue"
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
