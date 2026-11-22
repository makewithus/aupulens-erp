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

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseISO = (s?: string): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
};

const YEARS_PER_PAGE = 12;

export function MiniCalendar({ value, onChange, className }: MiniCalendarProps) {
  const selected = parseISO(value);
  const today = new Date();
  const [view, setView] = React.useState<Date>(selected || today);
  // "days" is the normal single-month grid; clicking the month/year label
  // drills into "months" (pick any month in the shown year) or "years" (pick
  // any year in a 12-year page) so jumping far isn't limited to stepping one
  // month at a time via the arrow buttons.
  const [mode, setMode] = React.useState<"days" | "months" | "years">("days");
  const [yearsPageStart, setYearsPageStart] = React.useState<number>(
    Math.floor((view.getFullYear() - 1) / YEARS_PER_PAGE) * YEARS_PER_PAGE + 1,
  );

  // Keep the visible month in step when the typed input changes the value.
  React.useEffect(() => {
    const s = parseISO(value);
    if (s) setView((v) => (v.getMonth() === s.getMonth() && v.getFullYear() === s.getFullYear() ? v : s));
  }, [value]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSameDay = (d: number, ref: Date | null) =>
    !!ref && ref.getFullYear() === year && ref.getMonth() === month && ref.getDate() === d;

  const openYears = () => {
    setYearsPageStart(Math.floor((year - 1) / YEARS_PER_PAGE) * YEARS_PER_PAGE + 1);
    setMode("years");
  };

  const selectToday = () => {
    setView(today);
    setMode("days");
    onChange(toISO(today));
  };

  return (
    <div
      className={cn(
        "w-[20rem] max-w-[calc(100vw-2rem)] select-none rounded-md border border-border/60 bg-popover p-3 text-popover-foreground shadow-2xl",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            mode === "days"
              ? setView(new Date(year, month - 1, 1))
              : mode === "months"
                ? setView(new Date(year - 1, month, 1))
                : setYearsPageStart((s) => s - YEARS_PER_PAGE)
          }
          className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label={mode === "days" ? "Previous month" : mode === "months" ? "Previous year" : "Previous years"}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {mode === "days" ? (
          <button
            type="button"
            onClick={() => setMode("months")}
            className="min-w-0 flex-1 rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="Choose month"
          >
            {MONTHS[month]} {year}
          </button>
        ) : mode === "months" ? (
          <button
            type="button"
            onClick={openYears}
            className="min-w-0 flex-1 rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="Choose year"
          >
            {year}
          </button>
        ) : (
          <span className="min-w-0 flex-1 rounded-md px-3 py-1.5 text-center text-sm font-semibold">
            {yearsPageStart}–{yearsPageStart + YEARS_PER_PAGE - 1}
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            mode === "days"
              ? setView(new Date(year, month + 1, 1))
              : mode === "months"
                ? setView(new Date(year + 1, month, 1))
                : setYearsPageStart((s) => s + YEARS_PER_PAGE)
          }
          className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label={mode === "days" ? "Next month" : mode === "months" ? "Next year" : "Next years"}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {mode === "days" && (
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="py-1 text-[10px] font-medium text-muted-foreground">{w}</span>
          ))}
          {cells.map((d, i) =>
            d === null ? (
              <span key={`e${i}`} className="h-9" />
            ) : (
              <button
                key={d}
                type="button"
                onClick={() => onChange(toISO(new Date(year, month, d)))}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md border border-transparent text-sm transition-colors hover:border-border/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  isSameDay(d, selected) && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                  !isSameDay(d, selected) && isSameDay(d, today) && "border-primary/60 text-primary",
                )}
              >
                {d}
              </button>
            ),
          )}
        </div>
      )}

      {mode === "months" && (
        <div className="grid grid-cols-3 gap-2">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setView(new Date(year, i, 1));
                setMode("days");
              }}
              className={cn(
                "rounded-md border border-border/40 px-2 py-2.5 text-sm transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                i === month && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {SHORT_MONTHS[i]}
            </button>
          ))}
        </div>
      )}

      {mode === "years" && (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearsPageStart + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setView(new Date(y, month, 1));
                setMode("months");
              }}
              className={cn(
                "rounded-md border border-border/40 px-2 py-2.5 text-sm transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                y === year && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
        <span className="truncate text-xs text-muted-foreground">
          {selected ? selected.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No date selected"}
        </span>
        <button
          type="button"
          onClick={selectToday}
          className="rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Today
        </button>
      </div>
    </div>
  );
}
