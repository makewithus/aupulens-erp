"use client";

import { PersistentModuleShell } from "@/components/dashboard/PersistentModuleShell";
import { ManufacturingRouteDataPrefetcher } from "@/components/manufacturing/ManufacturingRouteDataPrefetcher";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersistentModuleShell
      sidebarSections={manufacturingSidebarConfig}
      moduleLabel="Manufacturing"
      rootHref="/manufacturing/dashboard"
      profilePath="/manufacturing/profile"
      fallbackRole="manufacturing"
      extras={<ManufacturingRouteDataPrefetcher />}
    >
      {children}
    </PersistentModuleShell>
  );
}
