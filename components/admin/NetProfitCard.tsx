"use client";

import { Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface NetProfitCardProps {
  summary: any;
  formatCurrency: (value: number) => string;
}

export function NetProfitCard({
  summary,
  formatCurrency,
}: NetProfitCardProps) {
  const isProfit = summary.finance.netIncome >= 0;

  const revenue = summary.finance.totalRevenue;
  const expenses = summary.finance.totalExpenses;
  const netIncome = summary.finance.netIncome;

  const margin =
    revenue > 0 ? ((netIncome / revenue) * 100).toFixed(1) : null;

  return (
    <Card className="overflow-hidden border-0 shadow-none">
      {/* Header */}
      <div
        className={`border-b border-border/40 px-8 py-6 ${
          isProfit ? "bg-emerald-500/5" : "bg-rose-500/5"
        }`}
      >
        <div className="flex items-center gap-3">

          <div>
            <h2 className="text-xl font-medium tracking-[-0.04em]">
              Net Profit / Loss
            </h2>
          </div>
        </div>
      </div>

      <CardContent className="p-10">
        <div className="text-center">
          <p
            className={`text-[64px] font-black leading-none tracking-tighter ${
              isProfit ? "text-emerald-500" : "text-rose-500"
            }`}
          >
            {formatCurrency(netIncome)}
          </p>

          <p className="mt-3 text-sm uppercase tracking-[0.18em] text-muted-foreground">
            {isProfit ? "Profit" : "Loss"} this period
          </p>

          {margin && (
            <p className="mt-2 text-sm text-muted-foreground">
              {margin}% profit margin
            </p>
          )}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="border border-emerald-500/20 bg-emerald-500/5 p-6">
            <p className="font-mono text-[11px] text-emerald-500">
              Revenue
            </p>

            <h3 className="mt-2 text-3xl font-black tracking-tighter text-emerald-500">
              {formatCurrency(revenue)}
            </h3>
          </div>

          <div className="border border-rose-500/20 bg-rose-500/5 p-6">
            <p className="font-mono text-[11px] text-rose-500">
              Expenses
            </p>

            <h3 className="mt-2 text-3xl font-black tracking-tighter text-rose-500">
              {formatCurrency(expenses)}
            </h3>
          </div>
        </div>

        {/* Empty State */}
        {revenue === 0 && expenses === 0 && (
          <div className="mt-8 border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-600">
              No financial activity has been recorded yet.
            </p>
          </div>
        )}

        {/* Revenue Missing */}
        {revenue === 0 && expenses > 0 && (
          <div className="mt-8 border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-600">
              Expenses exist, but no revenue has been recorded.
            </p>
          </div>
        )}

        {/* Expense Missing */}
        {expenses === 0 && revenue > 0 && (
          <div className="mt-8 border border-blue-500/20 bg-blue-500/10 px-4 py-3">
            <p className="text-sm text-blue-600">
              Revenue has been generated. No expenses have been recorded yet.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}