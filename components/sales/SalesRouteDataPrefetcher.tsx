"use client";

import { useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

// Keep these URLs aligned with each page's initial, unfiltered request. The
// shared request cache lets the destination render its first data immediately.
const PREFETCH_REQUESTS: Record<string, string[]> = {
  "/sales": ["/api/sales/summary"],
  "/sales/dashboard": [
    "/api/sales/summary",
    "/api/sales/analytics",
    "/api/sales/orders?limit=5",
  ],
  "/sales/analytics": ["/api/sales/summary", "/api/sales/analytics?days=90"],
  "/sales/summary": ["/api/sales/summary"],
  "/sales/pipeline": ["/api/sales/pipeline"],
  "/sales/customers": [
    "/api/sales/customer-views",
    "/api/sales/customers?page=1&limit=10&excludeSupplierPartners=true&sortField=createdAt",
  ],
  "/sales/products": [
    "/api/sales/products?page=1&limit=10",
    "/api/accounting/accounts",
    "/api/sales/pricelists",
  ],
  "/sales/pricelist": ["/api/sales/products", "/api/sales/pricelists"],
  "/sales/quotes": [
    "/api/sales/quote-views",
    "/api/sales/quotes?status=all&page=1&limit=10",
  ],
  "/sales/invoices": ["/api/sales/invoices?search=&status=all&page=1&limit=25"],
  "/sales/sales-orders": [
    "/api/sales/sales-order-views",
    "/api/sales/sales-orders?sortField=createdAt&sortDir=desc",
  ],
  "/sales/payments": [
    "/api/sales/payment-views",
    "/api/sales/payments?page=1&limit=10&sortField=createdAt&sortDir=desc",
  ],
  "/sales/subscriptions": [
    "/api/sales/subscription-views",
    "/api/sales/subscriptions?page=1&limit=10&sortField=createdAt&sortDir=desc",
  ],
  "/sales/delivery-challans": [
    "/api/sales/delivery-challans",
    "/api/sales/customers",
    "/api/sales/products",
    "/api/inventory/warehouse",
  ],
  "/sales/export-docs": ["/api/sales/sale-orders"],
};

/** Warm Sales page data when navigation is likely: hover, touch, or keyboard focus. */
export function SalesRouteDataPrefetcher() {
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
      let requests = PREFETCH_REQUESTS[path];

      if (!requests) {
        const parts = path.split("/").filter(Boolean);
        if (parts[0] === "sales" && parts.length === 3 && parts[2] !== "new" && parts[2] !== "import") {
          const [collection, id] = parts.slice(1);
          const endpointByCollection: Record<string, string> = {
            customers: "customers",
            quotes: "quotes",
            invoices: "invoices",
            "sales-orders": "sales-orders",
            payments: "payments",
            subscriptions: "subscriptions",
          };
          const endpoint = endpointByCollection[collection];
          if (endpoint) requests = [`/api/sales/${endpoint}/${encodeURIComponent(id)}`];
        }
      }

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
