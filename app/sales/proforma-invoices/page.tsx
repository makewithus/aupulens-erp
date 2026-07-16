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
import { SearchInput } from "@/components/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FileText } from "lucide-react";

// Extracted Subcomponents
import { ProformaInvoiceTable } from "@/components/sales/proforma-invoices/ProformaInvoiceTable";
import { ProformaInvoiceModals } from "@/components/sales/proforma-invoices/ProformaInvoiceModals";

export default function ProformaInvoicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Data list and loading states
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Resources
  const [partners, setPartners] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  const [formData, setFormData] = useState<any>({
    partnerId: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    invoiceLines: [],
    state: "draft",
    moveType: "out_invoice",
    amountUntaxed: 0,
    amountTax: 0,
    amountTotal: 0,
    amountResidual: 0,
  });

  const loadResources = async () => {
    try {
      const pRes = await fetch("/api/sales/customers");
      const pData = await pRes.json();
      setPartners(pData.items || []);
    } catch (error) {
      console.error("Error loading resources:", error);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/accounting/invoices");
      const json = await res.json();
      setData(json.items || []);
    } catch (error) {
      console.error("Error loading invoices:", error);
      toast.error("Failed to load invoices");
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

  // Modal Open Triggers
  const handleOpenCreate = () => {
    setCurrentInvoice(null);
    setIsViewOnly(false);
    setFormData({
      partnerId: "",
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      invoiceLines: [],
      state: "draft",
      moveType: "out_invoice",
      amountUntaxed: 0,
      amountTax: 0,
      amountTotal: 0,
      amountResidual: 0,
      name: "Draft",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (invoice: any) => {
    setCurrentInvoice(invoice);
    setIsViewOnly(true);
    setFormData(invoice);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (invoice: any) => {
    setCurrentInvoice(invoice);
    setIsViewOnly(false);
    setFormData(invoice);
    setIsModalOpen(true);
  };

  // Operation Handlers
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const url = currentInvoice
        ? `/api/accounting/invoices/${currentInvoice._id}`
        : "/api/accounting/invoices";
      const method = currentInvoice ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save invoice");
      }

      toast.success(currentInvoice ? "Invoice updated" : "Invoice created");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmInvoice = async (id: string) => {
    try {
      const res = await fetch(`/api/accounting/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "posted", approvalRequired: false }),
      });

      if (!res.ok) throw new Error("Failed to confirm invoice");
      toast.success("Invoice confirmed");
      load();
    } catch (error) {
      toast.error("Failed to confirm invoice");
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmationId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationId) return;
    try {
      const res = await fetch(
        `/api/accounting/invoices/${deleteConfirmationId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Invoice deleted");
      load();
    } catch (error) {
      toast.error("Delete failed");
    } finally {
      setDeleteConfirmationId(null);
    }
  };

  const handlePrintInvoice = async (invoice: any) => {
    try {
      // Create a hidden iframe for printing
      const printFrame = document.createElement("iframe");
      printFrame.style.position = "absolute";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "none";
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document;
      if (!frameDoc) return;

      // Import InvoiceTemplate component dynamically
      const { InvoiceTemplate } =
        await import("@/components/accounting/InvoiceTemplate");
      const { renderToString } = await import("react-dom/server");

      // Render the invoice template to HTML
      const invoiceHTML = renderToString(InvoiceTemplate({ data: invoice }));

      // Write the HTML to the iframe with Tailwind CSS
      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice ${invoice.name}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @media print {
                body { 
                  margin: 0; 
                  padding: 0;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                @page { 
                  margin: 0;
                  size: A4;
                }
                * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
              }
              body { 
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: white;
              }
            </style>
          </head>
          <body>
            ${invoiceHTML}
            <script>
              // Wait for Tailwind to load, then print
              setTimeout(() => {
                window.print();
              }, 500);
            </script>
          </body>
        </html>
      `);
      frameDoc.close();

      // Clean up after printing
      const cleanup = () => {
        setTimeout(() => {
          if (document.body.contains(printFrame)) {
            document.body.removeChild(printFrame);
          }
        }, 1000);
      };

      // Listen for print dialog close
      printFrame.contentWindow?.addEventListener("afterprint", cleanup);

      // Fallback cleanup
      setTimeout(cleanup, 5000);
    } catch (error) {
      console.error("Print error:", error);
      toast.error("Failed to print invoice");
    }
  };

  // Filter calculations
  const filtered = data.filter((inv) => {
    const matchesQuery = [inv.name, inv.partnerId?.header?.name || ""].some(
      (v) => v.toLowerCase().includes(query.toLowerCase()),
    );
    const matchesStatus = statusFilter === "all" || inv.state === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Proforma Invoices"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Proforma Invoices" },
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
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Proforma Invoices</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filtered.length} {filtered.length === 1 ? "Invoice" : "Invoices"}
                </p>
              </div>

              <div className="w-full max-w-3xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search invoices..."
                  />
                </div>

                {/* Status select filter */}
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/40">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="posted">Posted</SelectItem>
                      <SelectItem value="cancel">Cancel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleOpenCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Invoice
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
                <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground font-mono text-xs">
                  No invoices found
                </p>
              </div>
            ) : (
              <ProformaInvoiceTable
                filtered={filtered}
                handlePrintInvoice={handlePrintInvoice}
                handleOpenView={handleOpenView}
                handleOpenEdit={handleOpenEdit}
                handleConfirmInvoice={handleConfirmInvoice}
                handleDelete={handleDelete}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Extracted modals block containing modular popups */}
      <ProformaInvoiceModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        formData={formData}
        setFormData={setFormData}
        isViewOnly={isViewOnly}
        currentInvoice={currentInvoice}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
        deleteConfirmationId={deleteConfirmationId}
        setDeleteConfirmationId={setDeleteConfirmationId}
        confirmDelete={confirmDelete}
        partners={partners}
      />
    </DashboardLayout>
  );
}
