"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";

import { ChartCard } from "./ChartCard";

interface DashboardChartsProps {
  summary: any;
  formatCurrency: (value: number) => string;
}

export function DashboardCharts({
  summary,
  formatCurrency,
}: DashboardChartsProps) {
  const financialData = [
    {
      name: "Revenue",
      value: summary.finance.totalRevenue,
      color: "hsl(142, 76%, 36%)",
    },
    {
      name: "Expenses",
      value: summary.finance.totalExpenses,
      color: "hsl(0, 84%, 60%)",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-1 lg:grid-cols-3">
      <ChartCard
  title="Financial Health"
  subtitle="Revenue · Expenses · Net Income"
>
  {(() => {
    const revenue = summary.finance.totalRevenue;
    const expenses = summary.finance.totalExpenses;
    const net = summary.finance.netIncome;

    const ratio =
      revenue > 0
        ? Math.min(100, (expenses / revenue) * 100)
        : 0;

    return (
      <div className="flex h-[320px] flex-col justify-between">

        {/* Top */}

        <div className="flex items-start justify-between gap-8">

          <div className="flex-1 space-y-8">

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
                Revenue
              </p>

              <p className="mt-2 text-[34px] font-black tracking-tighter">
                {formatCurrency(revenue)}
              </p>
            </div>

            <div className="h-px bg-border/40" />

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
                Expenses
              </p>

              <p className="mt-2 text-[30px] font-semibold tracking-tight opacity-75">
                {formatCurrency(expenses)}
              </p>
            </div>

          </div>

          {/* Decorative SVG */}

          <div className="opacity-60">

            <svg
              width="120"
              height="160"
              viewBox="0 0 120 160"
              fill="none"
            >
              <path
                d="M15 145
                   C35 90 45 60 60 100
                   C72 130 85 125 105 35"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-pulse"
              />

              <circle
                cx="105"
                cy="35"
                r="4"
                fill="currentColor"
              />
            </svg>

          </div>

        </div>

        {/* Bottom */}

        <div className="space-y-5">

          <div className="flex items-center justify-between">

            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/50">
              Net Income
            </span>

            <span
              className={`text-xl font-semibold ${
                net >= 0
                  ? ""
                  : "opacity-60"
              }`}
            >
              {formatCurrency(net)}
            </span>

          </div>

          <div className="h-1 overflow-hidden bg-border/40">

            <div
              className="h-full bg-foreground transition-all duration-1000"
              style={{
                width: `${100 - ratio}%`,
              }}
            />

          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">

            <span>Profitability</span>

            <span>
              {(100 - ratio).toFixed(0)}%
            </span>

          </div>

        </div>

      </div>
    );
  })()}
</ChartCard>

      {/* Revenue Trend */}
{/* Revenue Trend */}
<ChartCard
  title="Revenue Trend"
  subtitle="Last 6 months"
>
  <div className="flex h-[320px] flex-col justify-between">

    {/* KPI */}

    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
        Total Revenue
      </p>

      <h2 className="mt-2 text-[48px] font-black tracking-tighter leading-none">
        {formatCurrency(summary.finance.totalRevenue)}
      </h2>

      <p className="mt-3 text-sm text-muted-foreground">
        {summary.finance.revenueChange >= 0 ? "+" : ""}
        {summary.finance.revenueChange.toFixed(1)}% compared to last month
      </p>
    </div>

    {/* Sparkline */}

    <div className="h-[150px] -mx-3">

      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={summary.chartData}
          margin={{
            top: 10,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >

          <defs>

            <linearGradient
              id="revenueGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="currentColor"
                stopOpacity={0.18}
              />

              <stop
                offset="100%"
                stopColor="currentColor"
                stopOpacity={0}
              />

            </linearGradient>

          </defs>

          <Tooltip
            cursor={false}
            contentStyle={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              boxShadow: "none",
            }}
            formatter={(value: number) =>
              formatCurrency(value)
            }
          />

          <Line
            type="natural"
            dataKey="revenue"
            stroke="currentColor"
            strokeWidth={2.5}
            dot={false}
            activeDot={{
              r: 5,
              strokeWidth: 2,
            }}
          />

        </LineChart>
      </ResponsiveContainer>

    </div>

    {/* Months */}

    <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">

      {summary.chartData.map((item: any) => (
        <span key={item.month}>
          {item.month}
        </span>
      ))}

    </div>

  </div>
</ChartCard>

      {/* Orders */}
      {/* Order Activity */}
<ChartCard
  title="Order Activity"
  subtitle="Monthly operational cadence"
>
  <div className="flex h-[320px] flex-col justify-between">

    {/* KPI */}

    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">
        Total Orders
      </p>

      <h2 className="mt-2 text-[48px] font-black leading-none tracking-tighter">
        {summary.sales.totalOrders}
      </h2>

      <p className="mt-3 text-sm text-muted-foreground">
        {summary.sales.ordersCurrentMonth} this month
      </p>
    </div>

    {/* Timeline */}

    <div className="space-y-6 py-6">

      {summary.chartData.map((item: any) => {
        const maxOrders = Math.max(
          ...summary.chartData.map((m: any) => m.orders)
        );

        const width =
          (item.orders / maxOrders) * 100;

        return (
          <div
            key={item.month}
            className="grid grid-cols-[42px_1fr_auto] items-center gap-4"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">
              {item.month}
            </span>

            <div className="relative h-[2px] bg-border/30 overflow-hidden">

              <div
                className="absolute inset-y-0 left-0 bg-foreground transition-all duration-700"
                style={{
                  width: `${width}%`,
                }}
              />

            </div>

            <span className="text-sm font-medium tabular-nums">
              {item.orders}
            </span>

          </div>
        );
      })}

    </div>

    {/* Footer */}

    <div className="flex items-center justify-between border-t border-border/30 pt-5">

      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
        Peak Month
      </span>

      <span className="text-sm font-medium">
        {
          [...summary.chartData].sort(
            (a: any, b: any) => b.orders - a.orders
          )[0].month
        }
      </span>

    </div>

  </div>
</ChartCard>
    </div>
  );
}