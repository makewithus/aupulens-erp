"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Warehouse, Eye, Edit2, Trash2 } from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { WarehousePopupContent } from "@/app/inventory/warehouse/popup/WarehousePopup";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function WarehousePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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
    if (status === "unauthenticated") router.push("/auth/inventory");
    if (status === "authenticated") fetchWarehouses();
  }, [status, router]);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/inventory/warehouse");
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

      const res = await fetch(url, {
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
      const res = await fetch(`/api/inventory/warehouse/${deleteId}`, {
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Warehouses</h1>
            <p className="text-sm text-muted-foreground">
              Manage storage locations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-64 bg-background"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Warehouse
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-sm bg-background/50 backdrop-blur-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Warehouse className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground font-medium">
                  No warehouses found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 text-left">Code</th>
                      <th className="px-6 py-3 text-left">Name</th>
                      <th className="px-6 py-3 text-left">Location</th>
                      <th className="px-6 py-3 text-left">Type</th>
                      <th className="px-6 py-3 text-left">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background">
                    {filtered.map((w) => (
                      <tr
                        key={w._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-muted-foreground">
                          {w.warehouseCode}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center rounded text-blue-600">
                              <Warehouse className="h-4 w-4" />
                            </div>
                            {w.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {w.location}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className="uppercase text-[10px]"
                          >
                            {w.type}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge
                            variant={
                              w.status === "active" ? "default" : "secondary"
                            }
                          >
                            {w.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenView(w)}
                            className="h-8 w-8 text-blue-600"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(w)}
                            className="h-8 w-8 text-indigo-600"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(w._id)}
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
        title={formData?.name || "Warehouse"}
        className="max-w-xl"
        footer={
          isViewOnly ? (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Close
              </Button>
              <Button
                onClick={() => setIsViewOnly(false)}
                className="bg-blue-600"
              >
                Edit
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Warehouse"}
              </Button>
            </div>
          )
        }
      >
        {formData && (
          <WarehousePopupContent
            formData={formData}
            setFormData={setFormData}
            isViewOnly={isViewOnly}
          />
        )}
      </ModularModal>

      <ModularModal
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Confirm Delete"
        className="max-w-sm"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this warehouse?
          </p>
        </div>
      </ModularModal>
    </DashboardLayout>
  );
}
