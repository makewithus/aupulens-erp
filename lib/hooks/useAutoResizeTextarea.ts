import { useEffect } from "react";

/**
 * Auto-grows a chat <textarea> to fit its content as the user types — like
 * ChatGPT / Claude Code's composer — up to `maxHeight`, then lets it scroll
 * internally instead of growing further. Shared by the global AI panel and
 * every per-module AI Assistant page so all of them behave identically.
 */
export function useAutoResizeTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight = 200,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [ref, value, maxHeight]);
}
