'use client';
import React from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { crmSidebarConfig } from "@/config/sidebar/crm";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  return (
    <DashboardLayout
      dashboardTitle="CRM"
      companyName="Aupulens"
      sidebarConfig={crmSidebarConfig}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
    >
      {children}
    </DashboardLayout>
  );
}
