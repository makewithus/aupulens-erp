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
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {has("finance") && <StatCard
        title="Net Income · Posted"
        value={summary.finance.profitAvailable ? formatCurrency(summary.finance.netIncome) : "Review ledger"}
        subtitle={summary.finance.profitAvailable ? "All time · Posted revenue − expenses" : "Ledger needs review"}
      />}

      {has("finance") && <StatCard
        title="Transactions"
        value={summary.finance.totalTransactions}
        subtitle={`Posted journals · ${summary.finance.totalPayments} paid payment records`}
      />}

      {has("inventory") && <StatCard
        title="Stock Activity"
        value={summary.inventory.totalStockTransfers}
        subtitle="Transfer, move & stock ledger records"
      />}

      {has("finance") && <StatCard
        title="Expenses · Posted"
        value={formatCurrency(summary.finance.totalExpenses)}
        subtitle={`${formatCurrency(
          summary.finance.expensesCurrentMonth
        )} this month`}
      />}
    </div>
  );
}
