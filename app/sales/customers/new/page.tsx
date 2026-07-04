"use client";

import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { CustomerForm } from "@/components/sales/customers/CustomerForm";

export default function NewCustomerPage() {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="New Customer"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Customers", href: "/sales/customers" },
        { label: "New" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6">
        <CustomerForm />
      </div>
    </DashboardLayout>
  );
}
