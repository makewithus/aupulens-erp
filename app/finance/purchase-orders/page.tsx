"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";

import React, { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Trash2,
  Package,
  ShieldCheck,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import PurchaseOrderPopupContent from "@/components/finance/purchase-orders/PurchaseOrderPopupContent";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/purchase-orders");
      const data = await res.json();
      setOrders(data.items || []);
    } catch (error) {
      toast.error("Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.partnerId?.header?.name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  }, [orders, searchQuery]);

  const handleOpenCreate = () => {
    setFormData({
      dateOrder: new Date().toISOString().split("T")[0],
      orderLines: [],
      status: DOCUMENT_STATUS.DRAFT,
      totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (order: any) => {
    setFormData({ ...order });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.partnerId) {
      toast.error("Vendor is required");
      return;
    }
    if (!formData.orderLines || formData.orderLines.length === 0) {
      toast.error("At least one order line is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const isUpdate = !!formData._id;
      const url = isUpdate
        ? `/api/finance/purchase-orders/${formData._id}`
        : "/api/finance/purchase-orders";
      const method = isUpdate ? "PATCH" : "POST";

      const payload = {
        ...formData,
        partnerId:
          typeof formData.partnerId === "object"
            ? formData.partnerId._id
            : formData.partnerId,
        orderLines: formData.orderLines.map((line: any) => ({
          ...line,
          productId:
            typeof line.productId === "object"
              ? line.productId._id
              : line.productId,
        })),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(isUpdate ? "Purchase order updated" : "Purchase order created");
        setIsModalOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Operation failed");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/finance/purchase-orders/${formData._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Status update failed");
      toast.success(`Purchase order ${status.replace("_", " ")}`);
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message || "Status update failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: "Delete this purchase order?" }))) return;
    try {
      const res = await fetch(`/api/finance/purchase-orders/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Purchase order deleted");
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Delete failed");
      }
    } catch (error) {
      toast.error("Delete failed");
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-amber-50 text-amber-700 border-amber-200",
      pending_approval: "bg-yellow-50 text-yellow-700 border-yellow-200",
      approved: "bg-blue-50 text-blue-700 border-blue-200",
      posted: "bg-emerald-50 text-emerald-700 border-emerald-200",
      cancelled: "bg-red-50 text-red-700 border-red-200",
    };
    return (
      <Badge
        variant="outline"
        className={`uppercase text-[10px] font-black ${styles[status] || ""}`}
      >
        {status?.replace("_", " ")}
      </Badge>
    );
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      dashboardTitle="Finance"
      pageName="Purchase Orders"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Purchase Orders" },
      ]}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-primary">
            Purchase Orders
          </h1>
          <p className="text-sm font-bold text-muted-foreground uppercase opacity-60">
            Manage orders placed with vendors
          </p>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO # or Vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 none-xl border-2 focus:ring-primary/20"
            />
          </div>
          <Button
            onClick={handleOpenCreate}
            className="none-xl h-11 px-6 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all font-black uppercase tracking-tighter group"
          >
            <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" />
            New Purchase Order
          </Button>
        </div>

        <Card className="none-4xl border-2 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b-2">
                    <th className="text-left p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Number
                    </th>
                    <th className="text-left p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Vendor
                    </th>
                    <th className="text-left p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Order Date
                    </th>
                    <th className="text-right p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Total
                    </th>
                    <th className="text-center p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Status
                    </th>
                    <th className="p-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    Array(5)
                      .fill(0)
                      .map((_, i) => (
                        <tr key={i}>
                          <td className="p-6">
                            <Skeleton className="h-4 w-24" />
                          </td>
                          <td className="p-6">
                            <Skeleton className="h-4 w-32" />
                          </td>
                          <td className="p-6">
                            <Skeleton className="h-4 w-20" />
                          </td>
                          <td className="p-6 text-right">
                            <Skeleton className="h-4 w-20 ml-auto" />
                          </td>
                          <td className="p-6 text-center">
                            <Skeleton className="h-6 w-16 mx-auto none-full" />
                          </td>
                          <td className="p-6"></td>
                        </tr>
                      ))
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-3 opacity-20">
                          <Package className="h-16 w-16" />
                          <p className="font-black uppercase tracking-widest text-lg">
                            No Purchase Orders Found
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr
                        key={order._id}
                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => handleOpenEdit(order)}
                      >
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-10 w-10 none-xl flex items-center justify-center ${order.status === "posted" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}
                            >
                              <Package className="h-5 w-5" />
                            </div>
                            <p className="font-black text-sm tracking-tight">
                              {order.name}
                            </p>
                          </div>
                        </td>
                        <td className="p-6 font-bold text-sm">
                          {order.partnerId?.header?.name || "No Vendor"}
                        </td>
                        <td className="p-6 text-sm text-muted-foreground font-medium">
                          {order.dateOrder
                            ? new Date(order.dateOrder).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="p-6 text-right">
                          <p className="font-black text-sm tracking-tighter">
                            ₹ {(order.totals?.amountTotal || 0).toLocaleString()}
                          </p>
                        </td>
                        <td className="p-6 text-center">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="p-6 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                className="h-8 w-8 p-0 none-full hover:bg-muted-foreground/10"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="none-xl border-2">
                              <DropdownMenuItem
                                onClick={() => handleOpenEdit(order)}
                                className="font-bold cursor-pointer"
                              >
                                <Eye className="mr-2 h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              {(order.status === DOCUMENT_STATUS.DRAFT ||
                                order.status === DOCUMENT_STATUS.CANCELLED) && (
                                <DropdownMenuItem
                                  onClick={() => handleDelete(order._id)}
                                  className="text-red-600 font-bold cursor-pointer"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          formData?._id ? `Purchase Order: ${formData.name}` : "Create Purchase Order"
        }
        className="max-w-[1400px]"
        footer={
          <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t">
            <div className="flex gap-2">
              {formData?.status === DOCUMENT_STATUS.DRAFT && formData?._id && (
                <Button
                  variant="outline"
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                  disabled={isSubmitting}
                  onClick={() => handleStatusChange(DOCUMENT_STATUS.PENDING_APPROVAL)}
                >
                  <Send className="h-3.5 w-3.5 mr-2" /> Submit for Approval
                </Button>
              )}
              {formData?.status === DOCUMENT_STATUS.PENDING_APPROVAL && (
                <Button
                  variant="outline"
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                  disabled={isSubmitting}
                  onClick={() => handleStatusChange(DOCUMENT_STATUS.APPROVED)}
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Approve
                </Button>
              )}
              {formData?.status === DOCUMENT_STATUS.APPROVED && (
                <Button
                  variant="outline"
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                  disabled={isSubmitting}
                  onClick={() => handleStatusChange(DOCUMENT_STATUS.POSTED)}
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Post Order
                </Button>
              )}
              {formData?.status &&
                formData.status !== DOCUMENT_STATUS.POSTED &&
                formData.status !== DOCUMENT_STATUS.CANCELLED &&
                formData?._id && (
                  <Button
                    variant="outline"
                    className="none-xl text-xs font-black tracking-widest uppercase border-2 text-red-600 border-red-200 hover:bg-red-50 transition-all px-6"
                    disabled={isSubmitting}
                    onClick={() => handleStatusChange(DOCUMENT_STATUS.CANCELLED)}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-2" /> Cancel Order
                  </Button>
                )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
                className="font-bold underline text-xs uppercase"
              >
                {formData?.status === DOCUMENT_STATUS.POSTED ? "Close" : "Discard"}
              </Button>
              {formData?.status !== DOCUMENT_STATUS.POSTED && (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="none-xl font-black text-xs uppercase px-8 shadow-xl shadow-primary/20"
                >
                  {isSubmitting
                    ? "Saving..."
                    : formData?._id
                      ? "Update Order"
                      : "Save Order"}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {formData && (
          <PurchaseOrderPopupContent
            formData={formData}
            setFormData={setFormData}
            isViewOnly={formData.status === DOCUMENT_STATUS.POSTED}
          />
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
