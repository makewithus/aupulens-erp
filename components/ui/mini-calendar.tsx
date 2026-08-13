"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A tiny, dependency-free month calendar (no react-day-picker). Pairs with a
 * typed date <input> so the user can EITHER type a date OR click a day. Value is
 * the ISO `yyyy-mm-dd` string used by <input type="date"> so the two stay in
 * sync. Theme-aware via design tokens.
 */
interface MiniCalendarProps {
  value?: string; // yyyy-mm-dd
  onChange: (value: string) => void;
  className?: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseISO = (s?: string): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
};

export function MiniCalendar({ value, onChange, className }: MiniCalendarProps) {
  const selected = parseISO(value);
  const today = new Date();
  const [view, setView] = React.useState<Date>(selected || today);

  // Keep the visible month in step when the typed input changes the value.
  React.useEffect(() => {
    const s = parseISO(value);
    if (s) setView((v) => (v.getMonth() === s.getMonth() && v.getFullYear() === s.getFullYear() ? v : s));
  }, [value]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSameDay = (d: number, ref: Date | null) =>
    !!ref && ref.getFullYear() === year && ref.getMonth() === month && ref.getDate() === d;

  return (
    <div className={cn("w-full select-none rounded-md border border-border/60 bg-card p-2", className)}>
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setView(new Date(year, month - 1, 1))}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold">{MONTHS[month]} {year}</span>
        <button
          type="button"
          onClick={() => setView(new Date(year, month + 1, 1))}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1 text-[10px] font-medium text-muted-foreground">{w}</span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              onClick={() => onChange(toISO(new Date(year, month, d)))}
              className={cn(
                "aspect-square rounded text-xs transition-colors hover:bg-muted",
                isSameDay(d, selected) && "bg-primary text-primary-foreground hover:bg-primary/90",
                !isSameDay(d, selected) && isSameDay(d, today) && "ring-1 ring-primary/50",
              )}
            >
              {d}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
