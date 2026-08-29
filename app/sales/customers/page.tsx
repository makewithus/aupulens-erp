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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Plus,
  MoreHorizontal,
  ChevronDown,
  Star,
  UserPlus,
  Upload,
  Check,
  Users2,
  RefreshCw,
  Columns,
  Search,
} from "lucide-react";
import { ExportCustomersDialog } from "@/components/sales/customers/ExportCustomersDialog";
import { ExportCurrentViewDialog } from "@/components/sales/customers/ExportCurrentViewDialog";
import { AVAILABLE_CUSTOMER_COLUMNS } from "@/lib/sales/customerViews";

const SORT_FIELDS = [
  { key: "header.displayName", label: "Display Name" },
  { key: "createdAt", label: "Created Time" },
  { key: "openingBalance", label: "Receivables" },
];

const LIMIT = 10;

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersPageInner />
    </Suspense>
  );
}

function CustomersPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [sortField, setSortField] = useState("createdAt");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportViewOpen, setExportViewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // AI-native "redirect with filters" — seed filter state from the URL on
  // first load (?search=/&dateFrom=/&dateTo=) so a link the AI assistant
  // sends the user to arrives already filtered. A normal, param-less visit
  // is unaffected — every value below just stays at its default.
  useEffect(() => {
    const qSearch = searchParams.get("search");
    const qDateFrom = searchParams.get("dateFrom");
    const qDateTo = searchParams.get("dateTo");
    if (qSearch) setQuery(qSearch);
    if (qDateFrom) setDateFrom(qDateFrom);
    if (qDateTo) setDateTo(qDateTo);
  }, []);

  const activeView = views.find((v) => v._id === activeViewId);
  const activeColumns: string[] =
    activeView?.columns?.length ? activeView.columns : AVAILABLE_CUSTOMER_COLUMNS.slice(0, 4).map((c) => c.key);

  const fetchViews = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/sales/customer-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All Customers");
        if (allView) setActiveViewId((cur) => (cur === "all" ? allView._id : cur));
      }
    } catch {
      // Non-critical — the list still works without saved views.
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (activeViewId && activeViewId !== "all") params.set("viewId", activeViewId);
      params.set("sortField", sortField);
      if (debouncedQuery) params.set("search", debouncedQuery);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await cachedFetch(`/api/sales/customers?${params.toString()}`);
      const json = await res.json();
      setCustomers(json.items || []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
    } catch (error) {
      console.error("Error loading customers:", error);
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [activeViewId, sortField, page, debouncedQuery, dateFrom, dateTo]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, activeViewId, sortField]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = async (view: any) => {
    await cachedFetch(`/api/sales/customer-views/${view._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !view.isFavorite }),
    });
    fetchViews();
  };

  const getPath = (obj: any, path: string) => path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  const columnLabel = (key: string) => AVAILABLE_CUSTOMER_COLUMNS.find((c) => c.key === key)?.label || key;

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Customers"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Customers" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2 ${SALES_PAGE_TITLE_CLASS}`}>
                {activeView?.name || "All Customers"} <ChevronDown className="w-8 h-8 mb-2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 rounded-none">
              <DropdownMenuSeparator />
              <div className="max-h-72 overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {views.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">No views found.</div>
                ) : (
                  views.map((v) => (
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
              <DropdownMenuItem onClick={() => router.push("/sales/customers/views/new")}>
                <Plus className="w-4 h-4 mr-2" /> New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-56 bg-background rounded-none"
              />
            </div>
            <Link href="/sales/customers/new">
              <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
                <Plus className="w-4 h-4 mr-2" /> New
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-none border-border/40">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-none">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Sort by</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="rounded-none">
                    {SORT_FIELDS.map((f) => (
                      <DropdownMenuItem key={f.key} onClick={() => setSortField(f.key)}>
                        {f.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Import</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="rounded-none">
                    <DropdownMenuItem onClick={() => router.push("/sales/customers/import")}>
                      Import Customers
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="rounded-none">
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>Export Customers</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportViewOpen(true)}>Export Current View</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem disabled>Preferences</DropdownMenuItem>
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

        {!loading && customers.length === 0 && debouncedQuery ? (
          <div className="flex flex-col items-center py-16 px-4 text-center">
            <Users2 className="w-12 h-12 mb-6 text-muted-foreground/30" />
            <h2 className="text-[20px] font-medium tracking-[-0.05em] text-foreground mb-2">No customers match your search</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Try a different name or email, or clear the search box.
            </p>
          </div>
        ) : !loading && customers.length === 0 ? (
          <div className="flex flex-col items-center py-16 px-4 text-center">
            <Users2 className="w-12 h-12 mb-6 text-muted-foreground/30" />
            <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground mb-2">Every sale starts with a customer</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Create and manage your customers and their contact persons, all in one place.
            </p>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/sales/customers/new">
                <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
                  <UserPlus className="w-4 h-4 mr-2" /> Create New Customer
                </Button>
              </Link>
              <Link href="/sales/customers/import">
                <Button variant="outline" className="h-11 rounded-none border-border/40 font-mono text-[12px] uppercase tracking-wider">
                  <Upload className="w-4 h-4 mr-2" /> Import File
                </Button>
              </Link>
            </div>
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground/60 mb-10">or import from another accounting tool</p>

            <div className="border border-border/40 rounded-none p-6 max-w-lg w-full text-left">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-4">Key Benefits</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {[
                  "Stay connected with multiple contact persons",
                  "Provide portal access to customers",
                  "Handle multiple addresses effortlessly",
                  "Create multi-currency transactions for contacts",
                ].map((benefit) => (
                  <div key={benefit} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground/85">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Name</TableHead>
                    {activeColumns.map((key) => (
                      <TableHead key={key} className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                        {columnLabel(key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-5 w-32" /></TableCell>
                        {activeColumns.map((key) => (
                          <TableCell key={key} className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-24" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    customers.map((c: any) => (
                      <TableRow
                        key={c._id}
                        className="group transition-colors duration-300 hover:bg-white/[0.015] cursor-pointer"
                        onClick={() => router.push(`/sales/customers/${c._id}`)}
                      >
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">
                          {c.header?.displayName || c.header?.name}
                        </TableCell>
                        {activeColumns.map((key) => (
                          <TableCell key={key} className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                            {String(getPath(c, key) ?? "—")}
                          </TableCell>
                        ))}
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

      <ExportCustomersDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportCurrentViewDialog
        open={exportViewOpen}
        onOpenChange={setExportViewOpen}
        viewId={activeViewId}
        viewName={activeView?.name}
      />
    </DashboardLayout>
  );
}
