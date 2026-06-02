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
import { Badge } from "@/components/ui/badge";
import { Search, Filter, ArrowUpDown, FileStack } from "lucide-react";

export default function GeneralLedgerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/finance/journal-items");
      const json = await res.json();
      setItems(json.items || []);
    } catch (error) {
      toast.error("Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const filtered = items.filter((line) =>
    [
      line.entryName,
      line.label || "",
      line.accountId?.name || "",
      line.partnerId?.header?.name || line.partnerId?.name || "",
    ].some((v) => v.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="General Ledger"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "General Ledger" },
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
            <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">
              General Ledger
            </h1>
            <p className="text-sm text-muted-foreground">
              Master list of all financial transactions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ledger..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-64 bg-background"
              />
            </div>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" /> Filters
            </Button>
            <Button
              onClick={() => router.push("/finance/accounting/journal-entries")}
            >
              Journal Entries
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-none bg-transparent">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-background rounded-xl border border-dashed">
                <FileStack className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground">No ledger items found</p>
              </div>
            ) : (
              <div className="bg-background rounded-xl border overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      <th className="px-6 py-4 text-left">Date</th>
                      <th className="px-6 py-4 text-left">Entry</th>
                      <th className="px-6 py-4 text-left">Account</th>
                      <th className="px-6 py-4 text-left">Partner</th>
                      <th className="px-6 py-4 text-left">Label</th>
                      <th className="px-6 py-4 text-right">Debit</th>
                      <th className="px-6 py-4 text-right">Credit</th>
                      <th className="px-6 py-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((line, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-muted/20 transition-colors text-sm"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                          {new Date(line.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-primary">
                          {line.entryName}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {line.accountId?.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {line.accountId?.code}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                          {line.partnerId?.header?.name ||
                            line.partnerId?.name ||
                            "-"}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground italic">
                          {line.label || "-"}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold">
                          {line.debit > 0
                            ? `₹${line.debit.toLocaleString()}`
                            : ""}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold">
                          {line.credit > 0
                            ? `₹${line.credit.toLocaleString()}`
                            : ""}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {line.reconciled ? (
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-green-700 border-green-200"
                            >
                              Reconciled
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-yellow-50 text-yellow-700 border-yellow-200"
                            >
                              Open
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/50 font-bold border-t-2">
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-4 text-right uppercase tracking-wider text-xs"
                      >
                        Totals
                      </td>
                      <td className="px-6 py-4 text-right">
                        ₹
                        {filtered
                          .reduce((sum, l) => sum + (l.debit || 0), 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        ₹
                        {filtered
                          .reduce((sum, l) => sum + (l.credit || 0), 0)
                          .toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
