import { create } from "zustand";

/**
 * Lets a page register its own data-refetch function so the persistent
 * DashboardLayout's header refresh button can call it, even when the page
 * lives under a shared module `layout.tsx` (not passing `onRefresh` as a
 * direct prop). Registered on mount via `usePageRefresh`, cleared on unmount
 * so a stale page's refetch is never called after navigating away.
 */
interface PageActionsStore {
  onRefresh: (() => void | Promise<void>) | null;
  setOnRefresh: (fn: (() => void | Promise<void>) | null) => void;
}

export const usePageActionsStore = create<PageActionsStore>()((set) => ({
  onRefresh: null,
  setOnRefresh: (fn) => set({ onRefresh: fn }),
}));
