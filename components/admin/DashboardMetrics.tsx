"use client";

import { StatCard } from "./StatCard";

interface DashboardMetricsProps {
  summary: any;
  formatCurrency: (value: number) => string;
}

export function DashboardMetrics({
  summary,
  formatCurrency,
}: DashboardMetricsProps) {
  return (
    <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Net Income"
        value={formatCurrency(summary.finance.netIncome)}
        subtitle="Revenue - Expenses"
      />

      <StatCard
        title="Transactions"
        value={summary.finance.totalTransactions}
        subtitle="Payment Records"
      />

      <StatCard
        title="Stock Transfers"
        value={summary.inventory.totalStockTransfers}
        subtitle="Receipts & Deliveries"
      />

      <StatCard
        title="Expenses"
        value={formatCurrency(summary.finance.totalExpenses)}
        subtitle={`${formatCurrency(
          summary.finance.expensesCurrentMonth
        )} this month`}
      />
    </div>
  );
}