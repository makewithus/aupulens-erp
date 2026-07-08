"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FileText } from "lucide-react";

// Extracted Subcomponents
import { QuotationMetrics } from "@/components/sales/quotations/QuotationMetrics";
import { QuotationTable } from "@/components/sales/quotations/QuotationTable";
import { QuotationModals } from "@/components/sales/quotations/QuotationModals";

export default function SalesQuotationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Data list and loading states
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Resources state (for modals dropdowns)
  const [partners, setPartners] = useState([]);
  const [products, setProducts] = useState([]);
  const [pricelists, setPricelists] = useState([]);
  const [users, setUsers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [accounts, setAccounts] = useState([]);

  // Main Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("lines");
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invoice Modal States
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceFormData, setInvoiceFormData] = useState<any>(null);

  // Delete Modal States
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  // Main Form Data State
  const [formData, setFormData] = useState<any>({
    header: {
      name: "",
      partnerId: "",
      dateOrder: new Date(),
      validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      pricelistId: "public",
    },
    orderLines: [],
    otherInfo: {
      salespersonId: "",
      logistics: {
        shippingPolicy: "direct",
        warehouseId: "",
        incotermId: "",
        commitmentDate: null,
      },
    },
    totals: {
      amountUntaxed: 0,
      amountTax: 0,
      amountTotal: 0,
    },
    status: "draft",
  });

  const loadResources = async () => {
    try {
      const [pRes, prodRes, uRes, accRes, priceRes, wRes] = await Promise.all([
        fetch("/api/sales/customers"),
        fetch("/api/sales/products"),
        fetch("/api/users"),
        fetch("/api/accounting/accounts"),
        fetch("/api/sales/pricelists"),
        fetch("/api/inventory/warehouse"),
      ]);
      const [pData, prodData, uData, accData, priceData, wData] =
        await Promise.all([
          pRes.json(),
          prodRes.json(),
          uRes.ok ? uRes.json() : { users: [] },
          accRes.ok ? accRes.json() : { items: [] },
          priceRes.ok ? priceRes.json() : { items: [] },
          wRes.ok ? wRes.json() : { warehouses: [] },
        ]);
      setPartners(pData.items || []);
      setProducts(prodData.items || []);
      setUsers(uData.users || []);
      setAccounts(accData.items || []);
      setPricelists(priceData.items || []);
      setWarehouses(wData.warehouses || []);
    } catch (error) {
      console.error("Error loading resources:", error);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sales/sale-orders?status=draft,sent");
      const json = await res.json();
      setData(json.items || []);
    } catch (error) {
      console.error("Error loading quotations:", error);
      toast.error("Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/sales");
    if (status === "authenticated") {
      load();
      loadResources();
    }
  }, [status, router, load]);

  // Modal Open Triggers
  const handleOpenCreate = () => {
    setCurrentOrder(null);
    setIsViewOnly(false);
    setActiveTab("lines");
    setFormData({
      header: {
        name: `QT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, "0")}`,
        partnerId: "",
        dateOrder: new Date(),
        validityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pricelistId: "public",
      },
      orderLines: [],
      otherInfo: {
        salespersonId: session?.user?.id || "",
        logistics: { shippingPolicy: "direct" },
      },
      totals: {
        amountUntaxed: 0,
        amountTax: 0,
        amountTotal: 0,
      },
      status: "draft",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (order: any) => {
    setCurrentOrder(order);
    setIsViewOnly(true);
    setActiveTab("lines");
    setFormData(order);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (order: any) => {
    setCurrentOrder(order);
    setIsViewOnly(false);
    setActiveTab("lines");
    setFormData(order);
    setIsModalOpen(true);
  };

  // Operation Handlers
  const handleSaveChat = async (updatedChatter: any[]) => {
    if (!currentOrder?._id) return;
    try {
      await fetch(`/api/sales/sale-orders/${currentOrder._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatter: updatedChatter }),
      });
      load();
    } catch (error) {
      console.error("Failed to save chat", error);
      toast.error("Failed to save message");
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const url = currentOrder
        ? `/api/sales/sale-orders/${currentOrder._id}`
        : "/api/sales/sale-orders";
      const method = currentOrder ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save quotation");
      }

      toast.success(currentOrder ? "Quotation updated" : "Quotation created");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewInvoice = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/accounting/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Failed to load invoice");
      const inv = await res.json();
      setInvoiceFormData(inv);
      setIsInvoiceModalOpen(true);
    } catch (e) {
      toast.error("Could not load Invoice");
    }
  };

  const handleCreateInvoice = async (orderId: string) => {
    try {
      const res = await fetch("/api/accounting/invoices/from-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleOrderId: orderId }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create invoice");
      }
      const invoice = await res.json();
      setInvoiceFormData(invoice);
      setIsInvoiceModalOpen(true);
      toast.success("Draft Invoice Created");
      load();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to create invoice");
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      let body: any = {};
      if (action === "sent") body = { status: "sent" };
      if (action === "sale") body = { status: "sale" };
      if (action === "cancel") body = { status: "cancel" };

      const res = await fetch(`/api/sales/sale-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Action failed");
      toast.success(`Quotation ${action}`);
      load();
    } catch (error) {
      toast.error("Action failed");
    }
  };

  const handleQ2CTransition = async (id: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/sales/sale-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q2cStatus: nextStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transition failed");
      }

      toast.success(`Moved to stage`);
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmationId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationId) return;
    try {
      const res = await fetch(`/api/sales/sale-orders/${deleteConfirmationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Quotation deleted");
      load();
    } catch (error) {
      toast.error("Delete failed");
    } finally {
      setDeleteConfirmationId(null);
    }
  };

  // Filter calculations
  const filtered = data.filter((q) => {
    const matchesQuery = [
      q.header.name,
      q.header.partnerId?.header?.name || "",
    ].some((v) => v.toLowerCase().includes(query.toLowerCase()));
    const matchesStatus = statusFilter === "all" || q.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Quotations"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Quotations" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-2">
          <div>
            <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
              Quotations & Proposals
            </h2>
          </div>
          <div className="flex flex-row gap-4">
            <Button
              onClick={handleOpenCreate}
              className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
            >
              <Plus className="h-4 w-4 mr-2" /> New Quotation
            </Button>
          </div>
        </div>

        {/* Metrics Section */}
        <QuotationMetrics data={data} />

        {/* Table & Filtering Section */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-lg font-medium text-foreground">Active Quotations</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filtered.length} {filtered.length === 1 ? "Quotation" : "Quotations"}
                </p>
              </div>

              <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search quotations..."
                  />
                </div>

                {/* Status select filter */}
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/40">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground font-mono text-xs">
                  No active quotations found
                </p>
              </div>
            ) : (
              <QuotationTable
                filtered={filtered}
                handleQ2CTransition={handleQ2CTransition}
                handleViewInvoice={handleViewInvoice}
                handleCreateInvoice={handleCreateInvoice}
                handleOpenView={handleOpenView}
                handleOpenEdit={handleOpenEdit}
                handleAction={handleAction}
                handleDelete={handleDelete}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Extracted modals block containing all modular popups */}
      <QuotationModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        formData={formData}
        setFormData={setFormData}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isViewOnly={isViewOnly}
        currentOrder={currentOrder}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
        handleSaveChat={handleSaveChat}
        handleQ2CTransition={handleQ2CTransition}

        isInvoiceModalOpen={isInvoiceModalOpen}
        setIsInvoiceModalOpen={setIsInvoiceModalOpen}
        invoiceFormData={invoiceFormData}
        setInvoiceFormData={setInvoiceFormData}
        handleCreateInvoice={handleCreateInvoice}
        handleViewInvoice={handleViewInvoice}

        deleteConfirmationId={deleteConfirmationId}
        setDeleteConfirmationId={setDeleteConfirmationId}
        confirmDelete={confirmDelete}

        partners={partners}
        products={products}
        pricelists={pricelists}
        users={users}
        warehouses={warehouses}
        accounts={accounts}
        loadResources={loadResources}
      />
    </DashboardLayout>
  );
}
