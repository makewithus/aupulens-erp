"use client";

import { PersistentModuleShell } from "@/components/dashboard/PersistentModuleShell";
import { FinanceRouteDataPrefetcher } from "@/components/finance/FinanceRouteDataPrefetcher";
import { financeSidebarConfig } from "@/config/sidebar/finance";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersistentModuleShell
      sidebarSections={financeSidebarConfig}
      moduleLabel="Finance"
      rootHref="/finance/summary"
      profilePath="/finance/profile"
      fallbackRole="finance"
      extras={<FinanceRouteDataPrefetcher />}
    >
      {children}
    </PersistentModuleShell>
  );
}
