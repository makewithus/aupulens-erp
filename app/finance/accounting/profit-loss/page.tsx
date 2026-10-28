"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Printer } from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { StatementSection, TotalBar, formatInr } from "@/components/finance/StatementSection";

export default function ProfitLossPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<
    { from: Date; to: Date } | undefined
  >(undefined);

  const load = useCallback(async () => {
    try {
      let url = "/api/finance/reports/p-l";
      if (dateRange?.from && dateRange?.to) {
        url += `?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
      }
      const res = await cachedFetch(url);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "load failed");
      setData(json);
    } catch (error) {
      setData(null);
      toast.error("We couldn't load the Profit & Loss statement. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handlePrint = () => {
    if (!data) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print");
      return;
    }

    const totalIncome = data.income?.total || 0;
    const totalExpenses = data.expense?.total || 0;
    const netProfit = data.netProfit || 0;

    // Format date range for title
    const dateStr =
      dateRange?.from && dateRange?.to
        ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
        : "All Time";

    const incomeAccounts = Object.values(data.income?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );
    const expenseAccounts = Object.values(data.expense?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );

    const renderRows = (accounts: any[], emptyLabel: string) => {
      if (accounts.length === 0) {
        return `
          <tr class="border-b border-gray-200">
            <td colspan="2" class="py-3 px-4 text-sm text-gray-500 italic text-center">${emptyLabel}</td>
          </tr>
        `;
      }
      return accounts
        .map(
          (acc: any) => `
          <tr class="border-b border-gray-200">
            <td class="py-2.5 px-4 text-sm text-gray-900">
              <span class="font-medium">${acc.name}</span>
              ${acc.code ? `<span class="ml-2 font-mono text-xs text-gray-500">(${acc.code})</span>` : ""}
            </td>
            <td class="py-2.5 px-4 text-right text-sm font-semibold tabular-nums text-gray-900">
              ${formatInr(acc.amount)}
            </td>
          </tr>
        `
        )
        .join("");
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Profit & Loss - ${dateStr}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px 16px; }
        </style>
      </head>
      <body class="p-8 bg-white text-black font-sans">
        <div class="max-w-4xl mx-auto space-y-8">
          <div class="border-b-2 border-black pb-4">
            <h1 class="text-3xl font-black uppercase tracking-tight mb-2">Profit & Loss Statement</h1>
            <div class="flex justify-between items-end">
              <div>
                <p class="text-sm font-semibold text-gray-800">Organization: Aupulens</p>
                <p class="text-xs text-gray-500">Generated: ${new Date().toLocaleString()}</p>
              </div>
              <p class="text-lg font-bold">Period: ${dateStr}</p>
            </div>
          </div>

          <!-- SUMMARY CARDS -->
          <div class="grid grid-cols-3 gap-4 border border-gray-300 p-4 bg-gray-50 text-center">
            <div>
              <p class="text-xs font-bold uppercase text-gray-500">Total Income</p>
              <p class="text-xl font-black text-emerald-700 mt-1">${formatInr(totalIncome)}</p>
            </div>
            <div>
              <p class="text-xs font-bold uppercase text-gray-500">Total Expenses</p>
              <p class="text-xl font-black text-red-700 mt-1">${formatInr(totalExpenses)}</p>
            </div>
            <div>
              <p class="text-xs font-bold uppercase text-gray-500">Net Profit</p>
              <p class="text-xl font-black ${netProfit >= 0 ? "text-emerald-700" : "text-red-700"} mt-1">${formatInr(netProfit)}</p>
            </div>
          </div>

          <!-- INCOME -->
          <div>
            <div class="flex justify-between items-baseline border-b-2 border-black pb-2 mb-2">
              <h3 class="text-lg font-bold uppercase tracking-wider">Income</h3>
              <span class="text-base font-bold tabular-nums text-emerald-700">${formatInr(totalIncome)}</span>
            </div>
            <table class="w-full text-left">
              <thead>
                <tr class="bg-gray-100 border-b border-black text-xs uppercase font-bold text-gray-700">
                  <th class="py-2 px-4">Description</th>
                  <th class="py-2 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${renderRows(incomeAccounts, "No income accounts with balances")}
                <tr class="bg-gray-100 font-bold border-t-2 border-black">
                  <td class="py-3 px-4 uppercase text-sm">Total Income</td>
                  <td class="py-3 px-4 text-right text-base tabular-nums font-black text-emerald-700">${formatInr(totalIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- EXPENSES -->
          <div>
            <div class="flex justify-between items-baseline border-b-2 border-black pb-2 mb-2">
              <h3 class="text-lg font-bold uppercase tracking-wider">Expenses</h3>
              <span class="text-base font-bold tabular-nums text-red-700">${formatInr(totalExpenses)}</span>
            </div>
            <table class="w-full text-left">
              <thead>
                <tr class="bg-gray-100 border-b border-black text-xs uppercase font-bold text-gray-700">
                  <th class="py-2 px-4">Description</th>
                  <th class="py-2 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${renderRows(expenseAccounts, "No expense accounts with balances")}
                <tr class="bg-gray-100 font-bold border-t-2 border-black">
                  <td class="py-3 px-4 uppercase text-sm">Total Expenses</td>
                  <td class="py-3 px-4 text-right text-base tabular-nums font-black text-red-700">${formatInr(totalExpenses)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- NET PROFIT -->
          <div class="border-2 border-black p-4 bg-gray-50 flex justify-between items-center">
            <span class="text-lg font-bold uppercase tracking-wider">Net Profit / (Loss)</span>
            <span class="text-xl font-black tabular-nums ${netProfit >= 0 ? "text-emerald-700" : "text-red-700"}">${formatInr(netProfit)}</span>
          </div>

          <div class="pt-8 text-center text-xs text-gray-400">
            <p>End of Report — Generated by Aupulens ERP</p>
          </div>

          <div class="mt-12 text-center text-sm text-muted-foreground">
            <p>End of Report</p>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.focus();
            setTimeout(function() {
              window.print();
            }, 500);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Profit & Loss"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Profit & Loss" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={load}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 min-w-0 max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl md:text-[56px] font-black tracking-tighter text-primary break-words">
              Profit & Loss
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Detailed summary of income and expenses
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <DateRangePicker onUpdate={(range) => setDateRange(range)} />
            <Button
              variant="outline"
              className="rounded-none w-full sm:w-auto"
              onClick={handlePrint}
              disabled={loading || !data}
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6">
            <Skeleton className="h-[120px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        ) : !data ? (
          <Card className="rounded-none border-border/40 bg-background shadow-none">
            <CardContent className="py-16 text-center font-mono text-xs text-muted-foreground">
              The statement couldn&apos;t be loaded. Use refresh to try again.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-px border border-border/40 bg-border/40 md:grid-cols-3">
              <StatCard title="Total Income" value={formatInr(data.income?.total)} className="rounded-none bg-background" />
              <StatCard title="Total Expenses" value={formatInr(data.expense?.total)} className="rounded-none bg-background" />
              <StatCard
                title={(data.netProfit ?? 0) >= 0 ? "Net Profit" : "Net Loss"}
                value={formatInr(data.netProfit)}
                className="rounded-none bg-background"
              />
            </div>

            <Card className="rounded-none border-border/40 bg-background shadow-none">
              <CardContent className="space-y-10 p-6 sm:p-8">
                <StatementSection title="Income" section={data.income} tone="positive" />
                <StatementSection title="Expenses" section={data.expense} tone="negative" />
                <TotalBar
                  label={(data.netProfit ?? 0) >= 0 ? "Net Profit" : "Net Loss"}
                  value={data.netProfit ?? 0}
                  tone={(data.netProfit ?? 0) >= 0 ? "positive" : "negative"}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
