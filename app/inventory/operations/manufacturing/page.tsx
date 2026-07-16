"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Eye,
  Edit2,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Factory,
  FlaskConical,
  Package,
  Truck,
  ClipboardCheck,
  Ban,
  Circle,
} from "lucide-react";
import type { ManufacturingOrder } from "@/types/manufacturing";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ManufacturingOrderPopup } from "@/app/inventory/operations/popups/ManufacturingOrderPopup";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import {
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
  PRODUCTION_FLOW_STEPS,
  type ProductionStatus,
  getNextProductionStatuses,
} from "@/lib/constants/statuses";
import { ManufacturingList } from "@/components/inventory/manufacturing/ManufacturingList";
import { FinancePageHeader } from "@/components/finance/FinancePageHeader";

/* ---- Step icon map ---- */
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

export default function ManufacturingPage() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);

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
      toast.error("Failed to load orders");
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
      toast.success("Saved");
      setIsModalOpen(false);
      fetchOrders();
      fetchResources();
    } catch (e) {
      toast.error("Error saving");
    }
  };

  const advanceProductionStatus = async (
    id: string,
    nextStatus: ProductionStatus,
  ) => {
    try {
      const res = await fetch(
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
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

const workflowSteps = [
  {
    key: PRODUCTION_STATUS.DEMAND_FORECAST,
    label: "Forecast",
  },
  {
    key: PRODUCTION_STATUS.PRODUCTION_ORDER,
    label: "Order",
  },
  {
    key: PRODUCTION_STATUS.MATERIAL_RESERVED,
    label: "Reserve",
  },
  {
    key: PRODUCTION_STATUS.MATERIAL_ISSUED,
    label: "Issue",
  },
  {
    key: PRODUCTION_STATUS.IN_PRODUCTION,
    label: "Production",
  },
  {
    key: PRODUCTION_STATUS.QC_PENDING,
    label: "QC",
  },
  {
    key: PRODUCTION_STATUS.FINISHED,
    label: "Finished",
  },
];

const workflowIndex: Record<string, number> = {
  [PRODUCTION_STATUS.DEMAND_FORECAST]: 0,
  [PRODUCTION_STATUS.PRODUCTION_ORDER]: 1,
  [PRODUCTION_STATUS.MATERIAL_RESERVED]: 2,
  [PRODUCTION_STATUS.MATERIAL_ISSUED]: 3,
  [PRODUCTION_STATUS.IN_PRODUCTION]: 4,

  // QC states all map to the QC step
  [PRODUCTION_STATUS.QC_PENDING]: 5,
  [PRODUCTION_STATUS.QC_PASSED]: 5,
  [PRODUCTION_STATUS.QC_FAILED]: 5,
  [PRODUCTION_STATUS.REWORK]: 5,

  [PRODUCTION_STATUS.FINISHED]: 6,

  // Cancelled stays wherever it was
  [PRODUCTION_STATUS.CANCELLED]: 0,
};

const getCurrentStep = (order: any) =>
  workflowIndex[order.productionStatus] ?? 0;

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
      onRefresh={fetchOrders}
    >
      <div className="space-y-6">
        <FinancePageHeader
          title="Manufacturing Orders"
          description="Production orders that consume inventory to build finished goods."
          actions={
            <Button onClick={() => handleAction(null, "create")}>
              <Plus className="h-4 w-4 mr-2" /> Create MO
            </Button>
          }
        />

        {loading ? (
          <TableSkeleton rows={4} columns={2} />
        ) : (
          <ManufacturingList
            orders={orders}
            workflowSteps={workflowSteps}
            statusLabels={PRODUCTION_STATUS_LABELS}
            getCurrentStep={getCurrentStep}
            getNextAction={getNextAction}
            onView={(order) => handleAction(order, "view")}
            onContinue={(order) => {
              const next = getNextProductionStatuses(
                order.productionStatus as ProductionStatus
              )
                .filter(
                  (status) => status !== PRODUCTION_STATUS.CANCELLED
                )[0];

              if (next) {
                advanceProductionStatus(order._id, next);
              }
            }}
          />
        )}
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) fetchOrders();
        }}
        title={formData?.header?.name || "New MO"}
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
