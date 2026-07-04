"use client";

import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { QuoteForm } from "@/components/sales/quotes/QuoteForm";

export default function NewQuotePage() {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="New Quote"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Quotes", href: "/sales/quotes" },
        { label: "New" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6">
        <QuoteForm />
      </div>
    </DashboardLayout>
  );
}
