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
import { Input } from "@/components/ui/input";
import { Search, Clock, FileWarning, ArrowRight } from "lucide-react";

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
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Aged Partner Balance
            </h1>
            <p className="text-sm text-muted-foreground">
              Breakdown of {type === "receivable" ? "Customer" : "Vendor"}{" "}
              balances by maturity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs
              value={type}
              onValueChange={(v: any) => setType(v)}
              className="w-[300px]"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="receivable">Receivables</TabsTrigger>
                <TabsTrigger value="payable">Payables</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search partner..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-64 bg-background"
              />
            </div>
            <Button variant="outline">Print</Button>
          </div>
        </div>

        <Card className="border-none shadow-none bg-transparent">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-background rounded-xl border border-dashed">
                <FileWarning className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground">No records found</p>
              </div>
            ) : (
              <div className="bg-background rounded-xl border overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      <th className="px-6 py-4 text-left">Partner</th>
                      <th className="px-6 py-4 text-right">Current</th>
                      <th className="px-6 py-4 text-right">1 - 30 Days</th>
                      <th className="px-6 py-4 text-right">31 - 60 Days</th>
                      <th className="px-6 py-4 text-right">61 - 90 Days</th>
                      <th className="px-6 py-4 text-right">90+ Days</th>
                      <th className="px-6 py-4 text-right bg-primary/5">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((item, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-muted/20 transition-colors text-sm"
                      >
                        <td className="px-6 py-4 font-semibold text-primary">
                          {item.partnerName}
                        </td>
                        <td className="px-6 py-4 text-right">
                          ₹{item.current.toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${item["1-30"] > 0 ? "text-blue-600 font-medium" : ""}`}
                        >
                          ₹{item["1-30"].toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${item["31-60"] > 0 ? "text-amber-600 font-medium" : ""}`}
                        >
                          ₹{item["31-60"].toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${item["61-90"] > 0 ? "text-orange-600 font-medium" : ""}`}
                        >
                          ₹{item["61-90"].toLocaleString()}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${item["90+"] > 0 ? "text-red-600 font-bold" : ""}`}
                        >
                          ₹{item["90+"].toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right font-black bg-primary/5">
                          ₹{item.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-primary/5 font-black text-primary border-t-2">
                    <tr>
                      <td className="px-6 py-5 text-left uppercase text-xs tracking-[0.2em]">
                        Grant Total
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
        <div className="flex items-center gap-6 mt-6 px-4 py-3 bg-muted/20 rounded-lg text-[10px] justify-center uppercase font-bold tracking-widest text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500" /> Recent
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" /> 1 month
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-orange-500" /> 2 months
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500" /> Critical
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
