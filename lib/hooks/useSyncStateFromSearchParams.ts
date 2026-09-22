"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Re-runs each setter in `syncers` whenever the URL's query string actually
 * changes after mount — not just once, on first load.
 *
 * Every "AI-native redirect with filters" list page seeds its filter state
 * from the URL with a lazy `useState(() => searchParams.get("x") || "")`
 * initializer. That only runs once, on first mount — correct when the AI
 * assistant sends the user to a page they weren't already on, but
 * `router.push()` to the SAME route the user is already sitting on does not
 * remount the page: the initializer never runs again, so the URL's new
 * filters never reach the page's state and the list on screen doesn't
 * change, even though the URL changed and the assistant's own message says
 * it applied them. This was reported as "the AI describes the filter but
 * never actually applies it while I'm already on the page."
 *
 * Usage — pass one no-arg callback per field, each doing exactly what that
 * field's own `useState(() => ...)` initializer already does, just wrapped
 * so it can run again later:
 *
 *   useSyncStateFromSearchParams({
 *     search: () => setSearch(searchParams.get("search") || ""),
 *     status: () => setStatusFilter(searchParams.get("status") || "all"),
 *   });
 *
 * The very first run is skipped — the page's own initializers already
 * applied the URL on mount, so re-running the identical setters then would
 * be redundant (harmless, but this keeps the hook a pure "changed since
 * mount" signal, and keeps consumers from depending on double-invocation).
 */
export function useSyncStateFromSearchParams(syncers: Record<string, () => void>): void {
  const searchParams = useSearchParams();
  const key = searchParams.toString();
  const syncersRef = useRef(syncers);
  syncersRef.current = syncers;
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    for (const sync of Object.values(syncersRef.current)) sync();
    // Intentionally keyed on the query string's own value, not the syncers
    // object (which is a fresh object every render) or individual setter
    // identities — this must fire exactly when the URL's params change, no
    // more and no less.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
