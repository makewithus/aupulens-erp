"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { Plus } from "lucide-react";

// Extracted Subcomponents
import { PricelistTable } from "@/components/sales/pricelist/PricelistTable";
import { PricelistModals } from "@/components/sales/pricelist/PricelistModals";

export default function PricelistPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Resources
  const [products, setProducts] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [currentItem, setCurrentItem] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<any>({
    name: "",
    currencyId: "INR",
    items: [],
    active: true,
  });

  const loadResources = async () => {
    try {
      const res = await cachedFetch("/api/sales/products");
      const json = await res.json();
      setProducts(json.items || []);
    } catch (error) {
      console.error("Error loading resources:", error);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch("/api/sales/pricelists");
      const json = await res.json();
      setData(json.items || []);
    } catch (error) {
      console.error("Error loading pricelists:", error);
      toast.error("Failed to load pricelists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    
    if (status === "authenticated") {
      load();
      loadResources();
    }
  }, [status, router, load]);

  const handleOpenCreate = () => {
    setCurrentItem(null);
    setIsViewOnly(false);
    setFormData({
      name: "",
      currencyId: "INR",
      items: [],
      active: true,
    });
    setIsModalOpen(true);
  };

  // AI-native pre-fill: open the create modal with AI-extracted pricelist data
  // (name, currency, and a price rule). User reviews and clicks Save.
  useAiPrefill("pricelist", (p) => {
    const d: any = p.data || {};
    const hasRule = d.fixed_price !== undefined || d.min_qty !== undefined || d.start_date || d.end_date;
    setCurrentItem(null);
    setIsViewOnly(false);
    setFormData({
      name: d.name ? String(d.name) : "",
      currencyId: d.currency ? String(d.currency) : "INR",
      items: hasRule
        ? [{
            applied_on: "3_global",
            compute_price: "fixed",
            fixed_price: Number(d.fixed_price) || 0,
            percent_price: 0,
            min_quantity: Number(d.min_qty) || 0,
            ...(d.start_date ? { date_start: String(d.start_date) } : {}),
            ...(d.end_date ? { date_end: String(d.end_date) } : {}),
          }]
        : [],
      active: true,
    });
    setIsModalOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
  });

  const handleOpenView = (item: any) => {
    setCurrentItem(item);
    setIsViewOnly(true);
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setCurrentItem(item);
    setIsViewOnly(false);
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const url = currentItem
        ? `/api/sales/pricelists/${currentItem._id}`
        : "/api/sales/pricelists";
      const method = currentItem ? "PATCH" : "POST";

      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save pricelist");
      }

      toast.success(currentItem ? "Pricelist updated" : "Pricelist created");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete State
  const [deleteInfo, setDeleteInfo] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteInfo({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!deleteInfo) return;
    try {
      const res = await cachedFetch(`/api/sales/pricelists/${deleteInfo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Pricelist deleted");
      load();
    } catch (error) {
      toast.error("Delete failed");
    } finally {
      setDeleteInfo(null);
    }
  };

  const filtered = data.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Pricelists"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Pricelists" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      onRefresh={load}
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
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Pricelists</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filtered.length} {filtered.length === 1 ? "Pricelist" : "Pricelists"}
                </p>
              </div>

              <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search pricelists..."
                  />
                </div>

                <Button
                  onClick={handleOpenCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Pricelist
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
                  No pricelists found
                </p>
              </div>
            ) : (
              <PricelistTable
                filtered={filtered}
                handleOpenView={handleOpenView}
                handleOpenEdit={handleOpenEdit}
                handleDeleteClick={handleDeleteClick}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <PricelistModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        isViewOnly={isViewOnly}
        currentItem={currentItem}
        isSubmitting={isSubmitting}
        formData={formData}
        setFormData={setFormData}
        products={products}
        handleSubmit={handleSubmit}
        deleteInfo={deleteInfo}
        setDeleteInfo={setDeleteInfo}
        handleConfirmDelete={handleConfirmDelete}
      />
    </DashboardLayout>
  );
}
