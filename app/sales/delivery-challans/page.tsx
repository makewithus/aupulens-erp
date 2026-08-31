"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
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
import { Plus } from "lucide-react";

// Extracted Subcomponents
import { DeliveryChallanTable } from "@/components/sales/delivery-challans/DeliveryChallanTable";
import { DeliveryChallanModals } from "@/components/sales/delivery-challans/DeliveryChallanModals";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";

interface DeliveryChallan {
  _id: string;
  dcNumber: string;
  customer: string;
  customerEmail?: string;
  items: { description: string; quantity: number; unit: string }[];
  deliveryAddress: string;
  vehicleNumber?: string;
  driverName?: string;
  deliveryDate?: string;
  status: "pending" | "issued" | "delivered";
  notes?: string;
  createdAt: string;
}

export default function DeliveryChallansPage() {
  return (
    <Suspense fallback={null}>
      <DeliveryChallansPageInner />
    </Suspense>
  );
}

function DeliveryChallansPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<DeliveryChallan[]>([]);
  const [loading, setLoading] = useState(true);
  // AI-native "redirect with filters" — seed filter state from the URL
  // synchronously (lazy useState initializer) so a link the AI assistant
  // sends the user to arrives already filtered from the very first render
  // (search/status reuse the existing client-side filter below; this page
  // has no amount field to filter on). A normal, param-less visit just gets
  // the defaults below, unchanged.
  const [query, setQuery] = useState(() => searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get("status") || "all");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") || "");

  // Resources
  const [warehouses, setWarehouses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Main Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Nested Modal State
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [warehouseFormData, setWarehouseFormData] = useState<any>({
    warehouseCode: "",
    name: "",
    location: "",
    address: "",
    type: "standard",
  });

  // Delete State
  const [deleteInfo, setDeleteInfo] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [formData, setFormData] = useState<any>({
    dcNumber: "",
    customer: "",
    customerEmail: "",
    items: [{ description: "", quantity: 1, unit: "pcs" }],
    deliveryAddress: "",
    vehicleNumber: "",
    driverName: "",
    deliveryDate: "",
    status: "pending",
    notes: "",
    warehouseId: "",
    incotermId: "",
  });

  const loadResources = useCallback(async () => {
    try {
      const [wRes, cRes, pRes] = await Promise.all([
        cachedFetch("/api/inventory/warehouse"),
        cachedFetch("/api/sales/customers"),
        cachedFetch("/api/sales/products"),
      ]);
      const wJson = await wRes.json();
      const cJson = await cRes.json();
      const pJson = await pRes.json();
      setWarehouses(wJson.warehouses || []);
      setCustomers(cJson.items || []);
      setProducts(pJson.items || []);
    } catch (error) {
      console.error("Error loading resources:", error);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch("/api/sales/delivery-challans");
      const json = await res.json();
      setData(json.items || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load delivery challans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    
    if (status === "authenticated") {
      load();
      loadResources();
    }
  }, [status, router, load, loadResources]);

  const handleOpenCreate = () => {
    setCurrentId(null);
    setIsViewOnly(false);
    setActiveTab("details");
    setFormData({
      dcNumber: `DC-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
      customer: "",
      customerEmail: "",
      items: [{ description: "", quantity: 1, unit: "pcs" }],
      deliveryAddress: "",
      vehicleNumber: "",
      driverName: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      status: "pending",
      notes: "",
      warehouseId: "",
      incotermId: "",
    });
    setIsModalOpen(true);
  };

  // AI-native pre-fill: open the create modal with AI-extracted challan data.
  useAiPrefill("delivery_challan", (p) => {
    const d: any = p.data || {};
    handleOpenCreate();
    setFormData((prev: any) => ({
      ...prev,
      customer: d.customer_name ? String(d.customer_name) : prev.customer,
      customerEmail: d.customer_email ? String(d.customer_email) : prev.customerEmail,
      deliveryAddress: d.delivery_address ? String(d.delivery_address) : prev.deliveryAddress,
      vehicleNumber: d.vehicle_number ? String(d.vehicle_number) : prev.vehicleNumber,
      driverName: d.driver_name ? String(d.driver_name) : prev.driverName,
      deliveryDate: d.delivery_date ? String(d.delivery_date) : prev.deliveryDate,
      notes: d.notes ? String(d.notes) : prev.notes,
      items: Array.isArray(d.items) && d.items.length
        ? d.items
            .filter((it: any) => it && String(it.description || "").trim())
            .map((it: any) => ({
              description: String(it.description || ""),
              quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
              unit: String(it.unit || "pcs"),
            }))
        : prev.items,
    }));
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
  });

  const handleOpenView = (item: any) => {
    setCurrentId(item._id);
    setIsViewOnly(true);
    setActiveTab("details");
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setCurrentId(item._id);
    setIsViewOnly(false);
    setActiveTab("details");
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.dcNumber || !formData.customer) {
      toast.error("Please fill required fields (DC Number, Customer)");
      return;
    }
    setIsSubmitting(true);
    try {
      const url = currentId
        ? `/api/sales/delivery-challans/${currentId}`
        : "/api/sales/delivery-challans";
      const method = currentId ? "PATCH" : "POST";

      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save challan");
      }

      toast.success(currentId ? "Challan updated" : "Challan created");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteInfo({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!deleteInfo) return;
    try {
      const res = await cachedFetch(`/api/sales/delivery-challans/${deleteInfo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Challan deleted");
      load();
    } catch (error) {
      toast.error("Failed to delete challan");
    } finally {
      setDeleteInfo(null);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      const res = await cachedFetch(`/api/sales/delivery-challans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update status");

      toast.success("Status updated");
      load();
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleCreateWarehouse = async () => {
    try {
      const res = await cachedFetch("/api/inventory/warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warehouseFormData),
      });
      if (!res.ok) throw new Error("Failed to create warehouse");
      toast.success("Warehouse created");
      setIsWarehouseModalOpen(false);
      loadResources();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const filtered = data.filter((dc) => {
    const matchesQuery = [dc.dcNumber, dc.customer].some((v) =>
      v?.toLowerCase().includes(query.toLowerCase()),
    );
    const matchesStatus = statusFilter === "all" || dc.status === statusFilter;
    const created = dc.createdAt ? new Date(dc.createdAt) : null;
    const matchesDateFrom = !dateFrom || (created != null && created >= new Date(dateFrom));
    const matchesDateTo = !dateTo || (created != null && created <= new Date(new Date(dateTo).setHours(23, 59, 59, 999)));
    return matchesQuery && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Delivery Challans"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Delivery Challans" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            Delivery Challans
          </h1>
        </div>

        {/* Table & Filtering Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Delivery Challans</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filtered.length} {filtered.length === 1 ? "Challan" : "Challans"}
                </p>
              </div>

              <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search challans..."
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
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="issued">Issued</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <DateRangeFilter
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateFromChange={setDateFrom}
                  onDateToChange={setDateTo}
                />

                <Button
                  onClick={handleOpenCreate}
                  className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Challan
                </Button>
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
                <p className="text-muted-foreground font-mono text-xs">
                  No delivery challans found
                </p>
              </div>
            ) : (
              <DeliveryChallanTable
                filtered={filtered}
                handleOpenView={handleOpenView}
                handleOpenEdit={handleOpenEdit}
                handleDeleteClick={handleDeleteClick}
                handleStatusUpdate={handleStatusUpdate}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <DeliveryChallanModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        isViewOnly={isViewOnly}
        currentId={currentId}
        isSubmitting={isSubmitting}
        formData={formData}
        setFormData={setFormData}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        warehouses={warehouses}
        customers={customers}
        products={products}
        onAddWarehouse={() => {
          setWarehouseFormData({
            warehouseCode: "",
            name: "",
            location: "",
            address: "",
            type: "standard",
          });
          setIsWarehouseModalOpen(true);
        }}
        onAddCustomer={() => {
          toast.info("Customer creation from here is coming soon.");
        }}
        handleSubmit={handleSubmit}
        isWarehouseModalOpen={isWarehouseModalOpen}
        setIsWarehouseModalOpen={setIsWarehouseModalOpen}
        warehouseFormData={warehouseFormData}
        setWarehouseFormData={setWarehouseFormData}
        handleCreateWarehouse={handleCreateWarehouse}
        deleteInfo={deleteInfo}
        setDeleteInfo={setDeleteInfo}
        handleConfirmDelete={handleConfirmDelete}
      />
    </DashboardLayout>
  );
}
