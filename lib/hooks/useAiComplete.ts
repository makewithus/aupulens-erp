"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Debounced inline-completion hook (Copilot-style). Watches a field's value and,
 * after the user pauses typing, fetches a short continuation from
 * /api/ai/complete. Aggressively debounced + guarded so it never fires a model
 * call on every keystroke (cost discipline for this high-frequency feature).
 */
export function useAiComplete(
  value: string,
  label: string,
  opts?: { enabled?: boolean; context?: Record<string, unknown>; delayMs?: number },
) {
  const [suggestion, setSuggestion] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const enabled = opts?.enabled ?? true;
  const delay = opts?.delayMs ?? 650;
  // Keep context in a ref so it doesn't retrigger the effect on every render.
  const contextRef = useRef(opts?.context);
  contextRef.current = opts?.context;

  useEffect(() => {
    setSuggestion("");
    if (!enabled || !value || value.trim().length < 3) return;
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();

    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch("/api/ai/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, value, context: contextRef.current }),
          signal: controller.signal,
        });
        const data = await res.json();
        const s = typeof data?.suggestion === "string" ? data.suggestion : "";
        // Only surface a suggestion that actually extends the current text.
        setSuggestion(s && !value.endsWith(s) ? s : "");
      } catch {
        /* aborted or network error — no suggestion */
      }
    }, delay);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, [value, label, enabled, delay]);

  return { suggestion, clear: () => setSuggestion("") };
}
