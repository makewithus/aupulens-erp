"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ManufacturingOrderPopup } from "@/app/inventory/operations/popups/ManufacturingOrderPopup";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
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
    bg: "bg-gray-100",
    text: "text-gray-600",
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

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {PRODUCTION_FLOW_STEPS.map((step, idx) => {
        const Icon = STEP_ICONS[step] || Circle;
        const label = PRODUCTION_STATUS_LABELS[step];
        const isDone = !isSpecial && currentIdx > idx;
        const isActive = step === current;
        const isFuture = !isDone && !isActive;

        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap ${
                isActive
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                  : isDone
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isDone ? "text-green-500" : ""}`} />
              {label}
            </div>
            {idx < PRODUCTION_FLOW_STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />
            )}
          </div>
        );
      })}
      {isSpecial && (
        <div className="flex items-center">
          <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />
          <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
            {(() => {
              const Icon = STEP_ICONS[current] || Circle;
              return <Icon className="h-3.5 w-3.5" />;
            })()}
            {PRODUCTION_STATUS_LABELS[current]}
          </div>
        </div>
      )}
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
export default function ManufacturingPage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
      fetchResources();
    }
  }, [status]);

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
      const res = await fetch("/api/inventory/operations/manufacturing");
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (e) {
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
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
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  /* ---- filter ---- */
  const filteredOrders =
    filterStatus === "all"
      ? orders
      : orders.filter((o) => o.productionStatus === filterStatus);

  /* ---- filter counts ---- */
  const statusCounts = orders.reduce(
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
      onRefresh={fetchOrders}
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
          <Button onClick={() => handleAction(null, "create")}>
            <Plus className="h-4 w-4 mr-2" /> Create MO
          </Button>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filterStatus === "all" ? "default" : "outline"}
            onClick={() => setFilterStatus("all")}
          >
            All ({orders.length})
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="p-3">Reference</th>
                      <th className="p-3">Product</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3">Production Flow</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((o) => {
                      const ps = (o.productionStatus ||
                        PRODUCTION_STATUS.DEMAND_FORECAST) as ProductionStatus;
                      return (
                        <tr
                          key={o._id}
                          className="border-b hover:bg-muted/20 align-top"
                        >
                          <td className="p-3 font-medium">
                            {o.header.name}
                          </td>
                          <td className="p-3">
                            {o.header?.productId?.header?.name || "-"}
                          </td>
                          <td className="p-3 text-right">
                            {o.header.quantity}
                          </td>
                          <td className="p-3 max-w-md">
                            <ProductionFlowStepper current={ps} />
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1">
                              <ProductionBadge status={ps} />
                              {o.reworkCount > 0 && (
                                <span className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-0.5">
                                  <RotateCcw className="h-3 w-3" />
                                  Rework x{o.reworkCount}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1.5">
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
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredOrders.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No manufacturing orders
                    {filterStatus !== "all"
                      ? ` with status "${PRODUCTION_STATUS_LABELS[filterStatus as ProductionStatus]}"`
                      : ""}
                    .
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
          if (!open) fetchOrders();
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
