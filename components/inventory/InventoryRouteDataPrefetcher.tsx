"use client";

import { useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

const PREFETCH_REQUESTS: Record<string, string[]> = {
  "/inventory": ["/api/inventory/summary"],
  "/inventory/dashboard": [
    "/api/inventory/summary",
    "/api/inventory/stock-moves",
    "/api/inventory/warehouse",
    "/api/inventory/alerts",
  ],
  "/inventory/summary": ["/api/inventory/summary"],
  "/inventory/analytics": [
    "/api/inventory/warehouse",
    "/api/inventory/stock",
    "/api/inventory/batch",
    "/api/inventory/orders?limit=1000",
    "/api/inventory/stock-moves",
  ],
  "/inventory/stock": [
    "/api/inventory/stock",
    "/api/accounting/accounts",
    "/api/sales/pricelists",
    "/api/sales/products?page=1&limit=10&query=",
  ],
  "/inventory/batch": [
    "/api/inventory/batch?page=1&limit=10",
    "/api/inventory/batch",
    "/api/inventory/warehouse",
  ],
  "/inventory/warehouse": ["/api/inventory/warehouse"],
  "/inventory/alerts": ["/api/inventory/alerts?page=1&limit=10"],
  "/inventory/orders": [
    "/api/inventory/orders?page=1&limit=25",
    "/api/inventory/warehouse",
    "/api/sales/products?limit=1000",
    "/api/inventory/stock",
    "/api/sales/customers",
  ],
  "/inventory/stock-moves": [
    "/api/inventory/stock-moves?",
    "/api/inventory/warehouse",
    "/api/sales/products?limit=200",
  ],
  "/inventory/operations/receipts": [
    "/api/inventory/operations/transfers?type=incoming&page=1&limit=10",
    "/api/inventory/operations/transfers?type=incoming",
    "/api/sales/products?limit=100",
    "/api/sales/customers",
    "/api/users",
  ],
  "/inventory/operations/deliveries": [
    "/api/inventory/operations/transfers?type=outgoing&page=1&limit=10",
    "/api/inventory/operations/transfers?type=outgoing",
    "/api/sales/products?limit=100",
    "/api/sales/customers",
    "/api/users",
  ],
  "/inventory/operations/manufacturing": [
    "/api/inventory/operations/manufacturing?page=1&limit=10",
    "/api/inventory/operations/manufacturing",
    "/api/sales/products?limit=100",
    "/api/users",
  ],
  "/inventory/operations/returns": [
    "/api/inventory/operations/returns?page=1&limit=10",
    "/api/sales/products?limit=100",
    "/api/sales/customers",
    "/api/users",
  ],
  "/inventory/reports": [
    "/api/inventory/stock",
    "/api/sales/products?limit=1000",
    "/api/inventory/stock-moves",
    "/api/inventory/batch",
  ],
};

/** Warm inventory screens when their navigation link is hovered, touched, or focused. */
export function InventoryRouteDataPrefetcher() {
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
