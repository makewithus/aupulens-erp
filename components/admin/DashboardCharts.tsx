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
      {/* Financial Breakdown */}
      <ChartCard
        title="Financial Breakdown"
        subtitle="Revenue vs Expenses"
      >
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={financialData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={90}
              labelLine={false}
              label={(entry: { name?: string; value?: number }) =>
                `${entry.name}: ${formatCurrency(entry.value ?? 0)}`
              }
            >
              {financialData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.color}
                />
              ))}
            </Pie>

            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                backgroundColor: "hsl(var(--background))",
              }}
            />

            <Legend
              wrapperStyle={{
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Revenue Trend */}
      <ChartCard
        title="Revenue Trend"
        subtitle="Last 6 months"
      >
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={summary.chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
            />

            <XAxis
              dataKey="month"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
            />

            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickFormatter={(value) =>
                `₹${(value / 1000).toFixed(0)}k`
              }
            />

            <Tooltip
              formatter={(value: number) => [
                formatCurrency(value),
                "Revenue",
              ]}
              contentStyle={{
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                backgroundColor: "hsl(var(--background))",
              }}
            />

            <Line
              type="monotone"
              dataKey="revenue"
              stroke="hsl(142,76%,36%)"
              strokeWidth={3}
              dot={{
                r: 4,
              }}
              activeDot={{
                r: 6,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Orders */}
      <ChartCard
        title="Orders Volume"
        subtitle="Monthly order count"
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={summary.chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
            />

            <XAxis
              dataKey="month"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
            />

            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
            />

            <Tooltip
              formatter={(value: number) => [
                value,
                "Orders",
              ]}
              contentStyle={{
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                backgroundColor: "hsl(var(--background))",
              }}
            />

            <Bar
              dataKey="orders"
              fill="hsl(217,91%,60%)"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}