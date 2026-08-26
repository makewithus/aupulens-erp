"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  Plus,
  MoreHorizontal,
  ChevronDown,
  Star,
  RefreshCw,
  Columns,
  Repeat,
  User,
  RotateCw,
  FileText,
  CreditCard,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
} from "lucide-react";
import { ExportSubscriptionsDialog } from "@/components/sales/subscriptions/ExportSubscriptionsDialog";
import { ExportCurrentViewDialog } from "@/components/sales/subscriptions/ExportCurrentViewDialog";
import { AVAILABLE_SUBSCRIPTION_COLUMNS } from "@/lib/sales/subscriptionViews";

const SORT_FIELDS = [
  { key: "createdAt", label: "Created On" },
  { key: "activatedOn", label: "Activated On" },
  { key: "profileName", label: "Plan Name" },
  { key: "totalAmount", label: "Amount" },
  { key: "lastBilledOn", label: "Last Billed On" },
  { key: "nextBillingOn", label: "Next Billing On" },
  { key: "updatedAt", label: "Last Modified Time" },
];

const statusColors: Record<string, string> = {
  active: "text-emerald-500",
  trial: "text-blue-500",
  dunning: "text-amber-500",
  unpaid: "text-amber-500",
  cancelled: "text-red-500",
  expired: "text-red-500",
};

function SubscriptionOverview() {
  const Node = ({
    icon: Icon,
    label,
    color = "border-border",
  }: {
    icon: any;
    label: string;
    color?: string;
  }) => (
    <div className={`flex flex-col items-center gap-1.5 border border-border/40 rounded-none px-4 py-3 bg-background ${color}`}>
      <Icon className="w-5 h-5" />
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-center whitespace-nowrap">{label}</span>
    </div>
  );

  return (
    <Card className="border border-border/40 shadow-none bg-background rounded-none p-8">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 text-center mb-8">Subscription Overview</h3>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Node icon={User} label="Customer" color="text-foreground" />
          <div className="flex flex-col items-center text-[10px] font-mono text-muted-foreground/60">
            <span>Approaches you for a subscription</span>
            <span>→</span>
          </div>
          <div className="border border-border/40 rounded-none p-3 bg-background">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60 text-center mb-2">Plans Offered</p>
            <div className="flex gap-2">
              <div className="border border-border/40 rounded-none px-2 py-1 text-[10px] font-mono">Plan 1</div>
              <div className="border border-emerald-500/40 rounded-none px-2 py-1 text-[10px] font-mono flex items-center gap-1 text-emerald-500">
                Plan 2 <CheckCircle2 className="w-3 h-3" />
              </div>
              <div className="border border-border/40 rounded-none px-2 py-1 text-[10px] font-mono">Plan n</div>
            </div>
          </div>
          <div className="flex flex-col items-center text-[10px] font-mono text-muted-foreground/60">
            <span>Selects a plan</span>
            <span>→</span>
          </div>
          <Node icon={RotateCw} label="Subscription Created" color="text-foreground" />
          <span className="text-muted-foreground/50">→</span>
          <Node icon={FileText} label="Invoice Raised" color="text-purple-500" />
        </div>

        <span className="text-muted-foreground/50">↓</span>
        <Node icon={CreditCard} label="Payment Made" color="text-emerald-500" />

        <div className="flex items-center gap-8 mt-2">
          <Node icon={CalendarX2} label="Subscription Cancelled or Expired" color="text-red-500" />
          <div className="flex flex-col items-center text-[10px] text-muted-foreground/60">
            <span>←</span>
          </div>
          <Node icon={CalendarClock} label="End of Billing Cycle" color="text-foreground" />
          <div className="flex flex-col items-center text-[10px] font-mono text-muted-foreground/60">
            <span>←</span>
            <span>Subscription stays active</span>
          </div>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground/50 border-t border-dashed border-border/40 pt-2 mt-2 w-full text-center">
          - - - Subscription renews (End of Billing Cycle loops back up to Invoice Raised) - - -
        </p>
      </div>
    </Card>
  );
}

const LIMIT = 10;

export default function SubscriptionsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [viewSearch, setViewSearch] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportViewOpen, setExportViewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const activeView = views.find((v) => v._id === activeViewId);
  const activeColumns: string[] =
    activeView?.columns?.length ? activeView.columns : AVAILABLE_SUBSCRIPTION_COLUMNS.slice(0, 4).map((c) => c.key);

  const fetchViews = useCallback(async () => {
    try {
      const res = await cachedFetch("/api/sales/subscription-views");
      const data = await res.json();
      if (data.success) {
        setViews(data.data);
        const allView = data.data.find((v: any) => v.name === "All");
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
      params.set("sortDir", sortDir);
      if (debouncedQuery) params.set("search", debouncedQuery);
      const res = await cachedFetch(`/api/sales/subscriptions?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setSubscriptions(json.data || []);
        setTotal(json.total ?? 0);
        setTotalPages(json.totalPages ?? 1);
      }
    } catch (error) {
      console.error("Error loading subscriptions:", error);
      toast.error("Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, [activeViewId, sortField, sortDir, page, debouncedQuery]);

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
    await cachedFetch(`/api/sales/subscription-views/${view._id}`, {
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
  const columnLabel = (key: string) => AVAILABLE_SUBSCRIPTION_COLUMNS.find((c) => c.key === key)?.label || key;
  const formatValue = (key: string, value: any) => {
    if (value == null) return "—";
    if (key === "totalAmount") return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    if (["createdAt", "activatedOn", "lastBilledOn", "nextBillingOn", "updatedAt"].includes(key)) {
      return new Date(value).toLocaleDateString("en-IN");
    }
    return String(value);
  };

  const filteredViews = views.filter((v) => v.name.toLowerCase().includes(viewSearch.toLowerCase()));

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Subscriptions"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Subscriptions" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2 ${SALES_PAGE_TITLE_CLASS}`}>
                {activeView?.name === "All" ? "All Subscriptions" : activeView?.name || "All Subscriptions"}{" "}
                <ChevronDown className="w-8 h-8 mb-2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 rounded-none">
              <div className="p-2">
                <Input
                  placeholder="Search views"
                  value={viewSearch}
                  onChange={(e) => setViewSearch(e.target.value)}
                  className="h-8"
                />
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
              <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/views/new")}>
                <Plus className="w-4 h-4 mr-2" /> New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Search subscriptions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-56 rounded-none bg-background"
            />
            <Link href="/sales/subscriptions/new">
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
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/import")}>
                  Import Subscriptions
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>Export Subscriptions</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportViewOpen(true)}>Export Current View</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/settings/dunning")}>
                  Dunning Management
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/settings/email-notifications")}>
                  Email Notifications
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/settings/reminders")}>
                  Reminders
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/sales/subscriptions/settings/webhooks")}>
                  Webhooks
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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

        {!loading && subscriptions.length === 0 && !debouncedQuery ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center py-16 px-4 text-center">
              <Repeat className="w-12 h-12 mb-6 text-muted-foreground/30" />
              <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground mb-2">Create Your First Subscription</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Ready to streamline your billing? Get started by creating highly customizable subscriptions that
                cater to any billing model, and manage recurring payments from your customers effortlessly.
              </p>
              <Link href="/sales/subscriptions/new">
                <Button className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer">
                  Create a Subscription
                </Button>
              </Link>
            </div>
            <SubscriptionOverview />
          </div>
        ) : (
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Number</TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">Customer Name</TableHead>
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
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-32" /></TableCell>
                        {activeColumns.map((key) => (
                          <TableCell key={key} className="px-8 py-7 border-r last:border-0 border-border/10"><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : subscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2 + activeColumns.length} className="py-16 text-center text-sm text-muted-foreground">
                        No subscriptions match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscriptions.map((s: any) => (
                      <TableRow
                        key={s._id}
                        className="group transition-colors duration-300 hover:bg-white/[0.015] cursor-pointer"
                        onClick={() => router.push(`/sales/subscriptions/${s._id}`)}
                      >
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-primary">
                          {s.number || "—"}
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                          {s.customerId?.header?.displayName || s.customerId?.header?.name || "—"}
                        </TableCell>
                        {activeColumns.map((key) => (
                          <TableCell key={key} className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                            {key === "status" ? (
                              <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[12px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[s.status] || "text-muted-foreground"}`}>
                                {s.status}
                              </Badge>
                            ) : (
                              formatValue(key, getPath(s, key))
                            )}
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

      <ExportSubscriptionsDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ExportCurrentViewDialog
        open={exportViewOpen}
        onOpenChange={setExportViewOpen}
        viewId={activeViewId}
        viewName={activeView?.name}
      />
    </DashboardLayout>
  );
}
