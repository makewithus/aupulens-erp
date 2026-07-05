"use client";

import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SubscriptionForm } from "@/components/sales/subscriptions/SubscriptionForm";

export default function NewSubscriptionPage() {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="New Subscription"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Subscriptions", href: "/sales/subscriptions" },
        { label: "New" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6">
        <SubscriptionForm />
      </div>
    </DashboardLayout>
  );
}
