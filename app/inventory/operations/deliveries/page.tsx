"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Button } from "@/components/ui/button";
import {
  Plus,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { StockTransferPopup } from "@/app/inventory/operations/popups/StockTransferPopup";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import { TransferList } from "@/components/inventory/transfer/TransferList";

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

  const getNextAction = (transfer: InventoryTransfer) => {
  switch (transfer.status) {
    case "draft":
      return "Reserve Inventory";

    case "pending_approval":
      if (transfer.pickStatus !== "picked")
        return "Confirm Pick";

      if (transfer.qcStatus !== "packed")
        return "Confirm Pack";

      return "Approve";

    case "approved":
      return "Dispatch";

    case "posted":
      return "Close Delivery";

    default:
      return undefined;
  }
};

const getCurrentStep = (transfer: InventoryTransfer) => {
  switch (transfer.status) {
    case "draft":
      return 0;

    case "pending_approval":
      if (transfer.pickStatus !== "picked") return 2;

      if (transfer.qcStatus !== "packed") return 3;

      return 4;

    case "approved":
      return 4;

    case "posted":
      return 5;

    case "closed":
      return 6;

    default:
      return 0;
  }
};

const statusLabels = {
  draft: "Draft",
  pending_approval: "Picking & Packing",
  approved: "Approved",
  posted: "Dispatched",
  closed: "Delivered",
};

const workflowSteps = [
  { key: "draft", label: "Draft" },
  { key: "reserve", label: "Reserve" },
  { key: "pick", label: "Pick" },
  { key: "pack", label: "Pack" },
  { key: "approved", label: "Approve" },
  { key: "posted", label: "Dispatch" },
  { key: "closed", label: "Close" },
];

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

{loading ? (
  <TableSkeleton rows={4} columns={1} />
) : (
  <TransferList
    partnerLabel="Customer"
    emptyTitle="No outgoing deliveries"
    emptyDescription="Create a delivery to begin shipping products."

    transfers={transfers}

    workflowSteps={workflowSteps}
    statusLabels={statusLabels}
    getCurrentStep={getCurrentStep}
    getNextAction={getNextAction}

    onView={(transfer) => handleAction(transfer, "view")}

    onContinue={(transfer) => {
      switch (transfer.status) {
        case "draft":
          updateStatus(transfer._id, "pending_approval");
          break;

        case "pending_approval":
          if (transfer.pickStatus !== "picked") {
            updateSubStatus(transfer._id, {
              pickStatus: "picked",
            });
          } else if (transfer.packStatus !== "packed") {
            updateSubStatus(transfer._id, {
              packStatus: "packed",
            });
          } else {
            updateStatus(transfer._id, "approved");
          }
          break;

        case "approved":
          updateStatus(transfer._id, "posted");
          break;

        case "posted":
          updateStatus(transfer._id, "closed");
          break;
      }
    }}
  />
)}
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
