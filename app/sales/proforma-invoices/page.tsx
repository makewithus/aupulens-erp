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
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  FileText,
  Eye,
  Edit2,
  Trash2,
  CheckCircle2,
  Loader2,
  Printer,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { InvoicePopupContent } from "@/components/accounting/InvoicePopupContent";

export default function ProformaInvoicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
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
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<
    string | null
  >(null);

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
        body: JSON.stringify({ state: "posted" }),
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

  const filtered = data.filter((inv) => {
    const matchesQuery = [inv.name, inv.partnerId?.header?.name || ""].some(
      (v) => v.toLowerCase().includes(query.toLowerCase()),
    );
    const matchesStatus = statusFilter === "all" || inv.state === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const getStatusBadge = (state: string) => {
    const variants: Record<string, any> = {
      draft: "secondary",
      posted: "default",
      cancel: "destructive",
    };
    return (
      <Badge variant={variants[state] || "secondary"} className="capitalize">
        {state}
      </Badge>
    );
  };

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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Proforma Invoices</h1>
            <p className="text-sm text-muted-foreground">
              Manage your customer invoices
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-64 bg-background"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Invoice
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
                <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground font-medium">
                  No invoices found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 text-left">Invoice #</th>
                      <th className="px-6 py-3 text-left">Customer</th>
                      <th className="px-6 py-3 text-left">Total</th>
                      <th className="px-6 py-3 text-left">Status</th>
                      <th className="px-6 py-3 text-left">Date</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {filtered.map((inv) => (
                      <tr
                        key={inv._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap font-medium flex items-center gap-3">
                          <div className="h-8 w-8 bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center rounded text-purple-600">
                            <FileText className="h-4 w-4" />
                          </div>
                          {inv.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {inv.partnerId?.header?.name || "Unknown"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold">
                          ₹{inv.amountTotal?.toLocaleString() || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(inv.state)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground text-xs">
                          {new Date(inv.invoiceDate).toLocaleDateString()}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrintInvoice(inv)}
                            title="Print Invoice"
                            className="h-8 w-8 text-purple-600"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenView(inv)}
                            className="h-8 w-8 text-blue-600"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {inv.state === "draft" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEdit(inv)}
                                className="h-8 w-8 text-indigo-600"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleConfirmInvoice(inv._id)}
                                title="Confirm Invoice"
                                className="h-8 w-8 text-green-600"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(inv._id)}
                                className="h-8 w-8 text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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
            ? "View Invoice"
            : currentInvoice
              ? "Edit Invoice"
              : "New Invoice"
        }
        className="max-w-[95vw]"
        footer={
          isViewOnly ? (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Close
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Invoice"
                )}
              </Button>
            </div>
          )
        }
      >
        <InvoicePopupContent
          formData={formData}
          setFormData={setFormData}
          isViewOnly={isViewOnly}
          partners={partners}
        />
      </ModularModal>

      {deleteConfirmationId && (
        <ModularModal
          open={!!deleteConfirmationId}
          onOpenChange={() => setDeleteConfirmationId(null)}
          title="Confirm Delete"
          description="Are you sure you want to delete this invoice? This action cannot be undone."
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmationId(null)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          }
        >
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete the invoice from the system.
            </p>
          </div>
        </ModularModal>
      )}
    </DashboardLayout>
  );
}
