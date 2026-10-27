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
import { AlertTriangle, Info, Printer } from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { StatementSection, TotalBar, formatInr } from "@/components/finance/StatementSection";

export default function BalanceSheetPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // The API chooses today's calendar date in the organization timezone on the
  // initial load; browser UTC/local dates can differ near midnight.
  const [date, setDate] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      const res = await cachedFetch(
        `/api/finance/reports/balance-sheet${query}`,
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "load failed");
      setData(json);
      if (!date && json.asOfDate) setDate(json.asOfDate);
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

    const reportDate = data.asOfDate || date;
    const timeZone = data.timeZone || "UTC";

    const assetAccounts = Object.values(data.asset?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );
    const hasAssetBreakdown = Boolean(data.asset?.current || data.asset?.nonCurrent);
    const assetCurrentAccounts = Object.values(data.asset?.current?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );
    const assetNonCurrentAccounts = Object.values(data.asset?.nonCurrent?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );

    const liabilityAccounts = Object.values(data.liability?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );
    const hasLiabilityBreakdown = Boolean(data.liability?.current || data.liability?.nonCurrent);
    const liabilityCurrentAccounts = Object.values(data.liability?.current?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );
    const liabilityNonCurrentAccounts = Object.values(data.liability?.nonCurrent?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );

    const equityAccounts = Object.values(data.equity?.accounts || {}).sort((a: any, b: any) =>
      String(a.code || "").localeCompare(String(b.code || ""))
    );

    const totalAssets = data.asset?.total ?? 0;
    const totalLiabilities = data.liability?.total ?? 0;
    const totalEquity = data.equity?.total ?? 0;
    const liabilitiesAndEquity = totalLiabilities + totalEquity;
    const isBalanced = Math.abs(totalAssets - liabilitiesAndEquity) <= 0.01;

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
        <title>Balance Sheet - ${reportDate}</title>
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
          <!-- HEADER -->
          <div class="border-b-2 border-black pb-4">
            <h1 class="text-3xl font-black uppercase tracking-tight mb-2">Balance Sheet</h1>
            <div class="flex justify-between items-end">
              <div>
                <p class="text-sm font-semibold text-gray-800">Organization: Aupulens</p>
                <p class="text-xs text-gray-500">Generated: ${new Date().toLocaleString()}</p>
                ${data.latestIncludedPostingDate ? `<p class="text-xs text-gray-500">Latest Posted Entry: ${data.latestIncludedPostingDate}</p>` : ""}
              </div>
              <div class="text-right">
                <p class="text-lg font-bold">As of: ${reportDate}</p>
                <p class="text-xs text-gray-500">Timezone: ${timeZone}</p>
              </div>
            </div>
          </div>

          <!-- SUMMARY METRICS -->
          <div class="grid grid-cols-3 gap-4 border border-gray-300 p-4 bg-gray-50 text-center">
            <div>
              <p class="text-xs uppercase font-bold text-gray-500">Total Assets</p>
              <p class="text-xl font-black text-gray-900 mt-1">${formatInr(totalAssets)}</p>
            </div>
            <div>
              <p class="text-xs uppercase font-bold text-gray-500">Total Liabilities</p>
              <p class="text-xl font-black text-gray-900 mt-1">${formatInr(totalLiabilities)}</p>
            </div>
            <div>
              <p class="text-xs uppercase font-bold text-gray-500">Total Equity</p>
              <p class="text-xl font-black text-gray-900 mt-1">${formatInr(totalEquity)}</p>
            </div>
          </div>

          <!-- ASSETS SECTION -->
          <div>
            <div class="flex justify-between items-baseline border-b-2 border-black pb-2 mb-2">
              <h3 class="text-lg font-bold uppercase tracking-wider">Assets</h3>
              <span class="text-base font-bold tabular-nums">${formatInr(totalAssets)}</span>
            </div>
            ${hasAssetBreakdown ? `
              <div class="mb-4">
                <div class="flex justify-between items-baseline bg-gray-50 border-b border-gray-300 py-1.5 px-4 font-bold text-xs uppercase text-gray-700">
                  <span>Current Assets (Under 12 months)</span>
                  <span>${formatInr(data.asset?.current?.total ?? 0)}</span>
                </div>
                <table class="w-full text-left mb-2">
                  <tbody>
                    ${renderRows(assetCurrentAccounts, "No current asset accounts with balances")}
                  </tbody>
                </table>
              </div>
              <div class="mb-4">
                <div class="flex justify-between items-baseline bg-gray-50 border-b border-gray-300 py-1.5 px-4 font-bold text-xs uppercase text-gray-700">
                  <span>Non-Current Assets (Fixed Assets)</span>
                  <span>${formatInr(data.asset?.nonCurrent?.total ?? 0)}</span>
                </div>
                <table class="w-full text-left mb-2">
                  <tbody>
                    ${renderRows(assetNonCurrentAccounts, "No non-current / fixed asset accounts with balances")}
                  </tbody>
                </table>
              </div>
            ` : `
              <table class="w-full text-left">
                <thead>
                  <tr class="bg-gray-100 border-b border-black text-xs uppercase font-bold text-gray-700">
                    <th class="py-2 px-4">Description</th>
                    <th class="py-2 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderRows(assetAccounts, "No asset accounts with balances")}
                </tbody>
              </table>
            `}
            <div class="flex justify-between items-center bg-gray-100 font-bold border-t-2 border-black py-3 px-4 uppercase text-sm">
              <span>Total Assets</span>
              <span class="text-base tabular-nums font-black">${formatInr(totalAssets)}</span>
            </div>
          </div>

          <!-- LIABILITIES SECTION -->
          <div>
            <div class="flex justify-between items-baseline border-b-2 border-black pb-2 mb-2">
              <h3 class="text-lg font-bold uppercase tracking-wider">Liabilities</h3>
              <span class="text-base font-bold tabular-nums">${formatInr(totalLiabilities)}</span>
            </div>
            ${hasLiabilityBreakdown ? `
              <div class="mb-4">
                <div class="flex justify-between items-baseline bg-gray-50 border-b border-gray-300 py-1.5 px-4 font-bold text-xs uppercase text-gray-700">
                  <span>Current Liabilities (Obligations payable up to 12 months)</span>
                  <span>${formatInr(data.liability?.current?.total ?? 0)}</span>
                </div>
                <table class="w-full text-left mb-2">
                  <tbody>
                    ${renderRows(liabilityCurrentAccounts, "No current liability accounts with balances")}
                  </tbody>
                </table>
              </div>
              <div class="mb-4">
                <div class="flex justify-between items-baseline bg-gray-50 border-b border-gray-300 py-1.5 px-4 font-bold text-xs uppercase text-gray-700">
                  <span>Non-Current Liabilities (Payable beyond 12 months)</span>
                  <span>${formatInr(data.liability?.nonCurrent?.total ?? 0)}</span>
                </div>
                <table class="w-full text-left mb-2">
                  <tbody>
                    ${renderRows(liabilityNonCurrentAccounts, "No non-current liability accounts with balances")}
                  </tbody>
                </table>
              </div>
            ` : `
              <table class="w-full text-left">
                <thead>
                  <tr class="bg-gray-100 border-b border-black text-xs uppercase font-bold text-gray-700">
                    <th class="py-2 px-4">Description</th>
                    <th class="py-2 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderRows(liabilityAccounts, "No liability accounts with balances")}
                </tbody>
              </table>
            `}
            <div class="flex justify-between items-center bg-gray-100 font-bold border-t-2 border-black py-3 px-4 uppercase text-sm">
              <span>Total Liabilities</span>
              <span class="text-base tabular-nums font-black">${formatInr(totalLiabilities)}</span>
            </div>
          </div>

          <!-- EQUITY SECTION -->
          <div>
            <div class="flex justify-between items-baseline border-b-2 border-black pb-2 mb-2">
              <h3 class="text-lg font-bold uppercase tracking-wider">Equity</h3>
              <span class="text-base font-bold tabular-nums">${formatInr(totalEquity)}</span>
            </div>
            <table class="w-full text-left">
              <thead>
                <tr class="bg-gray-100 border-b border-black text-xs uppercase font-bold text-gray-700">
                  <th class="py-2 px-4">Description</th>
                  <th class="py-2 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${renderRows(equityAccounts, "No equity accounts with balances")}
                <tr class="bg-gray-100 font-bold border-t-2 border-black">
                  <td class="py-3 px-4 uppercase text-sm">Total Equity</td>
                  <td class="py-3 px-4 text-right text-base tabular-nums font-black">${formatInr(totalEquity)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- BALANCE CHECK -->
          <div class="border-2 border-black p-4 bg-gray-50">
            <div class="flex justify-between items-center py-1">
              <span class="font-bold text-sm uppercase tracking-wider">Total Liabilities + Equity</span>
              <span class="font-black text-lg tabular-nums">${formatInr(liabilitiesAndEquity)}</span>
            </div>
            <div class="border-t border-gray-300 mt-2 pt-2 flex justify-between items-center text-xs">
              <span class="font-mono uppercase font-bold ${isBalanced ? "text-green-700" : "text-red-700"}">
                ${isBalanced ? "✓ Balanced — Assets equal Liabilities + Equity" : `⚠ Out of Balance by ${formatInr(Math.abs(totalAssets - liabilitiesAndEquity))}`}
              </span>
              <span class="text-gray-500 italic">Accounting Equation: Assets = Liabilities + Equity</span>
            </div>
          </div>

          <div class="pt-8 text-center text-xs text-gray-400">
            <p>End of Report — Generated by Aupulens ERP</p>
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
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={load}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 min-w-0 max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl md:text-[56px] font-black tracking-tighter text-primary break-words">
              Balance Sheet
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Snapshot of posted assets, liabilities, and equity as of the selected organization date
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-44 rounded-none"
            />
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
            <div className="text-xs text-muted-foreground" aria-live="polite">
              As of {data.asOfDate} ({data.timeZone}). {data.latestIncludedPostingDate
                ? `Latest included posted journal: ${data.latestIncludedPostingDate}.`
                : "No posted journal entries are available through this date."}
              {data.postedEntriesIncluded > 0 && data.latestIncludedPostingDate && data.latestIncludedPostingDate < data.asOfDate
                ? " No later posted entries were found, so the displayed balances reflect the latest ledger activity available."
                : ""}
            </div>
            <div className="grid grid-cols-1 gap-px border border-border/40 bg-border/40 md:grid-cols-3">
              <StatCard title="Total Assets" value={formatInr(data.asset?.total)} className="rounded-none bg-background" />
              <StatCard title="Total Liabilities" value={formatInr(data.liability?.total)} className="rounded-none bg-background" />
              <StatCard title="Total Equity" value={formatInr(data.equity?.total)} className="rounded-none bg-background" />
            </div>

            {Array.isArray(data.reviewItems) && data.reviewItems.length > 0 && (
              <Card className="rounded-none border-amber-500/40 bg-amber-500/5 shadow-none">
                <CardContent className="space-y-3 p-5">
                  {(["warning", "info"] as const).map((severity) => {
                    const items = data.reviewItems.filter((item: { severity: string }) => item.severity === severity);
                    if (items.length === 0) return null;
                    const isWarning = severity === "warning";
                    return (
                      <section key={severity} aria-label={isWarning ? "Accounting warnings" : "Accounting information"}>
                        <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${isWarning ? "text-amber-500" : "text-sky-400"}`}>
                          {isWarning ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                          {isWarning ? "Warnings — review before financial sign-off" : "Informational notices"}
                        </div>
                        <ul className="space-y-2">
                          {items.map((item: { code: string; severity: "warning" | "info"; message: string }) => (
                            <li key={`${item.severity}-${item.code}`} className="flex gap-2 text-sm text-muted-foreground">
                              {isWarning
                                ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                : <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
                              <span>{item.message}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="h-fit rounded-none border-border/40 bg-background shadow-none">
                <CardContent className="space-y-8 p-6 sm:p-8">
                  <StatementSection
                    title="Assets"
                    section={data.asset}
                    subtitles={{
                      currentTitle: "Current Assets",
                      currentDesc: "Cash, bank balances, receivables, inventory & assets convertible within 12 months",
                      nonCurrentTitle: "Non-Current Assets (Fixed Assets)",
                      nonCurrentDesc: "Property, plant, machinery, equipment & capital assets held beyond 12 months",
                    }}
                  />
                  <TotalBar label="Total Assets" value={data.asset?.total ?? 0} />
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-none border-border/40 bg-background shadow-none">
                  <CardContent className="space-y-8 p-6 sm:p-8">
                    <StatementSection
                      title="Liabilities"
                      section={data.liability}
                      tone="negative"
                      subtitles={{
                        currentTitle: "Current Liabilities",
                        currentDesc: "Obligations payable up to or under 12 months (trade payables, taxes, customer advances)",
                        nonCurrentTitle: "Non-Current Liabilities",
                        nonCurrentDesc: "Long-term obligations payable beyond 12 months (long-term loans, borrowings)",
                      }}
                    />
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
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border px-4 sm:px-6 py-4 sm:py-5 ${
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
