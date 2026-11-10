"use client";

import { useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

// Each entry is that page's initial request set (cachedFetch keys on the exact URL), captured from the real first load.
export const PREFETCH_REQUESTS: Record<string, string[]> = {
  "/admin/dashboard": ["/api/admin/org-settings", "/api/admin/dashboard"],
  "/admin/users": ["/api/admin/org-settings", "/api/users?page=1&limit=25"],
  "/admin/settings": ["/api/admin/org-settings"],
  "/admin/tasks": ["/api/admin/tasks", "/api/users"],
  "/admin/vendors": ["/api/admin/vendors"],
  "/admin/billing": ["/api/billing/plans", "/api/billing/invoices", "/api/billing/credit-notes"],
  "/admin/activity-logs": ["/api/activity-logs?limit=200"],
  "/admin/ai-studio": ["/api/admin/ai-usage"],
  "/admin/business-twin": ["/api/twin"],
  "/admin/org-structure": ["/api/org/units"],
  "/admin/profile": ["/api/users/me"],
};

/** Warm Admin page data when navigation is likely: hover, touch, or keyboard focus. */
export function AdminRouteDataPrefetcher() {
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
