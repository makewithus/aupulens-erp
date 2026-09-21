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
      setLoading(true);
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

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Profit & Loss - ${dateStr}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body class="p-8 bg-white text-black">
        <div class="max-w-4xl mx-auto">
          <div class="mb-8 border-b-2 border-black pb-4">
            <h1 class="text-3xl font-bold uppercase mb-2">Profit & Loss Statement</h1>
            <div class="flex justify-between items-end">
              <div>
                <p class="text-sm font-medium">Organization: Aupulens</p>
                <p class="text-sm text-muted-foreground">Generated: ${new Date().toLocaleString()}</p>
              </div>
              <p class="text-lg font-bold">Period: ${dateStr}</p>
            </div>
          </div>

          <!-- SUMMARY CARDS (Simulated) -->
          <div class="grid grid-cols-3 gap-4 mb-8">
            <div class="p-4 bg-muted border border-border">
              <p class="text-sm font-medium text-muted-foreground uppercase">Total Income</p>
              <p class="text-xl font-bold text-green-700">₹${totalIncome.toLocaleString()}</p>
            </div>
            <div class="p-4 bg-muted border border-border">
              <p class="text-sm font-medium text-muted-foreground uppercase">Total Expenses</p>
              <p class="text-xl font-bold text-red-700">₹${totalExpenses.toLocaleString()}</p>
            </div>
            <div class="p-4 bg-muted border border-border">
              <p class="text-sm font-medium text-muted-foreground uppercase">Net Profit</p>
              <p class="text-xl font-bold ${netProfit >= 0 ? "text-green-700" : "text-red-700"}">₹${netProfit.toLocaleString()}</p>
            </div>
          </div>

          <!-- INCOME -->
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-4 uppercase border-b border-black pb-1">Income</h3>
            <table class="w-full text-left mb-4">
              <thead>
                <tr class="bg-accent border-b border-black">
                  <th class="py-2 px-4 font-bold">Description</th>
                  <th class="py-2 px-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-border">
                  <td class="py-2 px-4">Revenue from Sales</td>
                  <td class="py-2 px-4 text-right">₹${totalIncome.toLocaleString()}</td>
                </tr>
                <tr class="bg-muted font-bold">
                  <td class="py-2 px-4">Total Income</td>
                  <td class="py-2 px-4 text-right">₹${totalIncome.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- EXPENSES -->
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-4 uppercase border-b border-black pb-1">Expenses</h3>
            <table class="w-full text-left mb-4">
              <thead>
                <tr class="bg-accent border-b border-black">
                  <th class="py-2 px-4 font-bold">Description</th>
                  <th class="py-2 px-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-border">
                  <td class="py-2 px-4">Cost of Goods Sold / Operating Expenses</td>
                  <td class="py-2 px-4 text-right">₹${totalExpenses.toLocaleString()}</td>
                </tr>
                <tr class="bg-muted font-bold">
                  <td class="py-2 px-4">Total Expenses</td>
                  <td class="py-2 px-4 text-right">₹${totalExpenses.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- NET PROFIT -->
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-4 uppercase border-b border-black pb-1">Net Summary</h3>
            <table class="w-full text-left mb-4">
              <tbody>
                <tr class="bg-accent font-bold border-t-2 border-black">
                  <td class="py-3 px-4 text-lg">Net Profit / (Loss)</td>
                  <td class="py-3 px-4 text-right text-lg">₹${netProfit.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
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
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Profit & Loss
            </h1>
            <p className="text-sm text-muted-foreground">
              Detailed summary of income and expenses
            </p>
          </div>
          <div className="flex items-center gap-2">
                        <DateRangePicker onUpdate={(range) => setDateRange(range)} />
            <Button
              variant="outline"
              className="rounded-none"
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
