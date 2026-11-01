"use client";

import { useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

const PREFETCH_REQUESTS: Record<string, string[]> = {
  "/hr": ["/api/hr/summary", "/api/hr/leave?status=pending&limit=5"],
  "/hr/dashboard": ["/api/hr/summary", "/api/hr/leave?status=pending&limit=5"],
  "/hr/analytics": ["/api/hr/analytics?range=1y"],
  "/hr/employees": ["/api/hr/employees?page=1&limit=25", "/api/hr/departments"],
  "/hr/departments": ["/api/hr/departments", "/api/hr/employees"],
  "/hr/onboarding": ["/api/hr/employees?lifecycle=onboarding,candidate"],
  "/hr/exit": ["/api/hr/employees?lifecycle=on_notice,exit_initiated,clearance"],
  "/hr/attendance": ["/api/hr/attendance?page=1&limit=25", "/api/hr/employees"],
  "/hr/leave": ["/api/hr/leave?page=1&limit=25", "/api/hr/employees"],
  "/hr/payroll": ["/api/hr/payroll?"],
  "/hr/performance": ["/api/hr/employees?lifecycle=active", "/api/hr/performance"],
  "/hr/reports": ["/api/hr/summary"],
};

function todayLocalDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Warm the first HR requests when a navigation link is hovered, touched, or focused. */
export function HrRouteDataPrefetcher() {
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

      if (path === "/hr/attendance") {
        requests = [
          `/api/hr/attendance?page=1&limit=25&date=${todayLocalDate()}`,
          "/api/hr/employees",
        ];
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
