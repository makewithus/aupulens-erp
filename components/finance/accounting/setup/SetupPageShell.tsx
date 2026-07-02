"use client";

import { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";

export function SetupPageShell({
  title,
  description,
  breadcrumbLabel,
  children,
}: {
  title: string;
  description?: string;
  breadcrumbLabel: string;
  children: ReactNode;
}) {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName={title}
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Setup" },
        { label: breadcrumbLabel },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <AccountingSubNav />

        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>

        <div className="bg-card rounded-lg border shadow-sm p-6">{children}</div>
      </div>
    </DashboardLayout>
  );
}
