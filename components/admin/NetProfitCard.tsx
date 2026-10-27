"use client";

import { Card, CardContent } from "@/components/ui/card";

interface NetProfitCardProps {
  summary: any;
  formatCurrency: (value: number) => string;
}

export function NetProfitCard({
  summary,
  formatCurrency,
}: NetProfitCardProps) {
  const profitAvailable = summary.finance.profitAvailable === true;
  const isProfit = profitAvailable && summary.finance.netIncome >= 0;

  const revenue = summary.finance.totalRevenue;
  const expenses = summary.finance.totalExpenses;
  const netIncome = summary.finance.netIncome;

  const margin =
    profitAvailable && summary.finance.hasExpenseActivity && revenue > 0 ? ((netIncome / revenue) * 100).toFixed(1) : null;

  return (
    <Card className="overflow-hidden border-0 shadow-none">
      {/* Header */}
      <div
        className={`border-b border-border/40 px-8 py-6 ${
          !profitAvailable ? "bg-muted/20" : isProfit ? "bg-emerald-500/5" : "bg-rose-500/5"
        }`}
      >
        <div className="flex items-center gap-3">

          <div>
            <h2 className="text-xl font-medium tracking-[-0.04em]">
              Net Income · Posted
            </h2>
          </div>
        </div>
      </div>

      <CardContent className="p-4 sm:p-10">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          All time · Posted accounting entries · Same basis as Finance P&amp;L
        </p>
        <div className="text-center">
          <p
            className={`font-sans tabular-nums text-3xl sm:text-[64px] font-bold leading-none tracking-tighter ${
              !profitAvailable ? "text-muted-foreground" : isProfit ? "text-emerald-500" : "text-rose-500"
            }`}
          >
            {profitAvailable ? formatCurrency(netIncome) : "Review ledger"}
          </p>

          <p className="mt-3 text-sm uppercase tracking-[0.18em] text-muted-foreground">
            {profitAvailable ? `${summary.finance.hasExpenseActivity ? isProfit ? "Profit" : "Loss" : "Posted result"} · All time` : "Ledger needs review"}
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

            <h3 className="mt-2 font-sans tabular-nums text-3xl font-bold tracking-tighter text-emerald-500">
              {formatCurrency(revenue)}
            </h3>
          </div>

          <div className="border border-rose-500/20 bg-rose-500/5 p-6">
            <p className="font-mono text-[11px] text-rose-500">
              Expenses
            </p>

            <h3 className="mt-2 font-sans tabular-nums text-3xl font-bold tracking-tighter text-rose-500">
              {formatCurrency(expenses)}
            </h3>
          </div>
        </div>

        {profitAvailable && summary.finance.profitNote && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {summary.finance.profitNote}
          </p>
        )}

        {!profitAvailable && (
          <div className="mt-8 border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-600">
              {summary.finance.profitUnavailableReason || "Review the posted ledger in Finance."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
