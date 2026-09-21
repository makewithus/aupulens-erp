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
import { Input } from "@/components/ui/input";
import { Printer } from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { StatementSection, TotalBar, formatInr } from "@/components/finance/StatementSection";

export default function BalanceSheetPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch(
        `/api/finance/reports/balance-sheet?date=${date}`,
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "load failed");
      setData(json);
    } catch (error) {
      setData(null);
      toast.error("We couldn't load the Balance Sheet. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    
    if (status === "authenticated") load();
  }, [status, router, load]);

  const liabilitiesPlusEquity = (data?.liability?.total ?? 0) + (data?.equity?.total ?? 0);
  const balanced = Math.abs((data?.asset?.total ?? 0) - liabilitiesPlusEquity) <= 0.01;

  const handlePrint = () => {
    if (!data) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print");
      return;
    }

    const receivables = data.asset?.accounts?.receivable?.amount || 0;
    const inventoryValue = data.asset?.accounts?.inventory?.amount || 0;
    const payables = data.liability?.accounts?.payable?.amount || 0;
    const totalCurrentAssets = data.asset?.total || 0;
    const totalCurrentLiabilities = data.liability?.total || 0;
    const equity = data.equity?.total || 0;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Balance Sheet - ${date}</title>
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
            <h1 class="text-3xl font-bold uppercase mb-2">Balance Sheet</h1>
            <div class="flex justify-between items-end">
              <div>
                <p class="text-sm font-medium">Organization: Aupulens</p>
                <p class="text-sm text-muted-foreground">Generated: ${new Date().toLocaleString()}</p>
              </div>
              <p class="text-lg font-bold">As of: ${new Date(date).toLocaleDateString()}</p>
            </div>
          </div>

          <!-- ASSETS -->
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-4 uppercase border-b border-black pb-1">Assets</h3>
            <table class="w-full text-left mb-4">
              <thead>
                <tr class="bg-accent border-b border-black">
                  <th class="py-2 px-4 font-bold">Description</th>
                  <th class="py-2 px-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-border">
                  <td class="py-2 px-4">Accounts Receivable</td>
                  <td class="py-2 px-4 text-right">₹${receivables.toLocaleString()}</td>
                </tr>
                <tr class="border-b border-border">
                  <td class="py-2 px-4">Inventory</td>
                  <td class="py-2 px-4 text-right">₹${inventoryValue.toLocaleString()}</td>
                </tr>
                <tr class="bg-muted font-bold">
                  <td class="py-2 px-4">Total Current Assets</td>
                  <td class="py-2 px-4 text-right">₹${totalCurrentAssets.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- LIABILITIES -->
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-4 uppercase border-b border-black pb-1">Liabilities</h3>
            <table class="w-full text-left mb-4">
              <thead>
                <tr class="bg-accent border-b border-black">
                  <th class="py-2 px-4 font-bold">Description</th>
                  <th class="py-2 px-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-border">
                  <td class="py-2 px-4">Accounts Payable</td>
                  <td class="py-2 px-4 text-right">₹${payables.toLocaleString()}</td>
                </tr>
                <tr class="bg-muted font-bold">
                  <td class="py-2 px-4">Total Current Liabilities</td>
                  <td class="py-2 px-4 text-right">₹${totalCurrentLiabilities.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- EQUITY -->
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-4 uppercase border-b border-black pb-1">Equity</h3>
            <table class="w-full text-left mb-4">
              <thead>
                <tr class="bg-accent border-b border-black">
                  <th class="py-2 px-4 font-bold">Description</th>
                  <th class="py-2 px-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="bg-muted font-bold">
                  <td class="py-2 px-4">Total Equity (Assets - Liabilities)</td>
                  <td class="py-2 px-4 text-right">₹${equity.toLocaleString()}</td>
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
      pageName="Balance Sheet"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Balance Sheet" },
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
              Balance Sheet
            </h1>
            <p className="text-sm text-muted-foreground">
              Snapshot of assets, liabilities, and equity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44 rounded-none"
            />
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
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : !data ? (
          <Card className="rounded-none border-border/40 bg-background shadow-none">
            <CardContent className="py-16 text-center font-mono text-xs text-muted-foreground">
              The balance sheet couldn&apos;t be loaded. Use refresh to try again.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-px border border-border/40 bg-border/40 md:grid-cols-3">
              <StatCard title="Total Assets" value={formatInr(data.asset?.total)} className="rounded-none bg-background" />
              <StatCard title="Total Liabilities" value={formatInr(data.liability?.total)} className="rounded-none bg-background" />
              <StatCard title="Total Equity" value={formatInr(data.equity?.total)} className="rounded-none bg-background" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="h-fit rounded-none border-border/40 bg-background shadow-none">
                <CardContent className="space-y-8 p-6 sm:p-8">
                  <StatementSection title="Assets" section={data.asset} />
                  <TotalBar label="Total Assets" value={data.asset?.total ?? 0} />
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-none border-border/40 bg-background shadow-none">
                  <CardContent className="space-y-8 p-6 sm:p-8">
                    <StatementSection title="Liabilities" section={data.liability} tone="negative" />
                    <TotalBar label="Total Liabilities" value={data.liability?.total ?? 0} />
                  </CardContent>
                </Card>
                <Card className="rounded-none border-border/40 bg-background shadow-none">
                  <CardContent className="space-y-8 p-6 sm:p-8">
                    <StatementSection title="Equity" section={data.equity} tone="positive" />
                    <TotalBar label="Total Equity" value={data.equity?.total ?? 0} />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Accounting-equation check: Assets = Liabilities + Equity */}
            <div
              className={`flex items-center justify-between border px-6 py-5 ${
                balanced ? "border-emerald-500/40" : "border-red-500/50"
              }`}
            >
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Liabilities + Equity</p>
                <p className="mt-1 font-sans text-2xl font-bold tabular-nums">{formatInr(liabilitiesPlusEquity)}</p>
              </div>
              <p className={`font-mono text-xs uppercase tracking-[0.18em] ${balanced ? "text-emerald-500" : "text-red-500"}`}>
                {balanced
                  ? "Balanced — Assets equal Liabilities + Equity"
                  : `Out of balance by ${formatInr(Math.abs((data.asset?.total ?? 0) - liabilitiesPlusEquity))}`}
              </p>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
