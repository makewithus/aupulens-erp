"use client";

import { PersistentModuleShell } from "@/components/dashboard/PersistentModuleShell";
import { SalesRouteDataPrefetcher } from "@/components/sales/SalesRouteDataPrefetcher";
import { salesSidebarConfig } from "@/config/sidebar/sales";

// userRole is deliberately not passed: Sales pages never passed one, so sidebar filtering and the plan badge stay as before.
export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersistentModuleShell
      sidebarSections={salesSidebarConfig}
      moduleLabel="Sales"
      rootHref="/sales/summary"
      profilePath="/sales/profile"
      bareWhenPathIncludes="/print/"
      extras={<SalesRouteDataPrefetcher />}
    >
      {children}
    </PersistentModuleShell>
  );
}
