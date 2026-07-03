"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  ArrowRight,
  Undo2,
  ShieldCheck,
  ShieldX,
  FileText,
  PackageCheck,
  BellRing,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { StockTransferPopup } from "@/app/inventory/operations/popups/StockTransferPopup";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import type { InventoryTransfer } from "@/types/inventory";
import { TransferList } from "@/components/inventory/transfer/TransferList";

export default function ReceiptsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Initial State for New Receipt
  const defaultFormData = {
    header: {
      name: "",
      operationType: "incoming",
      scheduledDate: new Date(),
    },
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
        "/api/inventory/operations/transfers?type=incoming",
      );
      const data = await res.json();
      setTransfers(data.transfers || []);
    } catch (e) {
      toast.error("Failed to load receipts");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setFormData(JSON.parse(JSON.stringify(defaultFormData)));
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  const handleEdit = (t: any) => {
    setFormData(t);
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  const handleView = (t: any) => {
    setFormData(t);
    setIsViewOnly(true);
    setIsModalOpen(true);
  };

  const handleReturn = (t: any) => {
    const returnData = {
      header: {
        ...t.header,
        name: "", // API generates new name
        operationType: "outgoing", // Reverse of incoming
        sourceDocument: `Return of ${t.header.name}`,
        scheduledDate: new Date(),
      },
      operations_tab: t.operations_tab.map((op: any) => ({
        productId: op.productId._id || op.productId,
        demand: op.done, // Return quantity = Done quantity
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

  const workflowSteps = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Receive" },
  { key: "qc", label: "QC" },
  { key: "approved", label: "GRN" },
  { key: "posted", label: "Stock" },
  { key: "closed", label: "Close" },
];

const statusLabels = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  posted: "Stock Updated",
  closed: "Closed",
};

const getCurrentStep = (transfer: InventoryTransfer) => {
  switch (transfer.status) {
    case "draft":
      return 0;

    case "pending_approval":
      return 2;

    case "approved":
      return 3;

    case "posted":
      return 4;

    case "closed":
      return 5;

    default:
      return 0;
  }
};

const getNextAction = (transfer: InventoryTransfer) => {
  switch (transfer.status) {
    case "draft":
      return "Receive Goods";

    case "pending_approval":
      if (transfer.qcStatus === "pending")
        return "Pass QC";

      if (transfer.qcStatus === "passed")
        return "Generate GRN";

      if (transfer.qcStatus === "failed")
        return "Retry QC";

      return undefined;

    case "approved":
      return "Update Stock";

    case "posted":
      return "Close Receipt";

    default:
      return undefined;
  }
};

  const saveTransfer = async (statusOverride?: string) => {
    setIsSubmitting(true);
    try {
      const data = { ...formData };
      if (statusOverride) data.status = statusOverride;

      const url = data._id
        ? `/api/inventory/operations/transfers/${data._id}`
        : "/api/inventory/operations/transfers";
      const method = data._id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast.success("Receipt saved");
      setIsModalOpen(false);
      fetchTransfers();
      fetchResources(); // Refresh resources
    } catch (e) {
      toast.error("Error saving receipt");
    } finally {
      setIsSubmitting(false);
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
      toast.success(`Status updated`);
      fetchTransfers();
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    }
  };

  /** Update sub-status fields (qcStatus) without changing document status */
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
      toast.error(e.message || "Update failed");
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
      // Auto-select the newly created partner
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
      pageName="Receipts"
      breadcrumbs={[
        { label: "Operations", href: "/inventory/summary" },
        { label: "Receipts" },
      ]}
      userName={session?.user?.name || "User"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={fetchTransfers}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Incoming Receipts</h1>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Receipt
          </Button>
        </div>

      {loading ? (
        <TableSkeleton rows={4} columns={1} />
      ) : (
        <TransferList
          title="Incoming Receipt"
          partnerLabel="Vendor"
          emptyTitle="No incoming receipts"
          emptyDescription="Create a receipt to begin receiving inventory."

          transfers={transfers}

          workflowSteps={workflowSteps}
          statusLabels={statusLabels}
          getCurrentStep={getCurrentStep}
          getNextAction={getNextAction}

          onView={handleView}

          onContinue={(transfer) => {
            switch (transfer.status) {
              case "draft":
                updateStatus(
                  transfer._id,
                  "pending_approval"
                );
                break;

              case "pending_approval":
                if (transfer.qcStatus === "pending") {
                  updateSubStatus(transfer._id, {
                    qcStatus: "passed",
                  });
                } else if (transfer.qcStatus === "passed") {
                  updateStatus(
                    transfer._id,
                    "approved"
                  );
                }
                break;

              case "approved":
                updateStatus(
                  transfer._id,
                  "posted"
                );
                break;

              case "posted":
                updateStatus(
                  transfer._id,
                  "closed"
                );
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
        title={formData?.header?.name || "New Receipt"}
        className="w-[80vw] max-w-[1400px]"
        footer={
          isViewOnly ? (
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Close
            </Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => saveTransfer()} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </div>
          )
        }
      >
        {formData && (
          <StockTransferPopup
            formData={formData}
            setFormData={setFormData}
            isViewOnly={isViewOnly}
            operationType="incoming"
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
        />
      </ModularModal>
    </DashboardLayout>
  );
}
