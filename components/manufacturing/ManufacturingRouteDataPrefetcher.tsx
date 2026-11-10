"use client";

import { useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

// Each entry is that page's initial, unfiltered request set (cachedFetch keys on the exact URL), so warming it
// on hover/focus/touch lets the destination render from cache. Captured from the pages' real first load.
const PREFETCH_REQUESTS: Record<string, string[]> = {
  "/manufacturing/dashboard": ["/api/admin/org-settings", "/api/manufacturing/summary"],
  "/manufacturing/analytics": ["/api/manufacturing/analytics?range=30d"],
  "/manufacturing/items": ["/api/manufacturing/items?page=1&limit=10", "/api/accounting/accounts", "/api/admin/vendors"],
  "/manufacturing/products": ["/api/sales/products", "/api/sales/pricelists"],
  "/manufacturing/bom": ["/api/manufacturing/bom"],
  "/manufacturing/shipments": ["/api/manufacturing/shipments?page=1&limit=10", "/api/manufacturing/freight-providers", "/api/manufacturing/hs-codes"],
  "/manufacturing/freight-providers": ["/api/admin/org-settings"],
  "/manufacturing/tracking": ["/api/manufacturing/shipments"],
  "/manufacturing/customs-clearance": ["/api/manufacturing/customs-clearance"],
  "/manufacturing/documentation": ["/api/manufacturing/documents"],
  "/manufacturing/manufacturing": [
    "/api/inventory/operations/manufacturing?page=1&limit=10",
    "/api/inventory/operations/manufacturing?summary=true",
    "/api/sales/products?limit=100",
    "/api/users",
  ],
  "/manufacturing/reports": ["/api/admin/org-settings"],
  "/manufacturing/air-freight": ["/api/manufacturing/air-freight", "/api/manufacturing/freight-providers", "/api/manufacturing/shipments"],
  "/manufacturing/activity-logs": ["/api/manufacturing/activity-logs"],
};

/** Warm Manufacturing page data when navigation is likely: hover, touch, or keyboard focus. */
export function ManufacturingRouteDataPrefetcher() {
  useEffect(() => {
    const warmed = new Set<string>();
    const onIntent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const path = url.pathname.replace(/\/$/, "") || "/";
      const requests = PREFETCH_REQUESTS[path];
      if (!requests || warmed.has(path)) return;
      warmed.add(path);
      for (const request of requests) void cachedFetch(request).catch(() => {});
    };

    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("pointerdown", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    return () => {
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("pointerdown", onIntent);
      document.removeEventListener("focusin", onIntent);
    };
  }, []);

  return null;
}
