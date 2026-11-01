"use client";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";

export default function DocumentIntelligenceLoading() {
  return (
    <DashboardLayout sidebarSections={adminSidebarConfig} dashboardTitle="Admin" pageName="Document Intelligence">
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground" aria-busy="true">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-current border-r-transparent" />
        <span className="sr-only">Loading document intelligence</span>
      </div>
    </DashboardLayout>
  );
}
