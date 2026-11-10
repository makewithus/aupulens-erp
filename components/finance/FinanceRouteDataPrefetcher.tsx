"use client";

import { useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

// Each entry is that page's initial, unfiltered request (cachedFetch keys on the exact URL), so warming it on
// hover/focus/touch lets the destination render from cache. Date-dependent first requests (balance-sheet date,
// GST period) are left out on purpose: a URL that doesn't match the page's own request would be wasted work.
export const PREFETCH_REQUESTS: Record<string, string[]> = {
  "/finance/summary": ["/api/finance/summary"],
  "/finance/analytics": ["/api/finance/summary"],
  "/finance/accounting/aged-partner": ["/api/admin/org-settings", "/api/finance/reports/aged?type=receivable"],
  "/finance/accounting/balance-sheet": ["/api/finance/reports/balance-sheet"],
  "/finance/accounting/bank-reconciliation": ["/api/finance/bank/statements?status=open", "/api/finance/journal-items?reconciled=false"],
  "/finance/accounting/chart-of-accounts": ["/api/finance/accounting/accounts?view=active", "/api/finance/accounting/account-types"],
  "/finance/accounting/fixed-assets": ["/api/finance/assets"],
  "/finance/accounting/journal-entries": ["/api/finance/journal-entries?page=1&limit=10"],
  "/finance/accounting/ledger": ["/api/finance/journal-items?page=1&limit=10"],
  "/finance/accounting/period-closing": ["/api/admin/org-settings", "/api/finance/period-closing"],
  "/finance/accounting/profit-loss": ["/api/finance/reports/p-l"],
  "/finance/accounting/trial-balance": ["/api/finance/reports/trial-balance"],
  "/finance/accounting/vouchers": ["/api/finance/journal-entries?page=1&limit=10&onlyVouchers=true"],
  "/finance/bills": ["/api/finance/bills?page=1&limit=25", "/api/sales/customers"],
  "/finance/expenses": ["/api/admin/org-settings", "/api/finance/expenses"],
  "/finance/payables": ["/api/finance/bills?page=1&limit=10"],
  "/finance/suppliers": ["/api/admin/org-settings", "/api/purchasing/suppliers?search="],
};

/** Warm Finance page data when navigation is likely: hover, touch, or keyboard focus. */
export function FinanceRouteDataPrefetcher() {
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
