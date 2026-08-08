"use client";

import { useEffect, useRef } from "react";
import { consumePrefill, AiPrefill, PREFILL_EVENT } from "@/lib/ai/aiPrefill";

/**
 * Consume an AI form pre-fill for `target` and hand it to `apply`.
 *
 * Fires in BOTH situations:
 *  1. On mount — covers cross-page navigation (the assistant navigated here from
 *     a different page, which mounts this component fresh).
 *  2. On the PREFILL_EVENT window event — covers the "already on this page" case,
 *     where router.push(sameRoute) doesn't remount and the on-mount effect would
 *     never re-run. Without this, triggering "create an opportunity" while
 *     sitting on /crm/opportunities silently did nothing.
 *
 * consumePrefill() removes the stash on read, so it can never fire twice for the
 * same stash. `apply` is held in a ref so the listener is registered once.
 */
export function useAiPrefill(target: string, apply: (p: AiPrefill) => void): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const run = () => {
      const p = consumePrefill(target);
      if (p) applyRef.current(p);
    };
    run(); // on mount (cross-page navigation)
    window.addEventListener(PREFILL_EVENT, run);
    return () => window.removeEventListener(PREFILL_EVENT, run);
  }, [target]);
}
