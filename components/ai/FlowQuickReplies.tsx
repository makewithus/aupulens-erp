"use client";

import { cn } from "@/lib/utils";
import type { QuickReply } from "@/lib/ai/flowPresentation";

/** One-tap answers under an assistant message. Choices (customers, items…) first, then Back / Skip / Cancel. */
export function FlowQuickReplies({ replies, onPick, disabled, dark = true }: { replies: QuickReply[]; onPick: (value: string) => void; disabled?: boolean; dark?: boolean }) {
  if (!replies.length) return null;
  const choices = replies.filter((r) => r.kind === "choice");
  const actions = replies.filter((r) => r.kind === "action");
  const base = "px-3 py-1.5 rounded border text-[11px] font-medium transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
  return (
    <div className="mt-3 space-y-2" data-testid="flow-quick-replies">
      {choices.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {choices.map((r, i) => (
            <button
              key={`c${i}`}
              type="button"
              disabled={disabled}
              onClick={() => onPick(r.value)}
              className={cn(base, dark ? "border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-neutral-100" : "border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800")}
            >
              <span className="opacity-60 mr-2">{i + 1}</span>
              {r.label}
            </button>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {actions.map((r, i) => {
            const primary = /^(yes|create draft)/i.test(r.label);
            const cancel = r.value === "cancel";
            return (
              <button
                key={`a${i}`}
                type="button"
                disabled={disabled}
                onClick={() => onPick(r.value)}
                className={cn(
                  base,
                  primary ? "bg-purple-600 hover:bg-purple-500 text-white border-purple-600"
                    : cancel ? (dark ? "border-neutral-700 text-neutral-400 hover:bg-neutral-800" : "border-neutral-300 text-neutral-500 hover:bg-neutral-100")
                    : dark ? "border-neutral-600 text-neutral-200 hover:bg-neutral-800" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
