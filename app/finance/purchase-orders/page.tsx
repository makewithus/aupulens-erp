"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";

import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import PurchaseOrderPopupContent from "@/components/finance/purchase-orders/PurchaseOrderPopupContent";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

const LIMIT = 10;

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={null}>
      <PurchaseOrdersPageInner />
    </Suspense>
  );
}

function PurchaseOrdersPageInner() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // AI-native "redirect with filters" — seed filter state from the URL
  // synchronously (lazy useState initializer) so the very first fetch
  // already uses them. `statusFilter`/`partnerId` have no filter UI on this
  // page yet, but the API accepts both, so an AI-initiated redirect can
  // still land on a pre-filtered list. `debouncedQuery` is seeded too (not
  // just `searchQuery`) so a seeded search term doesn't wait out its normal
  // 300ms typing-debounce.
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const [debouncedQuery, setDebouncedQuery] = useState(() => searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "");
  const [partnerId, setPartnerId] = useState(() => searchParams.get("partnerId") || "");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") || "");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, dateFrom, dateTo, statusFilter, partnerId]);

  const load = async (currentPage = page, search = debouncedQuery) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (statusFilter) params.set("status", statusFilter);
      if (partnerId) params.set("partnerId", partnerId);
      const res = await cachedFetch(`/api/finance/purchase-orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.items || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (error) {
      toast.error("Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page, debouncedQuery);
  }, [page, debouncedQuery, dateFrom, dateTo, statusFilter, partnerId]);

  const filteredOrders = orders;

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

  // AI-native: extract the PO's vendor + item lines → open the create modal
  // pre-filled. Vendor and products are resolved to real ids server-side when
  // named; the user reviews and clicks Create.
  useAiPrefill("finance_purchase_order", (p) => {
    const d = p.data || {};
    const lines = Array.isArray(d.lines) && d.lines.length
      ? d.lines.map((ln: any) => {
          const productQty = Number(ln.productQty) > 0 ? Number(ln.productQty) : 1;
          const priceUnit = Number(ln.priceUnit) || 0;
          return { productId: ln.productId || null, name: ln.name || "", productQty, priceUnit, priceSubtotal: productQty * priceUnit };
        })
      : [];
    const amountUntaxed = lines.reduce((acc: number, l: any) => acc + (l.priceSubtotal || 0), 0);
    setFormData({
      ...(d.partnerId ? { partnerId: d.partnerId } : {}),
      dateOrder: d.dateOrder || new Date().toISOString().split("T")[0],
      orderLines: lines,
      status: DOCUMENT_STATUS.DRAFT,
      totals: { amountUntaxed, amountTax: 0, amountTotal: amountUntaxed },
    });
    setIsModalOpen(true);
  });

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

      const res = await cachedFetch(url, {
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
      const res = await cachedFetch(`/api/finance/purchase-orders/${formData._id}`, {
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
      const res = await cachedFetch(`/api/finance/purchase-orders/${id}`, {
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
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
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
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="bg-muted/50 border-b-2">
                    <TableHead className="text-left p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Number
                    </TableHead>
                    <TableHead className="text-left p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Vendor
                    </TableHead>
                    <TableHead className="text-left p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Order Date
                    </TableHead>
                    <TableHead className="text-right p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Total
                    </TableHead>
                    <TableHead className="text-center p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Status
                    </TableHead>
                    <TableHead className="p-6"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {loading ? (
                    Array(5)
                      .fill(0)
                      .map((_, i) => (
                        <TableRow key={i}>
                          <TableCell className="p-6">
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                          <TableCell className="p-6">
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                          <TableCell className="p-6">
                            <Skeleton className="h-4 w-20" />
                          </TableCell>
                          <TableCell className="p-6 text-right">
                            <Skeleton className="h-4 w-20 ml-auto" />
                          </TableCell>
                          <TableCell className="p-6 text-center">
                            <Skeleton className="h-6 w-16 mx-auto none-full" />
                          </TableCell>
                          <TableCell className="p-6"></TableCell>
                        </TableRow>
                      ))
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-3 opacity-20">
                          <Package className="h-16 w-16" />
                          <p className="font-black uppercase tracking-widest text-lg">
                            No Purchase Orders Found
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow
                        key={order._id}
                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => handleOpenEdit(order)}
                      >
                        <TableCell className="p-6">
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
                        </TableCell>
                        <TableCell className="p-6 font-bold text-sm">
                          {order.partnerId?.header?.name || "No Vendor"}
                        </TableCell>
                        <TableCell className="p-6 text-sm text-muted-foreground font-medium">
                          {order.dateOrder
                            ? new Date(order.dateOrder).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell className="p-6 text-right">
                          <p className="font-black text-sm tracking-tighter">
                            ₹ {(order.totals?.amountTotal || 0).toLocaleString()}
                          </p>
                        </TableCell>
                        <TableCell className="p-6 text-center">
                          {getStatusBadge(order.status)}
                        </TableCell>
                        <TableCell className="p-6 text-right">
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
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t-2">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            )}
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
