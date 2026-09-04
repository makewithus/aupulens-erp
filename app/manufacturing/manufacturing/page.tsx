"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Eye,
  Edit2,
  ChevronRight,
  CheckCircle2,
  Circle,
  XCircle,
  RotateCcw,
  AlertTriangle,
  ClipboardCheck,
  Package,
  Truck,
  Factory,
  FlaskConical,
  Ban,
  Search,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { ManufacturingOrderPopup } from "@/app/inventory/operations/popups/ManufacturingOrderPopup";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
import {
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
  PRODUCTION_FLOW_STEPS,
  type ProductionStatus,
  getNextProductionStatuses,
} from "@/lib/constants/statuses";

/* ------------------------------------------------------------------ */
/*  Step icon mapping                                                  */
/* ------------------------------------------------------------------ */
const STEP_ICONS: Record<string, any> = {
  [PRODUCTION_STATUS.DEMAND_FORECAST]: ClipboardCheck,
  [PRODUCTION_STATUS.PRODUCTION_ORDER]: Factory,
  [PRODUCTION_STATUS.MATERIAL_RESERVED]: Package,
  [PRODUCTION_STATUS.MATERIAL_ISSUED]: Truck,
  [PRODUCTION_STATUS.IN_PRODUCTION]: Factory,
  [PRODUCTION_STATUS.QC_PENDING]: FlaskConical,
  [PRODUCTION_STATUS.QC_PASSED]: CheckCircle2,
  [PRODUCTION_STATUS.QC_FAILED]: XCircle,
  [PRODUCTION_STATUS.REWORK]: RotateCcw,
  [PRODUCTION_STATUS.FINISHED]: CheckCircle2,
  [PRODUCTION_STATUS.CANCELLED]: Ban,
};

/* ------------------------------------------------------------------ */
/*  StatusBadge                                                        */
/* ------------------------------------------------------------------ */
function ProductionBadge({ status }: { status: ProductionStatus }) {
  const colors = PRODUCTION_STATUS_COLORS[status] || {
    bg: "bg-accent",
    text: "text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      {PRODUCTION_STATUS_LABELS[status] || status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Flow Progress Stepper (horizontal)                                 */
/* ------------------------------------------------------------------ */
function ProductionFlowStepper({
  current,
}: {
  current: ProductionStatus;
}) {
  const currentIdx = PRODUCTION_FLOW_STEPS.indexOf(current);
  // Handle special statuses not on the main line
  const specialStatuses: ProductionStatus[] = [
    PRODUCTION_STATUS.QC_FAILED,
    PRODUCTION_STATUS.REWORK,
    PRODUCTION_STATUS.CANCELLED,
  ];
  const isSpecial = specialStatuses.includes(current);

  // Compact: a slim row of progress dots (one per step, hover shows its name)
  // PLUS a single current-stage label — not the old 7x repeated icon+text+
  // chevron chain, which is what made this column look cluttered/noisy.
  const CurrentIcon = STEP_ICONS[current] || Circle;
  const currentLabel = PRODUCTION_STATUS_LABELS[current];

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1 shrink-0">
        {PRODUCTION_FLOW_STEPS.map((step, idx) => {
          const isDone = !isSpecial && currentIdx > idx;
          const isActive = !isSpecial && step === current;
          return (
            <span
              key={step}
              title={PRODUCTION_STATUS_LABELS[step]}
              className={`h-1.5 w-4 rounded-full transition-colors ${
                isActive ? "bg-blue-500" : isDone ? "bg-green-500" : "bg-muted"
              }`}
            />
          );
        })}
      </div>
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
          isSpecial ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
        {currentLabel}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Context-aware action buttons                                       */
/* ------------------------------------------------------------------ */
function ProductionActions({
  order,
  onAdvance,
}: {
  order: any;
  onAdvance: (id: string, next: ProductionStatus, extra?: any) => void;
}) {
  const current = (order.productionStatus ||
    PRODUCTION_STATUS.DEMAND_FORECAST) as ProductionStatus;
  const nextStatuses = getNextProductionStatuses(current);

  if (nextStatuses.length === 0) return null;

  const actionMap: Partial<
    Record<ProductionStatus, { label: string; variant: any; icon: any }>
  > = {
    [PRODUCTION_STATUS.PRODUCTION_ORDER]: {
      label: "Create Production Order",
      variant: "default",
      icon: Factory,
    },
    [PRODUCTION_STATUS.MATERIAL_RESERVED]: {
      label: "Reserve Materials",
      variant: "default",
      icon: Package,
    },
    [PRODUCTION_STATUS.MATERIAL_ISSUED]: {
      label: "Issue Materials",
      variant: "default",
      icon: Truck,
    },
    [PRODUCTION_STATUS.IN_PRODUCTION]: {
      label: current === PRODUCTION_STATUS.REWORK ? "Restart Production" : "Start Production",
      variant: "default",
      icon: Factory,
    },
    [PRODUCTION_STATUS.QC_PENDING]: {
      label: "Send to QC",
      variant: "default",
      icon: FlaskConical,
    },
    [PRODUCTION_STATUS.QC_PASSED]: {
      label: "QC Passed",
      variant: "default",
      icon: CheckCircle2,
    },
    [PRODUCTION_STATUS.QC_FAILED]: {
      label: "QC Failed",
      variant: "destructive",
      icon: XCircle,
    },
    [PRODUCTION_STATUS.FINISHED]: {
      label: "Mark Finished Goods",
      variant: "default",
      icon: CheckCircle2,
    },
    [PRODUCTION_STATUS.REWORK]: {
      label: "Send to Rework",
      variant: "outline",
      icon: RotateCcw,
    },
    [PRODUCTION_STATUS.CANCELLED]: {
      label: "Cancel",
      variant: "ghost",
      icon: Ban,
    },
  };

  return (
    <div className="flex flex-wrap gap-1">
      {nextStatuses.map((ns) => {
        const info = actionMap[ns] || {
          label: PRODUCTION_STATUS_LABELS[ns],
          variant: "outline",
          icon: ChevronRight,
        };
        const Icon = info.icon;
        return (
          <Button
            key={ns}
            size="sm"
            variant={info.variant as any}
            onClick={() => onAdvance(order._id, ns)}
            className="text-xs"
          >
            <Icon className="h-3.5 w-3.5 mr-1" />
            {info.label}
          </Button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */
const LIMIT = 10;

export default function ManufacturingPage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState<any[]>([]);
  // Separate, unpaginated fetch used only for the status-pill counts — those
  // need totals across every order, not just the current page.
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Resources
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
    demandSource: { type: "manual", notes: "" },
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchOrders();
    }
  }, [status, page, debouncedSearch, filterStatus, dateFrom, dateTo]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchAllOrdersForCounts();
      fetchResources();
    }
  }, [status]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterStatus, dateFrom, dateTo]);

  const fetchResources = async () => {
    try {
      const [pRes, uRes] = await Promise.all([
        fetch("/api/sales/products?limit=100"),
        fetch("/api/users"),
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

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterStatus !== "all") params.set("productionStatus", filterStatus);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/inventory/operations/manufacturing?${params.toString()}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllOrdersForCounts = async () => {
    try {
      const res = await fetch("/api/inventory/operations/manufacturing");
      const data = await res.json();
      setAllOrders(data.orders || []);
    } catch (e) {
      console.error("Failed to fetch order counts", e);
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

  const saveOrder = async () => {
    try {
      const url = formData._id
        ? `/api/inventory/operations/manufacturing/${formData._id}`
        : "/api/inventory/operations/manufacturing";
      const method = formData._id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Manufacturing order saved");
      setIsModalOpen(false);
      fetchOrders();
      fetchAllOrdersForCounts();
      fetchResources();
    } catch (e) {
      toast.error("Error saving order");
    }
  };

  /* ---- Advance production status ---- */
  const advanceProductionStatus = async (
    id: string,
    nextStatus: ProductionStatus,
    extra?: any,
  ) => {
    try {
      const res = await fetch(
        `/api/inventory/operations/manufacturing/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productionStatus: nextStatus, ...extra }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success(`Status updated to ${PRODUCTION_STATUS_LABELS[nextStatus]}`);
      fetchOrders();
      fetchAllOrdersForCounts();
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  /* ---- table rows: filtering/search/pagination is now server-side ---- */
  const filteredOrders = orders;

  /* ---- filter counts (computed off the full, unpaginated order set) ---- */
  const statusCounts = allOrders.reduce(
    (acc: Record<string, number>, o: any) => {
      const s = o.productionStatus || PRODUCTION_STATUS.DEMAND_FORECAST;
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing"
      pageName="Manufacturing"
      breadcrumbs={[
        { label: "Operations", href: "/manufacturing/dashboard" },
        { label: "Manufacturing Orders" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "manufacturing"}
      onSignOut={() => signOut({ callbackUrl: "/auth/manufacturing" })}
      onRefresh={() => {
        fetchOrders();
        fetchAllOrdersForCounts();
      }}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Manufacturing Orders</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Plan-to-Produce: Demand &rarr; Order &rarr; Reserve &rarr; Issue
              &rarr; Produce &rarr; QC &rarr; Finished Goods
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
            <Button onClick={() => handleAction(null, "create")}>
              <Plus className="h-4 w-4 mr-2" /> Create MO
            </Button>
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filterStatus === "all" ? "default" : "outline"}
            onClick={() => setFilterStatus("all")}
          >
            All ({allOrders.length})
          </Button>
          {Object.values(PRODUCTION_STATUS).map((ps) => {
            const count = statusCounts[ps] || 0;
            if (count === 0) return null;
            return (
              <Button
                key={ps}
                size="sm"
                variant={filterStatus === ps ? "default" : "outline"}
                onClick={() => setFilterStatus(ps)}
                className="text-xs"
              >
                {PRODUCTION_STATUS_LABELS[ps as ProductionStatus]} ({count})
              </Button>
            );
          })}
        </div>

        {/* Production Flow Legend */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">
              Production Flow
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
              {PRODUCTION_FLOW_STEPS.map((step, idx) => (
                <div key={step} className="flex items-center">
                  <span className="whitespace-nowrap">
                    {PRODUCTION_STATUS_LABELS[step]}
                  </span>
                  {idx < PRODUCTION_FLOW_STEPS.length - 1 && (
                    <ChevronRight className="h-3 w-3 mx-1 shrink-0" />
                  )}
                </div>
              ))}
              <span className="ml-2 text-muted-foreground/60">
                | QC Failed &rarr; Rework &rarr; Back to Production
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={5} columns={6} />
            ) : (
              // min-w keeps columns readable and lets the container scroll
              // horizontally (instead of squishing) on narrow widths — e.g. when
              // the AI assistant panel is open or on small screens.
              <div className="w-full overflow-x-auto">
                <Table className="w-full min-w-[880px] text-sm">
                  <TableHeader className="bg-muted/50 border-b">
                    <TableRow className="text-left text-muted-foreground">
                      <TableHead className="p-3 whitespace-nowrap">Reference</TableHead>
                      <TableHead className="p-3 whitespace-nowrap">Product</TableHead>
                      <TableHead className="p-3 text-right whitespace-nowrap">Qty</TableHead>
                      <TableHead className="p-3 whitespace-nowrap">Production Flow</TableHead>
                      <TableHead className="p-3 whitespace-nowrap">Status</TableHead>
                      <TableHead className="p-3 whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((o) => {
                      const ps = (o.productionStatus ||
                        PRODUCTION_STATUS.DEMAND_FORECAST) as ProductionStatus;
                      return (
                        <TableRow
                          key={o._id}
                          className="border-b hover:bg-muted/20 align-middle"
                        >
                          <TableCell className="p-3 font-medium whitespace-nowrap">
                            {o.header.name}
                          </TableCell>
                          <TableCell className="p-3">
                            {o.header?.productId?.header?.name || "-"}
                          </TableCell>
                          <TableCell className="p-3 text-right whitespace-nowrap">
                            {o.header.quantity}
                          </TableCell>
                          <TableCell className="p-3">
                            <ProductionFlowStepper current={ps} />
                          </TableCell>
                          <TableCell className="p-3">
                            <div className="flex flex-col items-start gap-1">
                              <ProductionBadge status={ps} />
                              {o.reworkCount > 0 && (
                                <span className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-0.5">
                                  <RotateCcw className="h-3 w-3" />
                                  Rework x{o.reworkCount}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="p-3">
                            <div className="flex flex-col items-start gap-1.5">
                              <ProductionActions
                                order={o}
                                onAdvance={advanceProductionStatus}
                              />
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleAction(o, "view")}
                                  title="View"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {ps !== PRODUCTION_STATUS.FINISHED &&
                                  ps !== PRODUCTION_STATUS.CANCELLED && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleAction(o, "edit")}
                                      title="Edit"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                  )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredOrders.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    {searchQuery || filterStatus !== "all" || dateFrom || dateTo
                      ? "No manufacturing orders match your search or filters."
                      : "No manufacturing orders."}
                  </div>
                )}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            fetchOrders();
            fetchAllOrdersForCounts();
          }
        }}
        title={formData?.header?.name || "New Manufacturing Order"}
        className="w-[80vw] max-w-[1400px]"
        footer={
          isViewOnly ? (
            <Button onClick={() => setIsModalOpen(false)}>Close</Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveOrder}>Save</Button>
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
