"use client";

import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="HR & Payroll"
      profilePath="/hr/profile"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/hr" })}
    >
      {children}
    </DashboardLayout>
  );
}
