"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Building2, Landmark, Wallet, Printer } from "lucide-react";

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
      const res = await fetch(
        `/api/finance/reports/balance-sheet?date=${date}`,
      );
      const json = await res.json();
      setData(json);
    } catch (error) {
      toast.error("Failed to load Balance Sheet");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
    if (status === "authenticated") load();
  }, [status, router, load]);

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
                <p class="text-sm text-gray-600">Generated: ${new Date().toLocaleString()}</p>
              </div>
              <p class="text-lg font-bold">As of: ${new Date(date).toLocaleDateString()}</p>
            </div>
          </div>

          <!-- ASSETS -->
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-4 uppercase border-b border-black pb-1">Assets</h3>
            <table class="w-full text-left mb-4">
              <thead>
                <tr class="bg-gray-100 border-b border-black">
                  <th class="py-2 px-4 font-bold">Description</th>
                  <th class="py-2 px-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-200">
                  <td class="py-2 px-4">Accounts Receivable</td>
                  <td class="py-2 px-4 text-right">₹${receivables.toLocaleString()}</td>
                </tr>
                <tr class="border-b border-gray-200">
                  <td class="py-2 px-4">Inventory</td>
                  <td class="py-2 px-4 text-right">₹${inventoryValue.toLocaleString()}</td>
                </tr>
                <tr class="bg-gray-50 font-bold">
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
                <tr class="bg-gray-100 border-b border-black">
                  <th class="py-2 px-4 font-bold">Description</th>
                  <th class="py-2 px-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-200">
                  <td class="py-2 px-4">Accounts Payable</td>
                  <td class="py-2 px-4 text-right">₹${payables.toLocaleString()}</td>
                </tr>
                <tr class="bg-gray-50 font-bold">
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
                <tr class="bg-gray-100 border-b border-black">
                  <th class="py-2 px-4 font-bold">Description</th>
                  <th class="py-2 px-4 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr class="bg-gray-50 font-bold">
                  <td class="py-2 px-4">Total Equity (Assets - Liabilities)</td>
                  <td class="py-2 px-4 text-right">₹${equity.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-12 text-center text-sm text-gray-500">
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

  const renderSection = (title: string, sectionData: any) => (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="text-xl font-bold uppercase tracking-wider">{title}</h3>
        <span className="text-xl font-bold">
          ₹{sectionData?.total?.toLocaleString() ?? 0}
        </span>
      </div>
      <div className="space-y-2">
        {sectionData &&
          Object.values(sectionData.accounts).map((acc: any) => (
            <div
              key={acc.code}
              className="flex justify-between items-center py-2 hover:bg-muted/30 px-2 rounded-md transition-colors"
            >
              <div className="flex flex-col">
                <span className="font-medium text-sm">{acc.name}</span>
                <span className="text-[10px] text-muted-foreground uppercase">
                  {acc.code}
                </span>
              </div>
              <span className="font-semibold text-sm">
                ₹{acc.amount?.toLocaleString() ?? 0}
              </span>
            </div>
          ))}
      </div>
    </div>
  );

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
              className="w-44"
            />
            <Button
              variant="outline"
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
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Side: Assets */}
            <Card className="h-fit">
              <CardContent className="p-8 space-y-8">
                <div className="flex items-center gap-3 mb-6">
                  <Landmark className="h-6 w-6 text-primary" />
                  <h2 className="text-2xl font-bold">Assets</h2>
                </div>
                {renderSection("Current & Non-Current Assets", data?.asset)}

                <div className="flex justify-between items-center border-t-2 border-primary pt-6 mt-12 bg-muted/20 p-4 rounded-lg">
                  <h3 className="text-xl font-bold uppercase">Total Assets</h3>
                  <span className="text-2xl font-extrabold text-primary">
                    ₹{data?.asset?.total?.toLocaleString() ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Right Side: Liabilities & Equity */}
            <div className="space-y-8">
              <Card>
                <CardContent className="p-8 space-y-8">
                  <div className="flex items-center gap-3 mb-6">
                    <Building2 className="h-6 w-6 text-red-600" />
                    <h2 className="text-2xl font-bold">Liabilities</h2>
                  </div>
                  {renderSection(
                    "Current & Long-Term Liabilities",
                    data?.liability,
                  )}

                  <div className="flex justify-between items-center border-t border-red-200 pt-4 bg-red-50/30 p-4 rounded-lg">
                    <h3 className="text-lg font-bold uppercase">
                      Total Liabilities
                    </h3>
                    <span className="text-xl font-bold text-red-600">
                      ₹{data?.liability?.total?.toLocaleString() ?? 0}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-8 space-y-8">
                  <div className="flex items-center gap-3 mb-6">
                    <Wallet className="h-6 w-6 text-green-600" />
                    <h2 className="text-2xl font-bold">Equity</h2>
                  </div>
                  {renderSection(
                    "Share Capital & Retained Earnings",
                    data?.equity,
                  )}

                  <div className="flex justify-between items-center border-t border-green-200 pt-4 bg-green-50/30 p-4 rounded-lg">
                    <h3 className="text-lg font-bold uppercase">
                      Total Equity
                    </h3>
                    <span className="text-xl font-bold text-green-600">
                      ₹{data?.equity?.total?.toLocaleString() ?? 0}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Equilibrium Check */}
              <div className="p-6 bg-primary text-primary-foreground rounded-xl flex justify-between items-center shadow-lg">
                <div className="space-y-1">
                  <p className="text-xs uppercase font-bold opacity-80">
                    Liabilities + Equity
                  </p>
                  <p className="text-3xl font-black">
                    ₹
                    {(
                      (data?.liability?.total ?? 0) + (data?.equity?.total ?? 0)
                    ).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold opacity-80">
                    Balanced
                  </p>
                  <div className="h-2 w-12 bg-white/40 rounded-full ml-auto mt-1" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
