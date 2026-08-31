"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { SALES_PAGE_TITLE_CLASS } from "@/components/sales/styles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import {
  Plus,
  MoreHorizontal,
  ChevronDown,
  Star,
  RefreshCw,
  Columns,
  Wallet,
  CreditCard,
  Landmark,
  HandCoins,
  ListChecks,
  SlidersHorizontal,
} from "lucide-react";
import { ExportInvoicePaymentsDialog } from "@/components/sales/payments/ExportInvoicePaymentsDialog";
import { ExportCurrentViewDialog } from "@/components/sales/payments/ExportCurrentViewDialog";
import { ManageCustomFieldsDrawer } from "@/components/sales/payments/ManageCustomFieldsDrawer";
import { AVAILABLE_PAYMENT_COLUMNS } from "@/lib/sales/paymentViews";

const SORT_FIELDS = [
  { key: "createdAt", label: "Created Time" },
  { key: "updatedAt", label: "Last Modified Time" },
  { key: "paymentDate", label: "Date" },
  { key: "paymentNumber", label: "Payment#" },
  { key: "customerId", label: "Customer Name" },
  { key: "amountReceived", label: "Amount" },
  { key: "mode", label: "Mode" },
];

const statusColors: Record<string, string> = {
  paid: "text-emerald-500",
  draft: "text-amber-500",
  void: "text-red-500",
};

function LifecycleDiagram() {
  return (
    <Card className="border border-border/40 shadow-none bg-background rounded-none p-8">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 text-center mb-8">Life cycle of a Customer Payment</h3>
      <div className="flex flex-col items-center gap-6">
        <div className="flex border border-border/40 rounded-none bg-background">
          {["Initial Request", "Reminder 1", "Reminder 2", "Reminder N"].map((label, i) => (
            <div
              key={label}
              className={`px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] whitespace-nowrap ${i > 0 ? "border-l border-border/40" : ""}`}
            >
              {label}
            </div>
          ))}
        </div>
        <span className="text-muted-foreground/50 text-xs">┊</span>
        <div className="flex items-center gap-6 flex-wrap justify-center">
          {[
            { icon: Wallet, label: "PayPal" },
            { icon: CreditCard, label: "Credit Card" },
            { icon: Landmark, label: "Bank" },
            { icon: HandCoins, label: "Manual / Offline" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 border border-border/40 rounded-none px-4 py-2.5 bg-background">
              <Icon className="w-4 h-4 shrink-0" />
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
        <p className="font-mono text-[11px] text-muted-foreground/60">
          Paid through <span className="text-red-500 font-semibold">Client Portal</span> (PayPal, Credit Card, Bank)
        </p>
      </div>
    </Card>
  );
}

const LIMIT = 10;

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsPageInner />
    </Suspense>
  );
}

function PaymentsPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [viewSearch, setViewSearch] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportViewOpen, setExportViewOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  // AI-native "redirect with filters" — seed filter state from the URL
  // synchronously (lazy useState initializer) so the very first fetch
  // already uses them. A normal, param-less visit just gets the defaults
  // below, unchanged. This used to seed via a separate useEffect after
  // mount, which let an initial unfiltered fetch fire and render before the
  // filtered one landed: a visible flash of the wrong rows on every
  // filtered redirect. `debouncedQuery` is seeded too (not just `query`) so
  // a seeded search term doesn't wait out its normal 300ms typing-debounce.
  const [query, setQuery] = useState(() => searchParams.get("search") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(() => searchParams.get("search") || "");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") || "");
  const [customerId, setCustomerId] = useState(() => searchParams.get("customerId") || "");
  const [amountMin, setAmountMin] = useState(() => searchParams.get("amountMin") || "");
  const [amountMax, setAmountMax] = useState(() => searchParams.get("amountMax") || "");

  const activeView = views.find((v) => v._id === activeViewId);
  const extraColumns: string[] = activeView?.columns?.length ? activeView.columns : [];

  const fetchViews = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/sales/payment-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All Payments");
        if (allView) setActiveViewId((cur) => (cur === "all" ? allView._id : cur));
      }
    } catch {
      // Non-critical
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (activeViewId && activeViewId !== "all") params.set("viewId", activeViewId);
      params.set("sortField", sortField);
      params.set("sortDir", sortDir);
      if (debouncedQuery) params.set("search", debouncedQuery);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (customerId) params.set("customerId", customerId);
      if (amountMin) params.set("amountMin", amountMin);
      if (amountMax) params.set("amountMax", amountMax);
      const res = await cachedFetch(`/api/sales/payments?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setPayments(json.data || []);
        setTotal(json.total ?? 0);
        setTotalPages(json.totalPages ?? 1);
      }
      else toast.error(json.message || "Failed to load payments");
    } catch (error) {
      console.error("Error loading payments:", error);
      toast.error("Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [activeViewId, sortField, sortDir, page, debouncedQuery, statusFilter, dateFrom, dateTo, customerId, amountMin, amountMax]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, activeViewId, sortField, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = async (view: any) => {
    await cachedFetch(`/api/sales/payment-views/${view._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !view.isFavorite }),
    });
    fetchViews();
  };

  const setSort = (key: string) => {
    if (key === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(key);
      setSortDir("desc");
    }
  };

  const getPath = (obj: any, path: string) => path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  const columnLabel = (key: string) => AVAILABLE_PAYMENT_COLUMNS.find((c) => c.key === key)?.label || key;
  const filteredViews = views.filter((v) => v.name.toLowerCase().includes(viewSearch.toLowerCase()));

  const extraValue = (p: any, key: string) => {
    if (key === "invoiceNumbers") {
      return (p.allocations || []).map((a: any) => a.invoiceId?.number).filter(Boolean).join(", ") || "—";
    }
    const value = getPath(p, key);
    return value === null || value === undefined || value === "" ? "—" : String(value);
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Payments"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Payments" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2 ${SALES_PAGE_TITLE_CLASS}`}>
                {activeView?.name || "All Payments"} <ChevronDown className="w-8 h-8 mb-2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 rounded-none">
              <div className="p-2">
                <Input placeholder="Search views" value={viewSearch} onChange={(e) => setViewSearch(e.target.value)} className="h-8" />
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-72 overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {filteredViews.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">No views found.</div>
                ) : (
                  filteredViews.map((v) => (
                    <DropdownMenuItem
                      key={v._id}
                      className="flex items-center justify-between gap-2"
                      onClick={() => setActiveViewId(v._id)}
                    >
                      <span className={`truncate ${v._id === activeViewId ? "font-semibold text-foreground" : ""}`}>{v.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(v);
                        }}
                        className="shrink-0 p-1 hover:bg-muted"
                        aria-label={v.isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star className={`w-3.5 h-3.5 ${v.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                      </button>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/sales/payments/views/new")}>
                <Plus className="w-4 h-4 mr-2" /> New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Search payments..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-56 rounded-none bg-background"
            />
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              inputClassName="rounded-none bg-background"
            />
            <Link href="/sales/payments/new">
              <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
                <Plus className="w-4 h-4 mr-1" /> New
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-none border-border/40">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-none">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Sort by</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {SORT_FIELDS.map((f) => (
                      <DropdownMenuItem key={f.key} onClick={() => setSort(f.key)}>
                        {f.label} {sortField === f.key && (sortDir === "asc" ? "↑" : "↓")}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Import</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => router.push("/sales/payments/import")}>Import Payments</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/sales/payments/import/retainer")}>
                      Import Retainer Payments
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/sales/payments/import/excess")}>
                      Import Applied Excess Payments
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>Export Invoice Payments</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportViewOpen(true)}>Export Current View</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => setCustomFieldsOpen(true)}>
                  <ListChecks className="w-4 h-4 mr-2" /> Manage Custom Fields
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/sales/payments/online-payment-settings")}>
                  <SlidersHorizontal className="w-4 h-4 mr-2" /> Online Payments
                </DropdownMenuItem>
                <DropdownMenuItem onClick={load}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh List
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Columns className="w-4 h-4 mr-2" /> Reset Column Width
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!loading && payments.length === 0 && !debouncedQuery && !statusFilter && !dateFrom && !dateTo ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center py-16 px-4 text-center">
              <Wallet className="w-12 h-12 mb-6 text-muted-foreground/30" />
              <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground mb-2">No payments received, yet</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Payments will be added once your customers pay for their invoices.
              </p>
              <Button
                className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer"
                onClick={() => router.push("/sales/invoices?status=saved")}
              >
                Go to Unpaid Invoices
              </Button>
              <button className="font-mono text-[11px] uppercase tracking-wider text-primary underline mt-4" onClick={() => router.push("/sales/payments/import")}>
                Import Payments
              </button>
            </div>
            <LifecycleDiagram />
          </div>
        ) : (
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Date</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Customer Name</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Mode</TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Amount</TableHead>
                    {extraColumns.map((key) => (
                      <TableHead key={key} className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                        {columnLabel(key)}
                      </TableHead>
                    ))}
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell className="px-8 py-7 text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                        <TableCell className="px-8 py-7"><Skeleton className="h-4 w-16" /></TableCell>
                      </TableRow>
                    ))
                  ) : payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5 + extraColumns.length} className="py-16 text-center text-sm text-muted-foreground">
                        No payments match your search or filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((p: any) => (
                      <TableRow
                        key={p._id}
                        className="group transition-colors duration-300 hover:bg-white/[0.015] cursor-pointer"
                        onClick={() => router.push(`/sales/payments/${p._id}`)}
                      >
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                          {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("en-IN") : "—"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">
                          {p.customerId?.header?.displayName || p.customerId?.header?.name || "—"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                          {p.mode}
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right border-r last:border-0 border-border/10 font-mono text-sm text-foreground">
                          ₹{Number(p.amountReceived || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        {extraColumns.map((key) => (
                          <TableCell key={key} className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                            {extraValue(p, key)}
                          </TableCell>
                        ))}
                        <TableCell className="px-8 py-7">
                          <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[12px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[p.status] || "text-muted-foreground"}`}>
                            {p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
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
        )}
      </div>

      <ExportInvoicePaymentsDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportCurrentViewDialog
        open={exportViewOpen}
        onOpenChange={setExportViewOpen}
        viewId={activeViewId}
        viewName={activeView?.name}
      />
      <ManageCustomFieldsDrawer open={customFieldsOpen} onOpenChange={setCustomFieldsOpen} />
    </DashboardLayout>
  );
}
