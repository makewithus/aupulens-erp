"use client";

import { StatCard } from "./StatCard";

interface DashboardMetricsProps {
  summary: any;
  formatCurrency: (value: number) => string;
  enabledModules: readonly string[];
}

export function DashboardMetrics({
  summary,
  formatCurrency,
  enabledModules,
}: DashboardMetricsProps) {
  const has = (module: string) => enabledModules.includes(module);

  return (
    <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-4">
      {has("finance") && <StatCard
        title="Net Income"
        value={formatCurrency(summary.finance.netIncome)}
        subtitle="Revenue - Expenses"
      />}

      {has("finance") && <StatCard
        title="Transactions"
        value={summary.finance.totalTransactions}
        subtitle="Payment Records"
      />}

      {has("inventory") && <StatCard
        title="Stock Transfers"
        value={summary.inventory.totalStockTransfers}
        subtitle="Receipts & Deliveries"
      />}

      {has("finance") && <StatCard
        title="Expenses"
        value={formatCurrency(summary.finance.totalExpenses)}
        subtitle={`${formatCurrency(
          summary.finance.expensesCurrentMonth
        )} this month`}
      />}
    </div>
  );
}
