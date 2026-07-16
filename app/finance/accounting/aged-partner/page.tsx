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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchInput } from "@/components/SearchInput";
import { Clock, FileWarning, ArrowRight } from "lucide-react";

export default function AgedPartnerReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"receivable" | "payable">("receivable");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/finance/reports/aged?type=${type}`);
      const json = await res.json();
      setItems(json.items || []);
    } catch (error) {
      toast.error("Failed to load aged report");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handlePrint = () => {
    window.print();
  };

  const filtered = items.filter((item) =>
    item.partnerName.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Aged Partner Balance"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Aged Partners" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={load}
    >
      <div className="space-y-1">
        {/* Page Header Spacer */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2"></div>

        {/* Table & Filtering Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                  Aged Partner Balance
                </h3>
              </div>

              <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                <Tabs
                  value={type}
                  onValueChange={(v: any) => setType(v)}
                  className="w-[300px]"
                >
                  <TabsList className="grid w-full grid-cols-2 rounded-none bg-white/[0.02] border border-border/40 p-0.5 h-10">
                    <TabsTrigger
                      value="receivable"
                      className="rounded-none text-xs font-mono h-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none transition-all"
                    >
                      Receivables
                    </TabsTrigger>
                    <TabsTrigger
                      value="payable"
                      className="rounded-none text-xs font-mono h-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none transition-all"
                    >
                      Payables
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="w-full max-w-xs">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search partner..."
                  />
                </div>

                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  className="h-10 px-6 rounded-none border border-border/40 bg-white/[0.02] text-xs uppercase tracking-wider font-mono text-foreground hover:bg-muted/10 transition-all shadow-none"
                >
                  Print
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">No records found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border/20">
                  <thead className="border-b border-border/40">
                    <tr className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      <th className="px-6 py-4 text-left font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                        Partner
                      </th>
                      <th className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                        Current
                      </th>
                      <th className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                        1 - 30 Days
                      </th>
                      <th className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                        31 - 60 Days
                      </th>
                      <th className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                        61 - 90 Days
                      </th>
                      <th className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                        90+ Days
                      </th>
                      <th className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 bg-primary/5">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {filtered.map((item, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-white/[0.015] transition-colors text-sm"
                      >
                        <td className="px-6 py-4 font-semibold text-primary">
                          {item.partnerName}
                        </td>
                        <td className="px-6 py-4 text-right">
                          ₹{item.current.toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${item["1-30"] > 0 ? "text-[#6CADF5] font-medium" : ""}`}
                        >
                          ₹{item["1-30"].toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${item["31-60"] > 0 ? "text-amber-500 font-medium" : ""}`}
                        >
                          ₹{item["31-60"].toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${item["61-90"] > 0 ? "text-orange-500 font-medium" : ""}`}
                        >
                          ₹{item["61-90"].toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${item["90+"] > 0 ? "text-[#F56868] font-bold" : ""}`}
                        >
                          ₹{item["90+"].toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right font-black bg-primary/5">
                          ₹{item.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-primary/5 font-black text-primary border-t-2 border-primary/20">
                    <tr>
                      <td className="px-6 py-5 text-left uppercase text-xs tracking-[0.2em]">
                        Grand Total
                      </td>
                      <td className="px-6 py-5 text-right">
                        ₹
                        {filtered
                          .reduce((s, i) => s + i.current, 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-6 py-5 text-right">
                        ₹
                        {filtered
                          .reduce((s, i) => s + i["1-30"], 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-6 py-5 text-right">
                        ₹
                        {filtered
                          .reduce((s, i) => s + i["31-60"], 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-6 py-5 text-right">
                        ₹
                        {filtered
                          .reduce((s, i) => s + i["61-90"], 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-6 py-5 text-right">
                        ₹
                        {filtered
                          .reduce((s, i) => s + i["90+"], 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-6 py-5 text-right text-lg">
                        ₹
                        {filtered
                          .reduce((s, i) => s + i.total, 0)
                          .toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-6 px-4 py-3 bg-white/[0.01] border border-border/40 rounded-none text-[10px] justify-center font-bold tracking-widest text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-none bg-[#6CADF5]" /> Recent
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-none bg-amber-500" /> 1 month
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-none bg-orange-500" /> 2 months
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-none bg-[#F56868]" /> Critical
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
