"use client";

import { cachedFetch } from "@/lib/api/cachedFetch";
import { PREFETCH_REQUESTS as SALES } from "@/components/sales/SalesRouteDataPrefetcher";
import { PREFETCH_REQUESTS as INVENTORY } from "@/components/inventory/InventoryRouteDataPrefetcher";
import { PREFETCH_REQUESTS as FINANCE } from "@/components/finance/FinanceRouteDataPrefetcher";
import { PREFETCH_REQUESTS as MANUFACTURING } from "@/components/manufacturing/ManufacturingRouteDataPrefetcher";
import { PREFETCH_REQUESTS as HR } from "@/components/hr/HrRouteDataPrefetcher";

const MAPS = [SALES, INVENTORY, FINANCE, MANUFACTURING, HR];
const warmed = new Set<string>();

/**
 * Warm a page's first data requests before the user gets there. Used by the module tabs, so switching module
 * (which mounts a different layout) already has the landing page's data cached. Paths with no entry are a no-op.
 */
export function warmRouteData(path: string) {
  if (warmed.has(path)) return;
  const requests = MAPS.map((map) => map[path]).find(Boolean);
  if (!requests) return;
  warmed.add(path);
  for (const request of requests) void cachedFetch(request).catch(() => {});
}
