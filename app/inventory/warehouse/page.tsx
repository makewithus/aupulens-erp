"use client";

import { Suspense, useEffect, useState } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { Plus } from "lucide-react";

// Extracted Subcomponents
import { WarehouseTable } from "@/components/inventory/warehouse/WarehouseTable";
import { WarehouseModals } from "@/components/inventory/warehouse/WarehouseModals";

export default function WarehousePage() {
  return (
    <Suspense fallback={null}>
      <WarehousePageInner />
    </Suspense>
  );
}

function WarehousePageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // AI-native "redirect with filters" — seed the search box from the URL
  // synchronously (lazy useState initializer) so a link the AI assistant
  // sends the user to arrives already filtered from the very first render
  // (this page filters client-side, so seeding `query` is enough). A
  // normal, param-less visit just gets the default, unchanged.
  const [query, setQuery] = useState(() => searchParams.get("search") || "");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const defaultFormData = {
    warehouseCode: "",
    name: "",
    location: "",
    address: "",
    capacity: 0,
    type: "standard",
    status: "active",
    manager: "",
    email: "",
  };

  useEffect(() => {
    
    if (status === "authenticated") fetchWarehouses();
  }, [status, router]);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const res = await cachedFetch("/api/inventory/warehouse");
      const data = await res.json();
      setWarehouses(data.warehouses || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setFormData(JSON.parse(JSON.stringify(defaultFormData)));
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  // AI-native pre-fill: open the Warehouse modal with AI-extracted fields.
  useAiPrefill("warehouse", (p) => {
    const d: any = p.data || {};
    setFormData({
      ...JSON.parse(JSON.stringify(defaultFormData)),
      name: d.name ? String(d.name) : "",
      warehouseCode: d.warehouse_code ? String(d.warehouse_code) : "",
      type: ["standard", "bonded", "cold-storage", "transit"].includes(d.type) ? d.type : "standard",
      location: d.location ? String(d.location) : "",
      address: d.address ? String(d.address) : "",
      capacity: Number(d.capacity) > 0 ? Number(d.capacity) : 0,
      manager: d.manager ? String(d.manager) : "",
      email: d.email ? String(d.email) : "",
    });
    setIsViewOnly(false);
    setIsModalOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  ") });
  });

  const handleOpenEdit = (wh: any) => {
    setFormData(wh);
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  const handleOpenView = (wh: any) => {
    setFormData(wh);
    setIsViewOnly(true);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.warehouseCode) {
      toast.error("Name and Code are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = formData._id
        ? `/api/inventory/warehouse/${formData._id}`
        : "/api/inventory/warehouse";
      const method = formData._id ? "PATCH" : "POST";

      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to save warehouse");

      toast.success("Warehouse saved");
      setIsModalOpen(false);
      fetchWarehouses();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await cachedFetch(`/api/inventory/warehouse/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Warehouse deleted");
      setDeleteId(null);
      fetchWarehouses();
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  const filtered = warehouses.filter(
    (w) =>
      w.name.toLowerCase().includes(query.toLowerCase()) ||
      w.warehouseCode.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Warehouses"
      breadcrumbs={[
        { label: "Dashboard", href: "/inventory/summary" },
        { label: "Warehouses" },
      ]}
      userName={session?.user?.name || "User"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={fetchWarehouses}
    >
      <div className="space-y-1">
        {/* Page Header Spacer */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2"></div>

        {/* Table & Filtering Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Warehouses</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filtered.length} {filtered.length === 1 ? "Warehouse" : "Warehouses"} Total
                </p>
              </div>

              <div className="w-full max-w-xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search warehouses..."
                  />
                </div>

                <Button
                  onClick={handleOpenCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Warehouse
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No warehouses found
                </p>
              </div>
            ) : (
              <WarehouseTable
                filtered={filtered}
                handleOpenView={handleOpenView}
                handleOpenEdit={handleOpenEdit}
                setDeleteId={setDeleteId}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <WarehouseModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        formData={formData}
        setFormData={setFormData}
        isViewOnly={isViewOnly}
        setIsViewOnly={setIsViewOnly}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
        deleteId={deleteId}
        setDeleteId={setDeleteId}
        handleDelete={handleDelete}
      />
    </DashboardLayout>
  );
}
