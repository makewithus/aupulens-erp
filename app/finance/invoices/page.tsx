"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { Plus } from "lucide-react";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

// Extracted Subcomponents
import { InvoicesTable } from "@/components/finance/invoices/InvoicesTable";
import { InvoicesModals } from "@/components/finance/invoices/InvoicesModals";

export default function SalesInvoicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null); // Invoice Object

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [invRes, custRes] = await Promise.all([
        fetch("/api/accounting/invoices"),
        fetch("/api/sales/customers"),
      ]);

      const jsonInv = await invRes.json();
      const jsonCust = await custRes.json();

      setData(jsonInv.items || []);
      setPartners(jsonCust.items || []);
    } catch (error) {
      console.error("Error loading invoices:", error);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/sales");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleOpenCreate = () => {
    setFormData({
      name: "Draft",
      partnerId: "",
      invoiceDate: new Date(),
      dueDate: new Date(),
      state: DOCUMENT_STATUS.DRAFT,
      invoiceLines: [],
      amountUntaxed: 0,
      amountTax: 0,
      amountTotal: 0,
      currencyId: "INR",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (invoice: any) => {
    setFormData(invoice);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.partnerId) {
      toast.error("Please select a customer");
      return;
    }
    setIsSubmitting(true);
    try {
      const url = formData._id
        ? `/api/accounting/invoices/${formData._id}`
        : "/api/accounting/invoices";
      const method = formData._id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("Failed to save invoice");
      }

      toast.success("Invoice saved");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = data.filter((inv) => {
    const matchesQuery = [
      inv.name,
      inv.partnerId?.header?.name || inv.partnerId?.name || "Unknown",
      inv.sourceDocument || "",
    ].some((v) => v.toLowerCase().includes(query.toLowerCase()));
    return matchesQuery;
  });

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Invoices"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Invoices" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
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
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Invoices</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filtered.length} {filtered.length === 1 ? "Invoice" : "Invoices"} Total
                </p>
              </div>

              <div className="w-full max-w-xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search invoices..."
                  />
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
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No invoices found
                </p>
              </div>
            ) : (
              <InvoicesTable
                filtered={filtered}
                handleOpenView={handleOpenView}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <InvoicesModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        isSubmitting={isSubmitting}
        setIsSubmitting={setIsSubmitting}
        formData={formData}
        setFormData={setFormData}
        partners={partners}
        load={load}
        handleSubmit={handleSubmit}
      />
    </DashboardLayout>
  );
}
