"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Manufacturing Orders</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Demand &rarr; Order &rarr; Reserve &rarr; Issue &rarr; Produce
              &rarr; QC &rarr; Finished Goods
            </p>
          </div>
          <Button onClick={() => handleAction(null, "create")}>
            <Plus className="h-4 w-4 mr-2" /> Create MO
          </Button>
        </div>

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
                      <th className="p-3">Production Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const ps = (o.productionStatus ||
                        PRODUCTION_STATUS.DEMAND_FORECAST) as ProductionStatus;
                      const nextStatuses = getNextProductionStatuses(ps);
                      return (
                        <tr
                          key={o._id}
                          className="border-b hover:bg-muted/20"
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
                          <td className="p-3">
                            <ProductionBadge status={ps} />
                            {o.reworkCount > 0 && (
                              <span className="ml-2 text-[10px] text-orange-600 dark:text-orange-400">
                                <RotateCcw className="inline h-3 w-3 mr-0.5" />
                                x{o.reworkCount}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right flex justify-end gap-1 flex-wrap">
                            {nextStatuses
                              .filter(
                                (ns) =>
                                  ns !== PRODUCTION_STATUS.CANCELLED,
                              )
                              .slice(0, 2)
                              .map((ns) => (
                                <Button
                                  key={ns}
                                  size="sm"
                                  variant={
                                    ns === PRODUCTION_STATUS.QC_FAILED
                                      ? "destructive"
                                      : "outline"
                                  }
                                  className="text-xs"
                                  onClick={() =>
                                    advanceProductionStatus(o._id, ns)
                                  }
                                >
                                  {PRODUCTION_STATUS_LABELS[ns]}
                                </Button>
                              ))}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleAction(o, "view")}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {ps !== PRODUCTION_STATUS.FINISHED &&
                              ps !== PRODUCTION_STATUS.CANCELLED && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleAction(o, "edit")}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {orders.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground">
                    No manufacturing orders.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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
