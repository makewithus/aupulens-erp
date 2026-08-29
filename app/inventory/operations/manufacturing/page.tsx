"use client";

import { useEffect, useState, useMemo } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  RefreshCw,
  Eye,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ManufacturingOrderPopup } from "@/app/inventory/operations/popups/ManufacturingOrderPopup";
import { toast } from "sonner";
import {
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_LABELS,
  type ProductionStatus,
  getNextProductionStatuses,
} from "@/lib/constants/statuses";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";

interface ManufacturingOrder {
  _id: string;
  header: {
    name: string;
    quantity: number;
    productId?: {
      header?: {
        name?: string;
      };
    };
  };
  productionStatus: string;
  reworkCount?: number;
}

const statusColors: Record<string, string> = {
  [PRODUCTION_STATUS.DEMAND_FORECAST]: "text-muted-foreground",
  [PRODUCTION_STATUS.PRODUCTION_ORDER]: "text-blue-500",
  [PRODUCTION_STATUS.MATERIAL_RESERVED]: "text-indigo-500",
  [PRODUCTION_STATUS.MATERIAL_ISSUED]: "text-cyan-500",
  [PRODUCTION_STATUS.IN_PRODUCTION]: "text-amber-500",
  [PRODUCTION_STATUS.QC_PENDING]: "text-orange-500",
  [PRODUCTION_STATUS.QC_PASSED]: "text-emerald-500",
  [PRODUCTION_STATUS.QC_FAILED]: "text-red-500",
  [PRODUCTION_STATUS.REWORK]: "text-rose-500",
  [PRODUCTION_STATUS.FINISHED]: "text-emerald-500",
  [PRODUCTION_STATUS.CANCELLED]: "text-muted-foreground",
};

const LIMIT = 10;

export default function ManufacturingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  // Separate, unpaginated fetch used only for the KPI cards — those need
  // totals across every matching order, not just the current page of 10.
  const [allOrders, setAllOrders] = useState<ManufacturingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  const defaultFormData = {
    header: {
      name: "",
      productId: "",
      quantity: 1,
      scheduledDate: new Date(),
      responsibleId: "",
    },
    components_tab: [],
    miscellaneous: {
      operationTypeId: "Manufacturing",
      source: "",
      projectId: "",
      notes: "",
    },
    status: "draft",
    productionStatus: PRODUCTION_STATUS.DEMAND_FORECAST,
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page, debouncedSearch, statusFilter]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchAllOrdersForStats();
      fetchResources();
    }
  }, [status]);

  const fetchResources = async () => {
    try {
      const [pRes, uRes] = await Promise.all([
        cachedFetch("/api/sales/products?limit=100"),
        cachedFetch("/api/users"),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setProducts(d.items || []);
      }
      if (uRes.ok) {
        const d = await uRes.json();
        setUsers(d.users || []);
      }
    } catch (e) {
      console.error("Failed to fetch resources", e);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("productionStatus", statusFilter);
      const res = await cachedFetch(`/api/inventory/operations/manufacturing?${params.toString()}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllOrdersForStats = async () => {
    try {
      const res = await cachedFetch("/api/inventory/operations/manufacturing");
      const data = await res.json();
      setAllOrders(data.orders || []);
    } catch (e) {
      console.error("Failed to load manufacturing stats", e);
    }
  };

  const handleAction = (mo: any, action: "view" | "edit" | "create") => {
    if (action === "create") {
      setFormData(JSON.parse(JSON.stringify(defaultFormData)));
      setIsViewOnly(false);
    } else {
      setFormData(mo);
      setIsViewOnly(action === "view");
    }
    setIsModalOpen(true);
  };

  // AI-native pre-fill: open the Manufacturing Order modal with AI-extracted
  // details. Product/responsible are id-selects, so they're surfaced as hints.
  useAiPrefill("manufacturing_order", (p) => {
    const d: any = p.data || {};
    const base = JSON.parse(JSON.stringify(defaultFormData));
    const comps = (Array.isArray(d.components) ? d.components : [])
      .filter((c: any) => c && (c.productId || c.name))
      .map((c: any) => ({ productId: c.productId || "", toConsume: Number(c.qty) > 0 ? Number(c.qty) : 1, consumed: 0 }));
    setFormData({
      ...base,
      header: {
        ...base.header,
        name: d.product_name ? String(d.product_name) : base.header.name,
        productId: d.productId ? String(d.productId) : base.header.productId,
        quantity: Number(d.quantity) > 0 ? Number(d.quantity) : base.header.quantity,
        scheduledDate: d.scheduled_date ? new Date(d.scheduled_date) : base.header.scheduledDate,
      },
      components_tab: comps.length ? comps : base.components_tab,
      miscellaneous: { ...base.miscellaneous, ...(d.note ? { notes: String(d.note) } : {}) },
    });
    setIsViewOnly(false);
    setIsModalOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 10000 });
  });

  const saveOrder = async () => {
    setIsSubmitting(true);
    try {
      const url = formData._id
        ? `/api/inventory/operations/manufacturing/${formData._id}`
        : "/api/inventory/operations/manufacturing";
      const method = formData._id ? "PATCH" : "POST";
      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Saved");
      setIsModalOpen(false);
      fetchOrders();
      fetchAllOrdersForStats();
      fetchResources();
    } catch (e) {
      toast.error("Error saving");
    } finally {
      setIsSubmitting(false);
    }
  };

  const advanceProductionStatus = async (
    id: string,
    nextStatus: ProductionStatus,
  ) => {
    try {
      const res = await cachedFetch(
        `/api/inventory/operations/manufacturing/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productionStatus: nextStatus }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success(
        `Status → ${PRODUCTION_STATUS_LABELS[nextStatus]}`,
      );
      fetchOrders();
      fetchAllOrdersForStats();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  const getNextAction = (order: ManufacturingOrder) => {
    const next = getNextProductionStatuses(
      order.productionStatus as ProductionStatus
    ).filter(
      (status) => status !== PRODUCTION_STATUS.CANCELLED
    )[0];

    return next
      ? PRODUCTION_STATUS_LABELS[next]
      : undefined;
  };

  const handleContinue = (order: ManufacturingOrder) => {
    const next = getNextProductionStatuses(
      order.productionStatus as ProductionStatus
    ).filter(
      (status) => status !== PRODUCTION_STATUS.CANCELLED
    )[0];

    if (next) {
      advanceProductionStatus(order._id, next);
    }
  };

  // orders is already filtered + paginated server-side.
  const filteredOrders = orders;

  // Compute KPIs from the full (unpaginated) matching set.
  const kpis = useMemo(() => {
    const totalCount = allOrders.length;
    const inProduction = allOrders.filter(
      (o) => o.productionStatus === PRODUCTION_STATUS.IN_PRODUCTION
    ).length;
    const qcPending = allOrders.filter(
      (o) => o.productionStatus === PRODUCTION_STATUS.QC_PENDING
    ).length;
    const completed = allOrders.filter(
      (o) => o.productionStatus === PRODUCTION_STATUS.FINISHED
    ).length;

    return {
      total: totalCount,
      inProduction,
      qcPending,
      completed,
    };
  }, [allOrders]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory"
      pageName="Manufacturing"
      breadcrumbs={[
        { label: "Operations", href: "/inventory/summary" },
        { label: "Manufacturing" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={() => { fetchOrders(); fetchAllOrdersForStats(); }}
      profilePath="/inventory/profile"
    >
      <div className="space-y-6">
        {/* Page Header Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Manufacturing Orders
            </h1>
          </div>
          <Button
            onClick={() => handleAction(null, "create")}
            className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[13px] uppercase tracking-wider rounded-none cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" /> Create MO
          </Button>
        </div>

        {/* HR style Stats row */}
        <div className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Total Orders"
              value={kpis.total}
              visual={<UsersGraph />}
            />
            <StatCard
              title="In Production"
              value={kpis.inProduction}
              visual={<ActivePulse />}
            />
            <StatCard
              title="QC Pending"
              value={kpis.qcPending}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Completed MOs"
              value={kpis.completed}
              visual={<ActivePulse />}
            />
          </div>

          {/* Unified Card matching HR Employee structure */}
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            {/* Card Header & Controls Toolbar */}
            <div className="border-b border-border/20 px-8 py-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="shrink-0">
                  <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                    All Orders
                  </h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    {total}{" "}
                    {total === 1 ? "Order" : "Orders"}
                  </p>
                </div>

                {/* Toolbar Controls */}
                <div className="w-full max-w-3xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search orders or products..."
                      className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none transition-all duration-300 placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:bg-white/[0.015] focus-visible:ring-0 w-full text-foreground"
                    />
                  </div>

                  {/* Status Select Filter */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 w-full md:w-[210px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
                      <SelectValue placeholder="Production Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="all">All Statuses</SelectItem>
                      {Object.values(PRODUCTION_STATUS).map((status) => (
                        <SelectItem key={status} value={status} className="rounded-none">
                          {PRODUCTION_STATUS_LABELS[status] || status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Table Content */}
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Reference
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Product
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Quantity
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Reworks
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Production Status
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Suggested Action
                    </TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-5 w-36" />
                          </div>
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-48" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-8 w-28" />
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right">
                          <div className="flex justify-end gap-1">
                            <Skeleton className="h-8 w-8" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-24 text-center">
                        <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                        <h3 className="text-lg font-medium text-foreground">
                          {searchQuery || statusFilter !== "all"
                            ? "No orders match your filters"
                            : "No manufacturing orders found"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {searchQuery || statusFilter !== "all"
                            ? "Try adjusting your search or filters."
                            : "Create your first manufacturing order to begin production."}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => {
                      const productName =
                        order.header.productId?.header?.name ?? "-";
                      const nextAction = getNextAction(order);
                      const canContinue =
                        order.productionStatus !== PRODUCTION_STATUS.FINISHED &&
                        order.productionStatus !== PRODUCTION_STATUS.CANCELLED;

                      return (
                        <TableRow
                          key={order._id}
                          className="group transition-colors duration-300 hover:bg-white/[0.015]"
                        >
                          {/* Reference */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-foreground">
                            {order.header.name}
                          </TableCell>

                          {/* Product */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                            {productName}
                          </TableCell>

                          {/* Quantity */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80 font-mono">
                            {order.header.quantity}
                          </TableCell>

                          {/* Reworks */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80 font-mono">
                            {order.reworkCount ?? 0}
                          </TableCell>

                          {/* Production Status */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            <Badge
                              className={`
                                rounded-none
                                border-0
                                bg-transparent
                                px-0
                                font-mono
                                text-[12px]
                                uppercase
                                tracking-[0.12em]
                                hover:bg-transparent
                                shadow-none
                                ${statusColors[order.productionStatus] || "text-muted-foreground"}
                              `}
                            >
                              {PRODUCTION_STATUS_LABELS[order.productionStatus as ProductionStatus] || order.productionStatus}
                            </Badge>
                          </TableCell>

                          {/* Suggested Action */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            {nextAction && canContinue ? (
                              <Button
                                size="sm"
                                onClick={() => handleContinue(order)}
                                className="h-8 rounded-none bg-primary text-primary-foreground text-[11px] font-mono uppercase tracking-wider hover:bg-primary/95 px-3 cursor-pointer inline-flex items-center gap-1.5"
                              >
                                {nextAction}
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            ) : (
                              <span className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                                None
                              </span>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="px-8 py-7 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAction(order, "view")}
                                className="h-8 w-8 rounded-none hover:bg-white/5 text-foreground cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-8 py-4 border-t border-border/40">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">
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
      </div>

      {/* Popup Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) { fetchOrders(); fetchAllOrdersForStats(); }
        }}
        title={formData?.header?.name || "New MO"}
        className="w-[80vw] max-w-[1400px]"
        footer={
          isViewOnly ? (
            <Button
              variant="outline"
              className="rounded-none cursor-pointer"
              onClick={() => setIsModalOpen(false)}
            >
              Close
            </Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="rounded-none cursor-pointer"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={saveOrder}
                disabled={isSubmitting}
                className="rounded-none cursor-pointer"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </div>
          )
        }
      >
        {formData && (
          <ManufacturingOrderPopup
            formData={formData}
            setFormData={setFormData}
            isViewOnly={isViewOnly}
            products={products}
            users={users}
            onRefresh={fetchOrders}
            currentUser={session?.user}
          />
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
