'use client';
import React from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { crmSidebarConfig } from "@/config/sidebar/crm";
import { CrmRouteDataPrefetcher } from "@/components/crm/CrmRouteDataPrefetcher";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  // This layout combines a prefetcher with the active CRM route. Normalize the
  // sibling list here so React receives stable keys before DashboardLayout
  // renders the children.
  const layoutChildren = React.Children.toArray([
    <CrmRouteDataPrefetcher key="crm-route-data-prefetcher" />,
    children,
  ]);

  return (
    <DashboardLayout
      dashboardTitle="CRM"
      companyName="Aupulens"
      sidebarConfig={crmSidebarConfig}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
    >
      {layoutChildren}
    </DashboardLayout>
  );
}
