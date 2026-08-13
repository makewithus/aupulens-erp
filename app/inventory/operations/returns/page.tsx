"use client";

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { SearchInput } from "@/components/SearchInput";

// Extracted Subcomponents
import { ReturnsTable } from "@/components/inventory/operations/returns/ReturnsTable";
import { ReturnsModals } from "@/components/inventory/operations/returns/ReturnsModals";

export default function ReturnsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resources
  const [partners, setPartners] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/inventory");
    }
    if (status === "authenticated") {
      fetchReturns();
      fetchResources();
    }
  }, [status, router]);

  const fetchResources = async () => {
    try {
      const [pRes, cRes, uRes] = await Promise.all([
        cachedFetch("/api/sales/products?limit=100"),
        cachedFetch("/api/sales/customers"),
        cachedFetch("/api/users"),
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

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const res = await cachedFetch("/api/inventory/operations/returns");
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      toast.error("Failed to load returns");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setFormData({
      header: {
        name: "",
        operationType: "outgoing",
        scheduledDate: new Date(),
        sourceDocument: "",
      },
      operations_tab: [],
      additional_info: {},
      status: "draft",
    });
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  // AI-native pre-fill: open the New Return modal with AI-extracted details.
  useAiPrefill("inventory_return", (p) => {
    const d: any = p.data || {};
    const lines = (Array.isArray(d.items) ? d.items : [])
      .filter((it: any) => it && (it.productId || it.name))
      .map((it: any) => ({ productId: it.productId || "", demand: Number(it.qty) > 0 ? Number(it.qty) : 1, done: 0 }));
    setFormData({
      header: {
        name: d.reference ? String(d.reference) : "",
        operationType: "outgoing",
        scheduledDate: d.scheduled_date ? new Date(d.scheduled_date) : new Date(),
        sourceDocument: d.source_document ? String(d.source_document) : "",
        ...(d.partnerId ? { partnerId: String(d.partnerId) } : {}),
      },
      operations_tab: lines,
      additional_info: { ...(d.note ? { note: String(d.note) } : {}) },
      status: "draft",
    });
    setIsViewOnly(false);
    setIsModalOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 10000 });
  });

  const handleView = (t: any) => {
    setFormData(t);
    setIsViewOnly(true);
    setIsModalOpen(true);
  };

  const handleEdit = (t: any) => {
    setFormData(t);
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await cachedFetch(`/api/inventory/operations/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Marked as ${newStatus}`);
      fetchReturns();
    } catch (e) {
      toast.error("Update failed");
    }
  };

  const saveReturn = async () => {
    setIsSubmitting(true);
    try {
      const url = formData._id
        ? `/api/inventory/operations/transfers/${formData._id}`
        : "/api/inventory/operations/returns";
      const method = formData._id ? "PATCH" : "POST";

      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast.success("Return document saved");
      setIsModalOpen(false);
      fetchReturns();
    } catch (e) {
      toast.error("Error saving return");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = items.filter(
    (t) =>
      (t.header?.name || "").toLowerCase().includes(query.toLowerCase()) ||
      (t.header?.partnerId?.header?.name || t.header?.partnerId?.name || "").toLowerCase().includes(query.toLowerCase()) ||
      (t.header?.sourceDocument || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      dashboardTitle="Inventory"
      pageName="Returns"
      breadcrumbs={[{ label: "Operations" }, { label: "Returns" }]}
      userName={session?.user?.name || "User"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
      onRefresh={fetchReturns}
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
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Returns</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filtered.length} {filtered.length === 1 ? "Return" : "Returns"} Total
                </p>
              </div>

              <div className="w-full max-w-xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search returns..."
                  />
                </div>
                <Button
                  onClick={handleCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Return
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
                  No returns found
                </p>
              </div>
            ) : (
              <ReturnsTable
                items={filtered}
                handleView={handleView}
                updateStatus={updateStatus}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ReturnsModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        formData={formData}
        setFormData={setFormData}
        isViewOnly={isViewOnly}
        isSubmitting={isSubmitting}
        partners={partners}
        products={products}
        users={users}
        fetchReturns={fetchReturns}
        saveReturn={saveReturn}
        currentUserSession={session?.user}
      />
    </DashboardLayout>
  );
}
