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
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Plus,
  MoreHorizontal,
  FileText,
  Mail,
  CheckCircle2,
  XCircle,
  FileCheck,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";

const statusColors: Record<string, string> = {
  accepted: "text-emerald-500",
  rejected: "text-red-500",
  sent: "text-blue-500",
  invoiced: "text-purple-500",
  draft: "text-muted-foreground",
};

function LifecycleDiagram() {
  const Node = ({ icon: Icon, label, color }: { icon: any; label: string; color: string }) => (
    <div className={`flex items-center gap-2 border border-border/40 rounded-none px-4 py-2 ${color}`}>
      <Icon className="w-4 h-4" />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em]">{label}</span>
    </div>
  );

  return (
    <Card className="border border-border/40 shadow-none bg-background rounded-none p-8">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-6 text-center">Life cycle of a Quote</h3>
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <Node icon={FileText} label="Quote" color="text-foreground" />
          <span className="text-muted-foreground/50">→</span>
          <Node icon={Mail} label="Sent to Customer" color="text-blue-500" />
        </div>
        <div className="flex items-center gap-16">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground/50">- - - - ↓</span>
            <Node icon={CheckCircle2} label="Accept" color="text-emerald-500" />
            <span className="text-muted-foreground/50">↓</span>
            <Node icon={FileCheck} label="Invoice" color="text-purple-500" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground/50">- - - - ↓</span>
            <Node icon={XCircle} label="Reject" color="text-red-500" />
          </div>
        </div>
      </div>
    </Card>
  );
}

const LIMIT = 10;
const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "invoiced"];

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <QuotesPageInner />
    </Suspense>
  );
}

function QuotesPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // AI-native "redirect with filters" — seed filter state from the URL
  // synchronously (lazy useState initializer) so the very first fetch
  // already uses them. A normal, param-less visit just gets the defaults
  // below, unchanged. This used to seed via a separate useEffect after
  // mount, which let an initial unfiltered fetch fire and render before the
  // filtered one landed: a visible flash of the wrong rows on every
  // filtered redirect. `debouncedQuery` is seeded too (not just `query`) so
  // a seeded search term doesn't wait out its normal 300ms typing-debounce
  // before the first fetch uses it.
  const [query, setQuery] = useState(() => searchParams.get("search") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(() => searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [viewSearch, setViewSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") || "");
  const [customerId, setCustomerId] = useState(() => searchParams.get("customerId") || "");
  const [amountMin, setAmountMin] = useState(() => searchParams.get("amountMin") || "");
  const [amountMax, setAmountMax] = useState(() => searchParams.get("amountMax") || "");

  const activeView = views.find((v) => v._id === activeViewId);
  const filteredViews = views.filter((v) => v.name.toLowerCase().includes(viewSearch.toLowerCase()));

  const fetchViews = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/sales/quote-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All Quotes");
        if (allView) setActiveViewId((cur) => (cur === "all" ? allView._id : cur));
      }
    } catch {
      // Non-critical — the list still works without saved views.
    }
  }, []);

  const toggleFavorite = async (view: any) => {
    await cachedFetch(`/api/sales/quote-views/${view._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !view.isFavorite }),
    });
    fetchViews();
  };

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter, activeViewId]);

  const load = useCallback(async (currentPage = page, search = debouncedQuery, statusF = statusFilter, viewId = activeViewId) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusF, page: String(currentPage), limit: String(LIMIT) });
      if (search) params.set("search", search);
      if (viewId && viewId !== "all") params.set("viewId", viewId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (customerId) params.set("customerId", customerId);
      if (amountMin) params.set("amountMin", amountMin);
      if (amountMax) params.set("amountMax", amountMax);
      const res = await cachedFetch(`/api/sales/quotes?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setQuotes(data.data);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      } else toast.error(data.message || "Failed to load quotes");
    } catch {
      toast.error("Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, statusFilter, activeViewId, dateFrom, dateTo, customerId, amountMin, amountMax]);

  useEffect(() => {
    load(page, debouncedQuery, statusFilter, activeViewId);
  }, [page, debouncedQuery, statusFilter, activeViewId, dateFrom, dateTo, customerId, amountMin, amountMax]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Quotes"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Quotes" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2 ${SALES_PAGE_TITLE_CLASS}`}>
                {activeView?.name || "All Quotes"} <ChevronDown className="w-8 h-8 mb-2" />
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
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
                  <Plus className="w-4 h-4 mr-1" /> New <ChevronDown className="w-3.5 h-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-none">
                <DropdownMenuItem onClick={() => router.push("/sales/quotes/new")}>Quote</DropdownMenuItem>
                <DropdownMenuItem disabled>Subscription Quote</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-none border-border/40">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-none">
                <DropdownMenuItem onClick={() => router.push("/sales/quotes/import")}>Import Quotes</DropdownMenuItem>
                <DropdownMenuItem onClick={() => load(page, debouncedQuery, statusFilter, activeViewId)}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!loading && quotes.length === 0 && !(query || statusFilter !== "all" || dateFrom || dateTo || (activeViewId !== "all" && activeView?.name !== "All Quotes")) ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center py-10">
              <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground mb-2">Seal the deal.</h2>
              <p className="text-sm text-muted-foreground mb-6">
                With quotes, give your customers an offer they can&apos;t refuse!
              </p>
              <Link href="/sales/quotes/new">
                <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
                  Create New Quote
                </Button>
              </Link>
              <Link href="/sales/quotes/import" className="font-mono text-[11px] uppercase tracking-wider text-primary underline mt-4">
                Import Quotes
              </Link>
            </div>
            <LifecycleDiagram />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search quotes..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9 w-64 rounded-none bg-background"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 rounded-none bg-background">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {QUOTE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                inputClassName="rounded-none bg-background"
              />
            </div>
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Quote #</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Customer</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Quote Date</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Expiry Date</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Status</TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell className="px-8 py-7 text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : quotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                        No quotes match your search or filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    quotes.map((q: any) => (
                      <TableRow
                        key={q._id}
                        className="group transition-colors duration-300 hover:bg-white/[0.015] cursor-pointer"
                        onClick={() => router.push(`/sales/quotes/${q._id}`)}
                      >
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">
                          {q.quoteNumber}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                          {q.customerId?.header?.name || "—"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                          {q.quoteDate ? new Date(q.quoteDate).toLocaleDateString("en-IN") : "—"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                          {q.expiryDate ? new Date(q.expiryDate).toLocaleDateString("en-IN") : "—"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[12px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[q.status] || "text-muted-foreground"}`}>
                            {q.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right font-mono text-sm text-foreground">
                          ₹{Number(q.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
                    <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <span className="text-sm">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
