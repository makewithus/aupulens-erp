"use client";

import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesOrderForm } from "@/components/sales/salesOrders/SalesOrderForm";

export default function NewSalesOrderPage() {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="New Sales Order"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Sales Orders", href: "/sales/sales-orders" },
        { label: "New" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6">
        <SalesOrderForm />
      </div>
    </DashboardLayout>
  );
}
