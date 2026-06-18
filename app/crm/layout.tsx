'use client';
import React from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { crmSidebarConfig } from "@/config/sidebar/crm";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout
      dashboardTitle="CRM"
      companyName="Aupulens"
      sidebarConfig={crmSidebarConfig}
    >
      {children}
    </DashboardLayout>
  );
}
