"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Truck,
  Eye,
  Edit2,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { WarehousePopupContent } from "../warehouses/popup/WarehousePopup";
import { DeliveryChallanPopupContent } from "./popup/DeliveryChallanPopup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const { data: session, status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<DeliveryChallan[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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
        fetch("/api/inventory/warehouse"),
        fetch("/api/sales/customers"),
        fetch("/api/sales/products"),
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
      const res = await fetch("/api/sales/delivery-challans");
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
    if (status === "unauthenticated") router.push("/auth/sales");
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

      const res = await fetch(url, {
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
      const res = await fetch(`/api/sales/delivery-challans/${deleteInfo.id}`, {
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
      // Optimistic update could go here, but loading is fast enough usually
      const res = await fetch(`/api/sales/delivery-challans/${id}`, {
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
      const res = await fetch("/api/inventory/warehouse", {
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

  // Status Badge Logic
  const getStatusBadge = (status: string) => {
    const config: Record<string, string> = {
      pending:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      issued: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      delivered:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    };
    return (
      <Badge className={`${config[status] || config.pending} border-0`}>
        {status}
      </Badge>
    );
  };

  const filtered = data.filter((dc) => {
    const matchesQuery = [dc.dcNumber, dc.customer].some((v) =>
      v?.toLowerCase().includes(query.toLowerCase()),
    );
    const matchesStatus = statusFilter === "all" || dc.status === statusFilter;
    return matchesQuery && matchesStatus;
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Delivery Challans</h1>
            <p className="text-sm text-muted-foreground">
              Generate and track delivery challans
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-48 bg-background"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Challan
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
              <div className="text-center py-12 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No delivery challans found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 text-left">DC Number</th>
                      <th className="px-6 py-3 text-left">Customer</th>
                      <th className="px-6 py-3 text-left">Date</th>
                      <th className="px-6 py-3 text-left">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {filtered.map((dc) => (
                      <tr
                        key={dc._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap font-medium">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-blue-500" />
                            {dc.dcNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {dc.customer}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                          {dc.deliveryDate
                            ? new Date(dc.deliveryDate).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(dc.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600"
                              onClick={() => handleOpenView(dc)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600"
                              onClick={() => handleOpenEdit(dc)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              onClick={() =>
                                handleDeleteClick(dc._id, dc.dcNumber)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled
                                  className="font-semibold opacity-100"
                                >
                                  Set Status:
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusUpdate(dc._id, "pending")
                                  }
                                >
                                  Mark Pending
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusUpdate(dc._id, "issued")
                                  }
                                >
                                  Mark Issued
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusUpdate(dc._id, "delivered")
                                  }
                                >
                                  Mark Delivered
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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

      {/* Main Delivery Challan Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          isViewOnly
            ? "View Delivery Challan"
            : currentId
              ? "Edit Delivery Challan"
              : "New Delivery Challan"
        }
        footer={
          !isViewOnly && (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          )
        }
        className="max-w-4xl"
      >
        <DeliveryChallanPopupContent
          formData={formData}
          setFormData={setFormData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isViewOnly={isViewOnly}
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
            // Open customer creation modal? Not implemented in this page.
            // We could direct them to Customer page or add Customer Modal.
            // For now, I'll toast or ignore.
            toast.info("Customer creation from here is coming soon.");
          }}
        />
      </ModularModal>

      {/* Warehouse Modal */}
      <ModularModal
        open={isWarehouseModalOpen}
        onOpenChange={setIsWarehouseModalOpen}
        title="Create Warehouse"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsWarehouseModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateWarehouse}>Save</Button>
          </div>
        }
      >
        <WarehousePopupContent
          formData={warehouseFormData}
          setFormData={setWarehouseFormData}
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
