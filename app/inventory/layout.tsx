"use client";

import { PersistentModuleShell } from "@/components/dashboard/PersistentModuleShell";
import { InventoryRouteDataPrefetcher } from "@/components/inventory/InventoryRouteDataPrefetcher";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersistentModuleShell
      sidebarSections={inventorySidebarConfig}
      moduleLabel="Inventory"
      rootHref="/inventory/dashboard"
      profilePath="/inventory/profile"
      fallbackRole="inventory"
      extras={<InventoryRouteDataPrefetcher />}
    >
      {children}
    </PersistentModuleShell>
  );
}
