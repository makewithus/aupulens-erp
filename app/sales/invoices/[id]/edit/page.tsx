"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { InvoiceForm } from "@/components/sales/invoices/InvoiceForm";
import { FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";

export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/sales/invoices/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setInvoice(data.data);
        else setError(data.message || "Invoice not found");
      })
      .catch(() => setError("Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Edit Invoice"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Invoices", href: "/sales/invoices" },
        { label: "Edit" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      {loading ? (
        <FullPageLoadingSkeleton />
      ) : error || !invoice ? (
        <div className="flex justify-center items-center h-96 text-muted-foreground">{error || "Invoice not found"}</div>
      ) : (
        <InvoiceForm mode="edit" invoiceId={params.id} initialInvoice={invoice} />
      )}
    </DashboardLayout>
  );
}
