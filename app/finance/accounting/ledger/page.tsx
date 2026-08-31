"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, ArrowUpDown, FileStack } from "lucide-react";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";

const LIMIT = 10;

export default function GeneralLedgerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [reconciledFilter, setReconciledFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, reconciledFilter, dateFrom, dateTo]);

  const load = useCallback(async (currentPage: number, search: string, reconciled: string, from = "", to = "") => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (search) params.set("search", search);
      if (reconciled) params.set("reconciled", reconciled);
      if (from) params.set("dateFrom", from);
      if (to) params.set("dateTo", to);
      const res = await cachedFetch(`/api/finance/journal-items?${params.toString()}`);
      const json = await res.json();
      setItems(json.items || []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
      setTotals(json.totals || { debit: 0, credit: 0 });
    } catch (error) {
      toast.error("Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") load(page, debouncedQuery, reconciledFilter, dateFrom, dateTo);
  }, [status, router, load, page, debouncedQuery, reconciledFilter, dateFrom, dateTo]);

  const hasActiveFilters = !!(query || reconciledFilter || dateFrom || dateTo);
  const resetFilters = () => {
    setQuery("");
    setReconciledFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const filtered = items;

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
      onRefresh={() => load(page, debouncedQuery, reconciledFilter, dateFrom, dateTo)}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
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
            <Select
              value={reconciledFilter || "all"}
              onValueChange={(v) => setReconciledFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[150px] bg-background">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="true">Reconciled</SelectItem>
                <SelectItem value="false">Open</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear
              </Button>
            )}
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
                <Table className="min-w-full divide-y divide-border">
                  <TableHeader className="bg-muted/50">
                    <TableRow className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      <TableHead className="px-6 py-4 text-left">Date</TableHead>
                      <TableHead className="px-6 py-4 text-left">Entry</TableHead>
                      <TableHead className="px-6 py-4 text-left">Account</TableHead>
                      <TableHead className="px-6 py-4 text-left">Partner</TableHead>
                      <TableHead className="px-6 py-4 text-left">Label</TableHead>
                      <TableHead className="px-6 py-4 text-right">Debit</TableHead>
                      <TableHead className="px-6 py-4 text-right">Credit</TableHead>
                      <TableHead className="px-6 py-4 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {filtered.map((line, idx) => (
                      <TableRow
                        key={idx}
                        className="hover:bg-muted/20 transition-colors text-sm"
                      >
                        <TableCell className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                          {new Date(line.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap font-medium text-primary">
                          {line.entryName}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {line.accountId?.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {line.accountId?.code}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                          {line.partnerId?.header?.name ||
                            line.partnerId?.name ||
                            "-"}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-muted-foreground italic">
                          {line.label || "-"}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-semibold">
                          {line.debit > 0
                            ? `₹${line.debit.toLocaleString()}`
                            : ""}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-semibold">
                          {line.credit > 0
                            ? `₹${line.credit.toLocaleString()}`
                            : ""}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-center">
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="bg-muted/50 font-bold border-t-2">
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="px-6 py-4 text-right uppercase tracking-wider text-xs"
                      >
                        Totals (all {total} lines)
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        ₹{(totals.debit || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        ₹{(totals.credit || 0).toLocaleString()}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
