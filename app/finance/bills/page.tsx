"use client";

import React, { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import {
  Search,
  Plus,
  Filter,
  MoreHorizontal,
  Eye,
  Trash2,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Receipt,
  Download,
  Printer,
  ChevronRight,
  ShieldCheck,
  Send,
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
import BillPopupContent from "@/components/accounting/BillPopupContent";
import { InvoicePopupContent } from "@/components/accounting/InvoicePopupContent";
import { DOCUMENT_STATUS, PAYMENT_STATE } from "@/lib/constants/statuses";

export default function VendorBillsPage() {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invoice Generation State
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceFormData, setInvoiceFormData] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/bills");
      const data = await res.json();
      setBills(data.items || []);

      const cRes = await fetch("/api/sales/customers");
      const cData = await cRes.json();
      setCustomers(cData.items || []);
    } catch (error) {
      toast.error("Failed to load resources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredBills = useMemo(() => {
    return bills.filter(
      (b) =>
        b.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.partnerId?.header?.name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  }, [bills, searchQuery]);

  const handleOpenCreate = () => {
    setFormData({
      moveType: "in_invoice",
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: new Date().toISOString().split("T")[0],
      invoiceLines: [],
      state: DOCUMENT_STATUS.DRAFT,
      currencyId: "INR",
      amountUntaxed: 0,
      amountTax: 0,
      amountTotal: 0,
      paymentState: PAYMENT_STATE.NOT_PAID,
      poMatchType: "2_way",
      poMatchStatus: "pending",
      manualReviewRequired: false,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (bill: any) => {
    setFormData({ ...bill });
    setIsModalOpen(true);
  };

  const handleSubmit = async (statusOverride?: string) => {
    if (!formData.partnerId) {
      toast.error("Vendor is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const isUpdate = !!formData._id;
      const url = isUpdate
        ? `/api/finance/bills/${formData._id}`
        : "/api/finance/bills";
      const method = isUpdate ? "PATCH" : "POST";

      const payload = {
        ...formData,
        state: statusOverride || formData.state || DOCUMENT_STATUS.DRAFT,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(
          statusOverride === DOCUMENT_STATUS.POSTED
            ? "Bill posted to GL"
            : isUpdate
              ? "Bill updated"
              : "Bill created",
        );
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bill?")) return;
    try {
      const res = await fetch(`/api/finance/bills/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Bill deleted");
        load();
      }
    } catch (error) {
      toast.error("Delete failed");
    }
  };

  const handleGenerateInvoiceFromBill = (bill: any) => {
    const invoiceData = {
      moveType: "out_invoice",
      partnerId: null, // User must select customer
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: new Date().toISOString().split("T")[0],
      invoiceLines: bill.invoiceLines.map((line: any) => ({
        productId: line.productId,
        name: line.name,
        quantity: line.quantity,
        priceUnit: line.priceUnit,
        priceSubtotal: line.priceSubtotal,
        accountId: line.accountId,
      })),
      state: "draft",
      currencyId: bill.currencyId || "INR",
      amountUntaxed: bill.amountUntaxed,
      amountTax: bill.amountTax,
      amountTotal: bill.amountTotal,
      sourceDocument: bill.name,
    };
    setInvoiceFormData(invoiceData);
    setIsInvoiceModalOpen(true);
  };

  const handleSaveInvoice = async () => {
    if (!invoiceFormData.partnerId) {
      toast.error("Customer is required");
      return;
    }
    setIsSubmittingInvoice(true);
    try {
      const res = await fetch("/api/accounting/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceFormData),
      });

      if (res.ok) {
        toast.success("Customer Invoice generated successfully");
        setIsInvoiceModalOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to generate invoice");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setIsSubmittingInvoice(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200 uppercase text-[10px] font-black"
          >
            Draft
          </Badge>
        );
      case "pending_approval":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700 border-yellow-200 uppercase text-[10px] font-black"
          >
            Pending Approval
          </Badge>
        );
      case "approved":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 uppercase text-[10px] font-black"
          >
            Approved
          </Badge>
        );
      case "posted":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-[10px] font-black"
          >
            Posted
          </Badge>
        );
      case "cancel":
        return (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200 uppercase text-[10px] font-black"
          >
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="uppercase text-[10px] font-black">
            {status}
          </Badge>
        );
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      dashboardTitle="Finance"
      pageName="Vendor Bills"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Vendor Bills" },
      ]}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-primary">
            Vendor Bills
          </h1>
          <p className="text-sm font-bold text-muted-foreground uppercase opacity-60">
            Manage accounts payable and supplier invoices
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Bill # or Vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 none-xl border-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="none-xl h-11 px-4 border-2 font-bold uppercase text-xs"
            >
              <Filter className="mr-2 h-4 w-4" /> Filter
            </Button>
            <Button
              onClick={handleOpenCreate}
              className="none-xl h-11 px-6 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all font-black uppercase tracking-tighter group"
            >
              <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" />
              New Bill
            </Button>
          </div>
        </div>

        {/* Table/List */}
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
                      Bill Date
                    </th>
                    <th className="text-left p-6 text-[10px] font-black uppercase tracking-widest opacity-60">
                      Due Date
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
                  ) : filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-3 opacity-20">
                          <Receipt className="h-16 w-16" />
                          <p className="font-black uppercase tracking-widest text-lg">
                            No Bills Found
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredBills.map((bill) => (
                      <tr
                        key={bill._id}
                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => handleOpenEdit(bill)}
                      >
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-10 w-10 none-xl flex items-center justify-center ${bill.state === "posted" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}
                            >
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-black text-sm tracking-tight">
                                {bill.name}
                              </p>
                              {bill.sourceDocument && (
                                <p className="text-[10px] text-muted-foreground font-bold">
                                  {bill.sourceDocument}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-6 font-bold text-sm">
                          {bill.partnerId?.header?.name || "No Vendor"}
                        </td>
                        <td className="p-6 text-sm text-muted-foreground font-medium">
                          {new Date(bill.invoiceDate).toLocaleDateString()}
                        </td>
                        <td className="p-6 text-sm">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium text-muted-foreground">
                              {new Date(bill.dueDate).toLocaleDateString()}
                            </span>
                          </div>
                        </td>
                        <td className="p-6 text-right">
                          <p className="font-black text-sm tracking-tighter">
                            {bill.currencyId}{" "}
                            {bill.amountTotal?.toLocaleString()}
                          </p>
                        </td>
                        <td className="p-6 text-center">
                          {getStatusBadge(bill.state)}
                          {bill.manualReviewRequired && (
                            <p className="text-[9px] mt-1 uppercase font-black text-red-600">
                              Manual Review
                            </p>
                          )}
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
                            <DropdownMenuContent
                              align="end"
                              className="none-xl border-2"
                            >
                              <DropdownMenuItem
                                onClick={() => handleOpenEdit(bill)}
                                className="font-bold cursor-pointer"
                              >
                                <Eye className="mr-2 h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem className="font-bold cursor-pointer">
                                <Printer className="mr-2 h-4 w-4" /> Print Bill
                              </DropdownMenuItem>
                              {bill.state === "draft" && (
                                <DropdownMenuItem
                                  onClick={() => handleDelete(bill._id)}
                                  className="text-red-600 font-bold cursor-pointer"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  Draft
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() =>
                                  handleGenerateInvoiceFromBill(bill)
                                }
                                className="font-bold cursor-pointer text-primary"
                              >
                                <Send className="mr-2 h-4 w-4" /> Generate
                                Invoice
                              </DropdownMenuItem>
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
          formData?._id ? `Vendor Bill: ${formData.name}` : "Create Vendor Bill"
        }
        className="max-w-[1400px]"
        footer={
          <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t">
            <div className="flex gap-2">
              {formData?.state === DOCUMENT_STATUS.DRAFT && (
                <Button
                  variant="outline"
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      const res = await fetch(`/api/finance/bills/${formData._id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          poMatchType: formData.poMatchType || "2_way",
                          poMatchStatus: "matched",
                          state: DOCUMENT_STATUS.PENDING_APPROVAL,
                        }),
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error || "PO match failed");
                      toast.success("PO matched. AP invoice moved to approval.");
                      setIsModalOpen(false);
                      load();
                    } catch (error: any) {
                      toast.error(error.message || "PO match failed");
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Match PO & Send Approval
                </Button>
              )}
              {formData?.state === DOCUMENT_STATUS.DRAFT && (
                <Button
                  variant="outline"
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 text-red-600 border-red-200 hover:bg-red-50 transition-all px-6"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      const res = await fetch(`/api/finance/bills/${formData._id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          poMatchStatus: "mismatch",
                          manualReviewRequired: true,
                          discrepancyNotes:
                            formData.discrepancyNotes || "PO mismatch flagged for manual review",
                        }),
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error || "Manual review update failed");
                      toast.success("Discrepancy logged. Sent to manual review.");
                      setIsModalOpen(false);
                      load();
                    } catch (error: any) {
                      toast.error(error.message || "Manual review update failed");
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  <XCircle className="h-3.5 w-3.5 mr-2" /> Mark Discrepancy
                </Button>
              )}
              {formData?.state === DOCUMENT_STATUS.PENDING_APPROVAL && (
                <Button
                  variant="outline"
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      const res = await fetch(`/api/finance/bills/${formData._id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ state: DOCUMENT_STATUS.APPROVED }),
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error || "Approval failed");
                      toast.success("Bill approved");
                      setIsModalOpen(false);
                      load();
                    } catch (error: any) {
                      toast.error(error.message || "Approval failed");
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Approve
                </Button>
              )}
              {formData?.state === DOCUMENT_STATUS.APPROVED &&
                (formData?.paymentState || PAYMENT_STATE.NOT_PAID) === PAYMENT_STATE.NOT_PAID && (
                  <Button
                    variant="outline"
                    className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      try {
                        const res = await fetch(`/api/finance/bills/${formData._id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            paymentState: PAYMENT_STATE.IN_PAYMENT,
                            paymentScheduledDate:
                              formData.paymentScheduledDate || formData.dueDate || new Date(),
                          }),
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.error || "Payment scheduling failed");
                        toast.success("Payment scheduled");
                        setIsModalOpen(false);
                        load();
                      } catch (error: any) {
                        toast.error(error.message || "Payment scheduling failed");
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    <Clock className="h-3.5 w-3.5 mr-2" /> Schedule Payment
                  </Button>
                )}
              {formData?.state === DOCUMENT_STATUS.APPROVED &&
                formData?.paymentState === PAYMENT_STATE.IN_PAYMENT && (
                  <Button
                    variant="outline"
                    className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      try {
                        const res = await fetch(`/api/finance/bills/${formData._id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            paymentState: PAYMENT_STATE.PAID,
                            paidDate: new Date(),
                          }),
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.error || "Payment execution failed");
                        toast.success("Payment executed");
                        setIsModalOpen(false);
                        load();
                      } catch (error: any) {
                        toast.error(error.message || "Payment execution failed");
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    <Receipt className="h-3.5 w-3.5 mr-2" /> Execute Payment
                  </Button>
                )}
              {formData?.state === DOCUMENT_STATUS.APPROVED &&
                formData?.paymentState === PAYMENT_STATE.PAID && (
                <Button
                  variant="outline"
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit(DOCUMENT_STATUS.POSTED)}
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Post to GL
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
                className="font-bold underline text-xs uppercase"
              >
                {formData?.state === DOCUMENT_STATUS.POSTED ? "Close" : "Discard"}
              </Button>
                {formData?.state === DOCUMENT_STATUS.DRAFT && (
                <Button
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting}
                  className="none-xl font-black text-xs uppercase px-8 shadow-xl shadow-primary/20"
                >
                  {isSubmitting
                    ? "Saving..."
                    : formData?._id
                      ? "Update Draft"
                      : "Save Record"}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {formData && (
          <BillPopupContent
            formData={formData}
            setFormData={setFormData}
            isViewOnly={formData.state !== DOCUMENT_STATUS.DRAFT}
          />
        )}
      </ModularModal>

      <ModularModal
        open={isInvoiceModalOpen}
        onOpenChange={setIsInvoiceModalOpen}
        title="Generate Customer Invoice"
        className="max-w-[1400px]"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4 bg-muted/5 border-t">
            <Button
              variant="ghost"
              onClick={() => setIsInvoiceModalOpen(false)}
              className="font-bold underline text-xs uppercase"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveInvoice}
              disabled={isSubmittingInvoice}
              className="none-xl font-black text-xs uppercase px-8 shadow-xl shadow-primary/20"
            >
              {isSubmittingInvoice ? "Saving..." : "Create Invoice"}
            </Button>
          </div>
        }
      >
        {invoiceFormData && (
          <InvoicePopupContent
            formData={invoiceFormData}
            setFormData={setInvoiceFormData}
            partners={customers}
            isViewOnly={false}
          />
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
