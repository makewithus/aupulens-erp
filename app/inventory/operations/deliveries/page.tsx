"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Eye,
  Edit2,
  CheckCircle,
  Clock,
  Undo2,
  PackageCheck,
  Package,
  Truck,
  ClipboardCheck,
  ArrowRight,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { StockTransferPopup } from "@/app/inventory/operations/popups/StockTransferPopup";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";

export default function DeliveriesPage() {
  const { data: session, status } = useSession();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);

  // Resources
  const [partners, setPartners] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  // Customer Modal
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [partnerFormData, setPartnerFormData] = useState<any>({
    header: { name: "", company_type: "company", is_company: true },
    contact_details: { email: "", phone: "", mobile: "", website: "" },
    address_tab: { type: "contact", street: "", city: "", zip: "" },
    sales_purchase_tab: {},
    accounting_tab: {},
  });
  const [partnerTab, setPartnerTab] = useState("address");

  const defaultFormData = {
    header: { name: "", operationType: "outgoing", scheduledDate: new Date() },
    operations_tab: [],
    additional_info: {},
    status: "draft",
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchTransfers();
      fetchResources();
    }
  }, [status]);

  const fetchResources = async () => {
    try {
      const [pRes, cRes, uRes] = await Promise.all([
        fetch("/api/sales/products?limit=100"),
        fetch("/api/sales/customers"),
        fetch("/api/users"),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setProducts(d.items || []);
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setPartners(d.items || []);
      }
      if (uRes.ok) {
        const d = await uRes.json();
        setUsers(d.users || []);
      }
    } catch (e) {
      console.error("Failed to fetch resources", e);
    }
  };

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        "/api/inventory/operations/transfers?type=outgoing",
      );
      const data = await res.json();
      setTransfers(data.transfers || []);
    } catch (e) {
      toast.error("Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (t: any, action: "view" | "edit" | "create") => {
    if (action === "create") {
      setFormData(JSON.parse(JSON.stringify(defaultFormData)));
      setIsViewOnly(false);
    } else {
      setFormData(t);
      setIsViewOnly(action === "view");
    }
    setIsModalOpen(true);
  };

  const handleReturn = (t: any) => {
    const returnData = {
      header: {
        ...t.header,
        name: "",
        operationType: "incoming",
        sourceDocument: `Return of ${t.header.name}`,
        scheduledDate: new Date(),
      },
      operations_tab: t.operations_tab.map((op: any) => ({
        productId: op.productId._id || op.productId,
        demand: op.done,
        done: 0,
      })),
      additional_info: t.additional_info,
      status: "draft",
      tenantId: t.tenantId,
    };

    setFormData(returnData);
    setIsViewOnly(false);
    setIsModalOpen(true);
    toast.info("Created Return Draft. Please Review and Save.");
  };

  const saveTransfer = async () => {
    try {
      const url = formData._id
        ? `/api/inventory/operations/transfers/${formData._id}`
        : "/api/inventory/operations/transfers";
      const method = formData._id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Saved");
      setIsModalOpen(false);
      fetchTransfers();
      fetchResources();
    } catch (e) {
      toast.error("Error saving");
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/inventory/operations/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Status updated");
      fetchTransfers();
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  /** Update sub-status fields (pickStatus / packStatus) without changing document status */
  const updateSubStatus = async (
    id: string,
    payload: Record<string, any>,
  ) => {
    try {
      const res = await fetch(`/api/inventory/operations/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast.success("Updated");
      fetchTransfers();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  const handleSavePartner = async () => {
    try {
      const res = await fetch("/api/sales/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partnerFormData),
      });
      if (!res.ok) throw new Error("Failed to create customer");
      const created = await res.json();
      toast.success("Customer created");
      setIsPartnerModalOpen(false);
      fetchResources();
      if (formData) {
        setFormData({
          ...formData,
          header: { ...formData.header, partnerId: created.customer._id },
        });
      }
    } catch (e) {
      toast.error("Failed to create customer");
    }
  };

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory"
      pageName="Deliveries"
      breadcrumbs={[
        { label: "Operations", href: "/inventory/summary" },
        { label: "Deliveries" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={fetchTransfers}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Deliveries</h1>
          <Button onClick={() => handleAction(null, "create")}>
            <Plus className="h-4 w-4 mr-2" /> New Delivery
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={5} columns={5} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="p-3">Reference</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t) => (
                      <tr key={t._id} className="border-b hover:bg-muted/20">
                        <td className="p-3 font-medium">{t.header.name}</td>
                        <td className="p-3">
                          {t.header.partnerId?.header?.name ||
                            t.header.partnerId?.name ||
                            t.header.partnerName ||
                            "-"}
                        </td>
                        <td className="p-3">
                          {new Date(
                            t.header.scheduledDate,
                          ).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              t.status === "closed"
                                ? "default"
                                : t.status === "posted"
                                  ? "default"
                                  : t.status === "approved"
                                    ? "outline"
                                    : "secondary"
                            }
                          >
                            {t.status === "pending_approval"
                              ? `Pending (Pick: ${t.pickStatus || "pending"}, Pack: ${t.packStatus || "pending"})`
                              : t.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right flex justify-end gap-1 flex-wrap">
                          {/* ① Draft → Check & Reserve Inventory */}
                          {t.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() =>
                                updateStatus(t._id, "pending_approval")
                              }
                            >
                              <ClipboardCheck className="h-3 w-3 mr-1" /> Check
                              & Reserve
                            </Button>
                          )}

                          {/* ② pending_approval → Confirm Picked */}
                          {t.status === "pending_approval" &&
                            t.pickStatus !== "picked" && (
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={() =>
                                  updateSubStatus(t._id, {
                                    pickStatus: "picked",
                                  })
                                }
                              >
                                <PackageCheck className="h-3 w-3 mr-1" />{" "}
                                Confirm Picked
                              </Button>
                            )}

                          {/* ③ pending_approval + picked → Confirm Packed */}
                          {t.status === "pending_approval" &&
                            t.pickStatus === "picked" &&
                            t.packStatus !== "packed" && (
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                                onClick={() =>
                                  updateSubStatus(t._id, {
                                    packStatus: "packed",
                                  })
                                }
                              >
                                <Package className="h-3 w-3 mr-1" /> Confirm
                                Packed
                              </Button>
                            )}

                          {/* ④ pending_approval + picked + packed → Approve */}
                          {t.status === "pending_approval" &&
                            t.pickStatus === "picked" &&
                            t.packStatus === "packed" && (
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() =>
                                  updateStatus(t._id, "approved")
                                }
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />{" "}
                                Approve
                              </Button>
                            )}

                          {/* ⑤ approved → Dispatch */}
                          {t.status === "approved" && (
                            <Button
                              size="sm"
                              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => updateStatus(t._id, "posted")}
                            >
                              <Truck className="h-3 w-3 mr-1" /> Dispatch
                            </Button>
                          )}

                          {/* ⑥ posted → Close & Reduce Stock */}
                          {t.status === "posted" && (
                            <Button
                              size="sm"
                              className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                              onClick={() => updateStatus(t._id, "closed")}
                            >
                              <ArrowRight className="h-3 w-3 mr-1" /> Close &
                              Reduce Stock
                            </Button>
                          )}

                          {/* Return (only when closed) */}
                          {t.status === "closed" && (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => handleReturn(t)}
                              title="Return"
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleAction(t, "view")}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {t.status !== "closed" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => handleAction(t, "edit")}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transfers.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground">
                    No deliveries found.
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
          if (!open) fetchTransfers();
        }}
        title={formData?.header?.name || "New Delivery"}
        className="w-[80vw] max-w-[1400px]"
        footer={
          isViewOnly ? (
            <Button onClick={() => setIsModalOpen(false)}>Close</Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveTransfer}>Save</Button>
            </div>
          )
        }
      >
        {formData && (
          <StockTransferPopup
            formData={formData}
            setFormData={setFormData}
            isViewOnly={isViewOnly}
            operationType="outgoing"
            partners={partners}
            products={products}
            users={users}
            onAddPartner={() => setIsPartnerModalOpen(true)}
            onRefresh={fetchTransfers}
            currentUser={session?.user}
          />
        )}
      </ModularModal>

      {/* Customer/Partner Modal */}
      <ModularModal
        open={isPartnerModalOpen}
        onOpenChange={setIsPartnerModalOpen}
        title="Create Customer"
        className="max-w-4xl"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsPartnerModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSavePartner}>Save Customer</Button>
          </div>
        }
      >
        <CustomerPopupContent
          formData={partnerFormData}
          setFormData={setPartnerFormData}
          activeTab={partnerTab}
          setActiveTab={setPartnerTab}
          isViewOnly={false}
          users={users}
        />
      </ModularModal>
    </DashboardLayout>
  );
}
