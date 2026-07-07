"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { PaymentForm } from "@/components/sales/payments/PaymentForm";

export default function NewPaymentPage() {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Record Payment"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Payments", href: "/sales/payments" }, { label: "Record Payment" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6">
        <Suspense fallback={null}>
          <PaymentForm />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
