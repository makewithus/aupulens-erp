"use client";

import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { InvoiceForm } from "@/components/sales/invoices/InvoiceForm";

export default function CreateInvoicePage() {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="New Invoice"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Invoices", href: "/sales/invoices" },
        { label: "New" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <InvoiceForm mode="create" />
    </DashboardLayout>
  );
}
