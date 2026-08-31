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
  ShoppingCart,
  User,
  FileCheck2,
  ClipboardList,
  Boxes,
  Receipt,
  Banknote,
} from "lucide-react";
import { ExportSalesOrdersDialog } from "@/components/sales/salesOrders/ExportSalesOrdersDialog";
import { ExportCurrentViewDialog } from "@/components/sales/salesOrders/ExportCurrentViewDialog";
import { AVAILABLE_SALE_ORDER_COLUMNS } from "@/lib/sales/saleOrderViews";

const SORT_FIELDS = [
  { key: "createdAt", label: "Created Time" },
  { key: "updatedAt", label: "Last Modified Time" },
  { key: "header.dateOrder", label: "Date" },
  { key: "header.name", label: "Sales Order#" },
  { key: "otherInfo.clientOrderRef", label: "Reference#" },
  { key: "header.partnerId", label: "Customer Name" },
  { key: "totals.amountTotal", label: "Amount" },
  { key: "expectedShipmentDate", label: "Expected Shipment Date" },
];

const statusColors: Record<string, string> = {
  confirmed: "text-emerald-500",
  approved: "text-emerald-500",
  pending_approval: "text-amber-500",
  on_hold: "text-orange-500",
  void: "text-red-500",
  closed: "text-red-500",
};

function LifecycleDiagram() {
  const Node = ({ icon: Icon, label, color = "text-foreground" }: { icon: any; label: string; color?: string }) => (
    <div className={`flex items-center gap-2 border border-border/40 rounded-none px-4 py-2.5 bg-background ${color}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] whitespace-nowrap">{label}</span>
    </div>
  );

  return (
    <Card className="border border-border/40 shadow-none bg-background rounded-none p-8">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 text-center mb-8">Life cycle of a Sales Order</h3>
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <div className="flex flex-col gap-2">
            <Node icon={User} label="Customer Request" />
            <Node icon={FileCheck2} label="Accepted Estimate" />
          </div>
          <span className="text-muted-foreground/50 text-xs font-mono">- - - →</span>
          <Node icon={ShoppingCart} label="Create Sales Order" color="text-blue-500" />
          <span className="text-muted-foreground/50 text-xs font-mono">- Convert to Open - →</span>
          <Node icon={ClipboardList} label="Confirm Sales Order" color="text-purple-500" />
          <span className="text-muted-foreground/50 text-xs font-mono">- Low Stock - →</span>
          <Node icon={Boxes} label="Convert to Purchase Order" />
        </div>
        <div className="flex items-center gap-6">
          <span className="text-muted-foreground/50 text-xs">↓</span>
        </div>
        <div className="flex items-center gap-6">
          <Node icon={Receipt} label="Convert Sales Order to Invoice" color="text-indigo-500" />
          <span className="text-muted-foreground/50 text-xs font-mono">← - Receive Goods - -</span>
        </div>
        <span className="text-muted-foreground/50 text-xs">↓</span>
        <Node icon={Banknote} label="Get Paid" color="text-emerald-500" />
      </div>
    </Card>
  );
}

export default function SalesOrdersPage() {
  return (
    <Suspense fallback={null}>
      <SalesOrdersPageInner />
    </Suspense>
  );
}

function SalesOrdersPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [viewSearch, setViewSearch] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportViewOpen, setExportViewOpen] = useState(false);
  // AI-native "redirect with filters" — seed filter state from the URL
  // synchronously (lazy useState initializer) so the very first fetch
  // already uses them. This page has no visible filter UI for these yet
  // (only saved views + sort), so this is a silent, additive narrowing of
  // the fetched rows — a normal, param-less visit is completely unaffected.
  // This used to seed via a separate useEffect after mount, which let an
  // initial unfiltered fetch fire and render before the filtered one
  // landed: a visible flash of the wrong rows on every filtered redirect.
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
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
      const res = await cachedFetch("/api/sales/sales-order-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All");
        if (allView) setActiveViewId((cur) => (cur === "all" ? allView._id : cur));
      }
    } catch {
      // Non-critical
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeViewId && activeViewId !== "all") params.set("viewId", activeViewId);
      params.set("sortField", sortField);
      params.set("sortDir", sortDir);
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (customerId) params.set("customerId", customerId);
      if (amountMin) params.set("amountMin", amountMin);
      if (amountMax) params.set("amountMax", amountMax);
      const res = await cachedFetch(`/api/sales/sales-orders?${params.toString()}`);
      const json = await res.json();
      if (json.success) setOrders(json.data || []);
    } catch (error) {
      console.error("Error loading sales orders:", error);
      toast.error("Failed to load sales orders");
    } finally {
      setLoading(false);
    }
  }, [activeViewId, sortField, sortDir, search, statusFilter, dateFrom, dateTo, customerId, amountMin, amountMax]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = async (view: any) => {
    await cachedFetch(`/api/sales/sales-order-views/${view._id}`, {
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
  const columnLabel = (key: string) => AVAILABLE_SALE_ORDER_COLUMNS.find((c) => c.key === key)?.label || key;
  const filteredViews = views.filter((v) => v.name.toLowerCase().includes(viewSearch.toLowerCase()));

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Sales Orders"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Sales Orders" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2 ${SALES_PAGE_TITLE_CLASS}`}>
                {activeView?.name === "All" ? "All Sales Orders" : activeView?.name || "All Sales Orders"}{" "}
                <ChevronDown className="w-8 h-8 mb-2" />
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
              <DropdownMenuItem onClick={() => router.push("/sales/sales-orders/views/new")}>
                <Plus className="w-4 h-4 mr-2" /> New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              inputClassName="rounded-none bg-background"
            />
            <Link href="/sales/sales-orders/new">
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
                <DropdownMenuItem onClick={() => router.push("/sales/sales-orders/import")}>
                  Import Sales Orders
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>Export Sales Orders</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportViewOpen(true)}>Export Current View</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
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

        {!loading && orders.length === 0 ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center py-16 px-4 text-center">
              <ShoppingCart className="w-12 h-12 mb-6 text-muted-foreground/30" />
              <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground mb-2">Start Managing Your Sales Activities!</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Create, customize and send professional Sales Orders.
              </p>
              <Link href="/sales/sales-orders/new">
                <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
                  Create Sales Order
                </Button>
              </Link>
              <div className="border-t border-border/40 w-full max-w-sm mt-8 pt-4 text-xs font-mono text-muted-foreground/60">
                Convert vendor purchase orders into sales orders via <strong className="text-foreground">Bharat Connect</strong>.{" "}
                <Link href="/sales/document-settings" className="text-primary underline">
                  Setup Now
                </Link>
              </div>
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
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Sales Order#</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Customer Name</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Order Status</TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Amount</TableHead>
                    {extraColumns.map((key) => (
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
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell className="px-8 py-7 text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    orders.map((o: any) => (
                      <TableRow
                        key={o._id}
                        className="group transition-colors duration-300 hover:bg-white/[0.015] cursor-pointer"
                        onClick={() => router.push(`/sales/sales-orders/${o._id}`)}
                      >
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                          {o.header?.dateOrder ? new Date(o.header.dateOrder).toLocaleDateString("en-IN") : "—"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">
                          {o.header?.name}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                          {o.header?.partnerId?.header?.displayName || o.header?.partnerId?.header?.name || "—"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[12px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[o.salesOrderStatus] || "text-muted-foreground"}`}>
                            {o.salesOrderStatus?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right font-mono text-sm text-foreground">
                          ₹{Number(o.totals?.amountTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        {extraColumns.map((key) => {
                          const value = getPath(o, key);
                          return (
                            <TableCell key={key} className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                              {value === null || value === undefined || value === "" ? "—" : String(value)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <ExportSalesOrdersDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportCurrentViewDialog
        open={exportViewOpen}
        onOpenChange={setExportViewOpen}
        viewId={activeViewId}
        viewName={activeView?.name}
      />
    </DashboardLayout>
  );
}
