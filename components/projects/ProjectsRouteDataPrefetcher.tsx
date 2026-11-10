"use client";

import { useEffect } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";

// Each entry is that page's initial request set (cachedFetch keys on the exact URL), captured from the real first load.
export const PREFETCH_REQUESTS: Record<string, string[]> = {
  "/projects/dashboard": ["/api/projects"],
  "/projects/list": ["/api/projects"],
};

/** Warm Projects page data when navigation is likely: hover, touch, or keyboard focus. */
export function ProjectsRouteDataPrefetcher() {
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
        if (parts.length === 2 && parts[0] === "projects" && !["dashboard", "list"].includes(parts[1])) {
          requests = [`/api/projects/${encodeURIComponent(parts[1])}`];
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
