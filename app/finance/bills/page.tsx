"use client";

import { confirmDialog } from "@/components/providers/ConfirmRoot";
import React, { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { Plus } from "lucide-react";
import { DOCUMENT_STATUS, PAYMENT_STATE } from "@/lib/constants/statuses";

// Extracted Subcomponents
import { BillsTable } from "@/components/finance/bills/BillsTable";
import { BillsModals } from "@/components/finance/bills/BillsModals";

export default function VendorBillsPage() {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 25;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invoice Generation State
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceFormData, setInvoiceFormData] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);

  const load = async (currentPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      const [res, cRes] = await Promise.all([
        fetch(`/api/finance/bills?${params.toString()}`),
        fetch("/api/sales/customers"),
      ]);
      const data = await res.json();
      const cData = await cRes.json();
      setBills(data.items || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setCustomers(cData.items || []);
    } catch (error) {
      toast.error("Failed to load resources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
  }, [page]);

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
    if (!await confirmDialog({ title: "Delete this bill?" })) return;
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
      <div className="space-y-1">
        {/* Page Header Spacer */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2"></div>

        {/* Table & Filtering Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Vendor Bills</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {total} {total === 1 ? "Bill" : "Bills"} Total
                </p>
              </div>

              <div className="w-full max-w-xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search by bill or vendor..."
                  />
                </div>

                <Button
                  onClick={handleOpenCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Bill
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
            ) : filteredBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No bills found
                </p>
              </div>
            ) : (
              <BillsTable
                filteredBills={filteredBills}
                handleOpenEdit={handleOpenEdit}
                handleDelete={handleDelete}
                handleGenerateInvoiceFromBill={handleGenerateInvoiceFromBill}
              />
            )}
          </CardContent>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="border-t border-border/20 p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-mono text-muted-foreground/60">
                Showing {(page - 1) * LIMIT + 1} to {Math.min(page * LIMIT, total)} of {total} entries
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Prev
                </Button>
                <div className="text-xs font-mono text-foreground px-3">
                  {page} / {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none text-xs border-border/40 font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <BillsModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        formData={formData}
        setFormData={setFormData}
        isSubmitting={isSubmitting}
        setIsSubmitting={setIsSubmitting}
        handleSubmit={handleSubmit}
        load={load}
        isInvoiceModalOpen={isInvoiceModalOpen}
        setIsInvoiceModalOpen={setIsInvoiceModalOpen}
        invoiceFormData={invoiceFormData}
        setInvoiceFormData={setInvoiceFormData}
        customers={customers}
        isSubmittingInvoice={isSubmittingInvoice}
        handleSaveInvoice={handleSaveInvoice}
      />
    </DashboardLayout>
  );
}
