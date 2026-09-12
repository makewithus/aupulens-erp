"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Phase 11 Part 2.3: "Run IDs and record IDs are visible and copyable, so a
 * QA bug report can carry one." One shared component so every new admin
 * surface gets the same behaviour rather than re-inventing it per page —
 * same copy-to-clipboard + toast pattern already used elsewhere in this
 * repo (components/dashboard/AiSidebar.tsx), reused rather than a parallel
 * implementation.
 */
export function CopyableId({ value, label, className }: { value: string; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        toast.success(`${label ?? "ID"} copied to clipboard`);
      }}
      title={`Click to copy${label ? ` ${label}` : ""}: ${value}`}
      className={cn(
        "font-mono text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer underline decoration-dotted underline-offset-2 truncate max-w-[10rem] inline-block align-bottom",
        className,
      )}
    >
      {value}
    </button>
  );
}
