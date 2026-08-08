"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import { useAiComplete } from "@/lib/hooks/useAiComplete";

interface AiTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (v: string) => void;
  /** Human label of the field — steers the completion (e.g. "Lead notes"). */
  label: string;
  /** Other form values, for context-aware suggestions. */
  aiContext?: Record<string, unknown>;
  aiEnabled?: boolean;
}

/**
 * Copilot-style textarea: as the user types, a debounced AI continuation shows
 * as greyed ghost text; pressing Tab accepts it. Fully reusable — drop it in for
 * any notes/description/remarks field. The overlay and the textarea share one
 * style string so the ghost text lines up exactly with the typed text.
 * It only suggests; the user always types/accepts — nothing is auto-filled.
 */
export function AiTextarea({ value, onValueChange, label, aiContext, aiEnabled = true, className, onKeyDown, ...props }: AiTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { suggestion, clear } = useAiComplete(value, label, { enabled: aiEnabled, context: aiContext });

  const accept = () => {
    if (!suggestion) return;
    const next = (value || "") + suggestion;
    onValueChange(next);
    clear();
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); el.setSelectionRange(next.length, next.length); }
    });
  };

  const shared = cn(
    "w-full min-h-[80px] rounded-md border px-3 py-2 text-sm leading-relaxed font-sans resize-y",
    className,
  );

  return (
    <div className="relative">
      {/* Ghost overlay — mirrors the value, then the greyed suggestion. */}
      <div
        aria-hidden
        className={cn(shared, "pointer-events-none absolute inset-0 whitespace-pre-wrap break-words overflow-hidden border-transparent bg-background text-transparent")}
      >
        {value}
        {suggestion ? <span className="text-muted-foreground/50">{suggestion}</span> : null}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab" && suggestion && !e.shiftKey) {
            e.preventDefault();
            accept();
            return;
          }
          onKeyDown?.(e);
        }}
        className={cn(shared, "relative border-input bg-transparent")}
        {...props}
      />
      {suggestion ? (
        <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          Tab ↹ to accept
        </span>
      ) : null}
    </div>
  );
}

export default AiTextarea;
