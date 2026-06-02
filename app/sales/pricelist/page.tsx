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
import { Input } from "@/components/ui/input";
import { Search, Plus, Tag, Eye, Edit2, Trash2 } from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { PricelistPopupContent } from "./popup/PricelistPopup";

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
      const res = await fetch("/api/sales/products");
      const json = await res.json();
      setProducts(json.items || []);
    } catch (error) {
      console.error("Error loading resources:", error);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sales/pricelists");
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
    if (status === "unauthenticated") router.push("/auth/sales");
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

      const res = await fetch(url, {
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
      const res = await fetch(`/api/sales/pricelists/${deleteInfo.id}`, {
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pricelists</h1>
            <p className="text-sm text-muted-foreground">
              Define pricing rules and discounts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search pricelists..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-64 bg-background"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Pricelist
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-sm bg-background/50 backdrop-blur-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Tag className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground font-medium">
                  No pricelists found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 text-left">Name</th>
                      <th className="px-6 py-3 text-left">Currency</th>
                      <th className="px-6 py-3 text-left">Rules</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {filtered.map((p) => (
                      <tr
                        key={p._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap font-medium flex items-center gap-3">
                          <div className="h-8 w-8 bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center rounded text-purple-600">
                            <Tag className="h-4 w-4" />
                          </div>
                          {p.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {p.currencyId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {p.items?.length || 0} Rule(s)
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenView(p)}
                            className="h-8 w-8 text-blue-600"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(p)}
                            className="h-8 w-8 text-indigo-600"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(p._id, p.name)}
                            className="h-8 w-8 text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          isViewOnly
            ? "View Pricelist"
            : currentItem
              ? "Edit Pricelist"
              : "New Pricelist"
        }
        footer={
          !isViewOnly && (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Pricelist"}
              </Button>
            </div>
          )
        }
      >
        <PricelistPopupContent
          formData={formData}
          setFormData={setFormData}
          isViewOnly={isViewOnly}
          products={products}
        />
      </ModularModal>

      {/* Delete Confirmation Modal */}
      <ModularModal
        open={!!deleteInfo}
        onOpenChange={(open) => !open && setDeleteInfo(null)}
        title="Confirm Deletion"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="outline" onClick={() => setDeleteInfo(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{deleteInfo?.name}</strong>?
            This action cannot be undone.
          </p>
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
