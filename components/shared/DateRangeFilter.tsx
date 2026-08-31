"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable "From / To" date-range filter for list-page toolbars.
 *
 * Setting both fields to the same day filters to that exact date — there is
 * deliberately no separate "exact date" control, since From=To already
 * expresses it with no extra UI.
 *
 * This exists because several list pages already accept `dateFrom`/`dateTo`
 * as URL/query params (built so the AI assistant can redirect a user to a
 * pre-filtered page — see lib/ai/memoryFlow.ts), but had no on-page control
 * for a person to set that same filter manually. Drop this into a page's
 * toolbar next to its existing search/status filters and wire it to the
 * page's own `dateFrom`/`dateTo` state — the fetch/query-building logic
 * those pages already have does not need to change.
 */
export function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  className,
  inputClassName,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const hasFilter = !!(dateFrom || dateTo);
  const dateInputClass = cn(
    "h-11 w-[152px] shrink-0 rounded-none border border-input bg-background px-3 text-[13px] font-medium leading-none tracking-tight text-foreground shadow-none",
    "[color-scheme:light] dark:[color-scheme:dark]",
    "hover:border-foreground/40 focus-visible:border-foreground focus-visible:ring-0",
    inputClassName,
  );

  return (
    <div className={cn("flex h-11 items-center gap-2.5", className)}>
      <div className="flex h-11 items-center gap-2">
        <span className="w-9 shrink-0 font-mono text-[10px] uppercase leading-none tracking-wider text-muted-foreground">
          From
        </span>
        <Input
          type="date"
          aria-label="From date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          max={dateTo || undefined}
          className={dateInputClass}
        />
      </div>

      <div className="flex h-11 items-center gap-2">
        <span className="w-9 shrink-0 font-mono text-[10px] uppercase leading-none tracking-wider text-muted-foreground">
          To
        </span>
        <Input
          type="date"
          aria-label="To date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          min={dateFrom || undefined}
          className={dateInputClass}
        />
      </div>

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => {
            onDateFromChange("");
            onDateToChange("");
          }}
          aria-label="Clear date filter"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
