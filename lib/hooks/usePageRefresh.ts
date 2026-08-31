"use client";

import { useEffect, useRef } from "react";
import { usePageActionsStore } from "@/store/pageActionsStore";

/**
 * Registers this page's own data-refetch function as the handler for the
 * persistent DashboardLayout's header refresh button. Needed by pages that
 * live under a shared module `layout.tsx` (see app/crm/layout.tsx) instead
 * of wrapping their own `<DashboardLayout onRefresh={...}>` — the layout
 * only mounts once per module, so it can't take `onRefresh` as a per-page
 * prop the way a page-owned DashboardLayout could.
 *
 * Held in a ref so the effect doesn't need `fn` in its deps (a fresh inline
 * arrow function every render would otherwise re-register on every render).
 * Cleared on unmount so a stale page's refetch is never called after
 * navigating away.
 */
export function usePageRefresh(fn: () => void | Promise<void>): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const setOnRefresh = usePageActionsStore((s) => s.setOnRefresh);

  useEffect(() => {
    setOnRefresh(() => fnRef.current());
    return () => setOnRefresh(null);
  }, [setOnRefresh]);
}
