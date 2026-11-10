"use client";

import { useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

export const PREFETCH_REQUESTS: Record<string, string[]> = {
  "/crm/dashboard": ["/api/crm/pipeline/analytics", "/api/crm/health", "/api/crm/churn", "/api/crm/renewals", "/api/crm/expansion", "/api/crm/opportunities?limit=5"],
  "/crm/analytics": ["/api/crm/analytics?range=all"],
  "/crm/leads": ["/api/admin/org-settings", "/api/crm/leads?page=1&limit=25"],
  "/crm/accounts": ["/api/admin/org-settings", "/api/crm/accounts?page=1&limit=25"],
  "/crm/contacts": ["/api/admin/org-settings", "/api/crm/contacts?page=1&limit=25"],
  "/crm/opportunities": ["/api/crm/opportunities?page=1&limit=25", "/api/crm/opportunities/kpis", "/api/crm/accounts"],
  "/crm/pipeline": ["/api/crm/pipeline", "/api/crm/pipeline/analytics"],
  "/crm/quotes": ["/api/crm/quotes?page=1&limit=10", "/api/crm/accounts", "/api/users"],
  "/crm/quotes/new": ["/api/crm/accounts", "/api/users"],
  "/crm/tasks": ["/api/crm/tasks?page=1&limit=25&view=my"],
  "/crm/cases": ["/api/crm/cases?page=1&limit=25&view=my", "/api/crm/cases/kpi?view=my"],
  "/crm/campaigns": ["/api/crm/campaigns?page=1&limit=25"],
  "/crm/campaigns/dashboard": ["/api/crm/reports/roi", "/api/crm/reports/campaigns"],
  "/crm/contracts": ["/api/crm/contracts?page=1&limit=25", "/api/crm/renewals"],
  "/crm/activities": ["/api/crm/activities?limit=15&page=1"],
  "/crm/documents": ["/api/crm/documents?"],
  "/crm/handoffs": ["/api/crm/handoffs", "/api/users"],
  "/crm/communications": ["/api/crm/communications"],
  "/crm/notifications": ["/api/crm/notifications"],
  "/crm/onboarding": ["/api/crm/onboarding"],
  "/crm/support": ["/api/admin/org-settings", "/api/crm/cases/kpi"],
  "/crm/workflows": ["/api/crm/automations"],
  "/crm/automations": ["/api/crm/automations"],
  "/crm/integrations": ["/api/crm/integrations"],
  "/crm/ai": ["/api/crm/ai/insights"],
  "/crm/ai/dashboard": ["/api/crm/ai/dashboard"],
  "/crm/executive": ["/api/crm/dashboard/summary"],
  "/crm/dashboard/executive": ["/api/crm/dashboard/summary"],
  "/crm/dashboard/manager": ["/api/crm/dashboard/summary"],
  "/crm/dashboard/sales": ["/api/crm/dashboard/summary"],
  "/crm/dashboard/support": ["/api/crm/dashboard/summary"],
  "/crm/reports": ["/api/crm/churn", "/api/crm/renewals"],
  "/crm/reports/executive": ["/api/crm/dashboard/summary"],
};

/** Warm a CRM page's first GETs when its navigation link is hovered or focused. */
export function CrmRouteDataPrefetcher() {
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
        if (parts.length === 3 && parts[0] === "crm") {
          const collection = parts[1];
          const id = parts[2];
          if (["accounts", "contacts", "leads", "opportunities", "cases", "contracts", "quotes", "campaigns"].includes(collection) && id !== "new") {
            requests = [`/api/crm/${collection}/${encodeURIComponent(id)}`];
          }
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
