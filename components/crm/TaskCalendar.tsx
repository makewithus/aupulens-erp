'use client';
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  format, startOfWeek, addDays, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths,
  startOfYear, endOfYear, addYears, subYears, isSameMonth, isToday,
} from "date-fns";
import { AlertTriangle, Sparkles, Loader2, ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { cn } from "@/lib/utils";

/**
 * Smart Enterprise Calendar (6.5) — unified calendar showing events aggregated
 * across CRM tasks, HR leave/attendance, finance payments and payroll (via
 * /api/calendar), plus AI conflict detection (via /api/calendar/conflicts?ai=true).
 *
 * Supports Week/Month/Year views, prev/next/today/date-jump navigation, and
 * client-side filtering by event type + task status/priority.
 */
const SOURCE_STYLES: Record<string, string> = {
  task: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300",
  leave: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300",
  attendance: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  payment: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  payroll: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  calendar: "border-border/70 bg-muted/40 text-foreground",
};
const SOURCE_DOTS: Record<string, string> = {
  task: "bg-blue-500",
  leave: "bg-violet-500",
  attendance: "bg-rose-500",
  payment: "bg-emerald-500",
  payroll: "bg-amber-500",
  calendar: "bg-muted-foreground",
};
const SOURCE_LABELS: Record<string, string> = {
  task: "Tasks", leave: "Leave", attendance: "Attendance",
  payment: "Payments", payroll: "Payroll", calendar: "Events",
};
const TASK_STATUSES = ["Pending", "In Progress", "Completed", "Overdue", "Cancelled"];
const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"];

type ViewMode = "week" | "month" | "year";

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Monday-start grid cells for a given month, padded with null at both ends
// so every row has 7 columns.
function buildMonthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // days since Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function TaskCalendar() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [conflicts, setConflicts] = useState<any[] | null>(null);
  const [conflictSummary, setConflictSummary] = useState<string>("");
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set(Object.keys(SOURCE_STYLES)));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    if (viewMode === "week") {
      const s = startOfWeek(anchorDate, { weekStartsOn: 1 });
      const e = addDays(s, 6);
      return { rangeStart: s, rangeEnd: e, rangeLabel: `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}` };
    }
    if (viewMode === "month") {
      return { rangeStart: startOfMonth(anchorDate), rangeEnd: endOfMonth(anchorDate), rangeLabel: format(anchorDate, "MMMM yyyy") };
    }
    return { rangeStart: startOfYear(anchorDate), rangeEnd: endOfYear(anchorDate), rangeLabel: format(anchorDate, "yyyy") };
  }, [viewMode, anchorDate]);

  useEffect(() => {
    // Guards against switching views (Week/Month/Year) or navigating dates
    // faster than a fetch resolves — without this, an earlier, slower request
    // (e.g. a full-year fetch) could resolve after a newer one and overwrite
    // the correct data with stale results for a different range.
    let cancelled = false;
    setLoading(true);
    setConflicts(null);
    const from = rangeStart.toISOString();
    const to = addDays(rangeEnd, 1).toISOString();
    fetch(`/api/calendar?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) setEvents(d.data);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd]);

  const checkConflicts = useCallback(async () => {
    setCheckingConflicts(true);
    try {
      const from = rangeStart.toISOString();
      const to = addDays(rangeEnd, 1).toISOString();
      const res = await fetch(`/api/calendar/conflicts?from=${from}&to=${to}&ai=true`);
      const d = await res.json();
      if (d.success) { setConflicts(d.data.conflicts); setConflictSummary(d.data.summary || ""); }
    } finally { setCheckingConflicts(false); }
  }, [rangeStart, rangeEnd]);

  const filteredEvents = useMemo(() => events.filter((e) => {
    if (!sourceFilter.has(e.source)) return false;
    if (e.source === "task") {
      if (statusFilter !== "all" && e.meta?.status !== statusFilter) return false;
      if (priorityFilter !== "all" && e.meta?.priority !== priorityFilter) return false;
    }
    return true;
  }), [events, sourceFilter, statusFilter, priorityFilter]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of filteredEvents) {
      const key = format(new Date(e.start), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const toggleSource = (key: string) => setSourceFilter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const goPrev = () => setAnchorDate((d) => viewMode === "week" ? subWeeks(d, 1) : viewMode === "month" ? subMonths(d, 1) : subYears(d, 1));
  const goNext = () => setAnchorDate((d) => viewMode === "week" ? addWeeks(d, 1) : viewMode === "month" ? addMonths(d, 1) : addYears(d, 1));
  const goToday = () => setAnchorDate(new Date());
  const jumpToISO = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    if (y && m && d) setAnchorDate(new Date(y, m - 1, d));
    setDatePickerOpen(false);
  };
  const drillIntoDay = (day: Date) => { setAnchorDate(day); setViewMode("week"); };

  const conflictDays = new Set((conflicts || []).map((c) => c.date));

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      {Object.keys(SOURCE_STYLES).map((key) => (
        <button
          key={key}
          onClick={() => toggleSource(key)}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md border px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            sourceFilter.has(key)
              ? SOURCE_STYLES[key]
              : "border-border/50 bg-transparent text-muted-foreground opacity-60 hover:opacity-100",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", sourceFilter.has(key) ? SOURCE_DOTS[key] : "bg-muted-foreground/40")} />
          {SOURCE_LABELS[key]}
        </button>
      ))}
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="h-8 rounded-md border border-border/60 bg-background px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-foreground shadow-none outline-none transition-colors hover:border-border focus:border-primary/60"
      >
        <option value="all">All statuses</option>
        {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select
        value={priorityFilter}
        onChange={(e) => setPriorityFilter(e.target.value)}
        className="h-8 rounded-md border border-border/60 bg-background px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-foreground shadow-none outline-none transition-colors hover:border-border focus:border-primary/60"
      >
        <option value="all">All priorities</option>
        {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );

  const navBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList className="h-10 rounded-md border border-border/60 bg-muted/30 p-1">
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex h-10 items-center rounded-md border border-border/60 bg-background">
        <button onClick={goPrev} aria-label="Previous" className="flex h-10 w-10 items-center justify-center border-r border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={goToday} className="h-10 px-4 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">Today</button>
        <button onClick={goNext} aria-label="Next" className="flex h-10 w-10 items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
        <PopoverTrigger asChild>
          <button className="flex h-10 items-center gap-2 rounded-md border border-border/60 bg-background px-4 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" /> {rangeLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="w-auto border-0 bg-transparent p-0 shadow-none">
          <MiniCalendar value={toISODate(anchorDate)} onChange={jumpToISO} />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {navBar}
          <button onClick={checkConflicts} disabled={checkingConflicts} className="flex h-10 items-center gap-2 rounded-md border border-border/60 bg-background px-4 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
            {checkingConflicts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-indigo-400" />} Detect conflicts (AI)
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
          <p className="text-sm text-muted-foreground">Unified view for tasks, leave, attendance, payments, payroll, and events.</p>
          {filterBar}
        </div>
      </div>

      {conflicts && (
        <div className={`rounded-md border p-4 text-sm shadow-sm ${conflicts.length ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
          {conflicts.length ? (
            <>
              <p className="mb-2 flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-300"><AlertTriangle className="h-4 w-4" /> {conflicts.length} conflict(s)</p>
              <p className="whitespace-pre-wrap text-foreground/90">{conflictSummary}</p>
            </>
          ) : <p className="text-emerald-600 dark:text-emerald-300">No scheduling conflicts in this range.</p>}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-md border border-border/60 bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading calendar...
        </div>
      ) : viewMode === "week" ? (
        <WeekGrid rangeStart={rangeStart} eventsByDay={eventsByDay} conflictDays={conflictDays} />
      ) : viewMode === "month" ? (
        <MonthGrid anchorDate={anchorDate} eventsByDay={eventsByDay} conflictDays={conflictDays} onDayClick={drillIntoDay} />
      ) : (
        <YearGrid anchorDate={anchorDate} eventsByDay={eventsByDay} onDayClick={drillIntoDay} />
      )}
    </div>
  );
}

function WeekGrid({ rangeStart, eventsByDay, conflictDays }: { rangeStart: Date; eventsByDay: Map<string, any[]>; conflictDays: Set<string> }) {
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(rangeStart, i));
  return (
    <div className="overflow-x-auto rounded-md border border-border/60 bg-card shadow-sm">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "border-r border-border/60 p-3 text-center last:border-r-0",
                conflictDays.has(format(day, "yyyy-MM-dd")) && "bg-amber-500/10",
              )}
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{format(day, "EEE")}</p>
              <p className={cn("mt-1 text-lg font-semibold", isToday(day) && "text-primary")}>{format(day, "d")}</p>
              <p className="text-xs text-muted-foreground">{format(day, "MMM yyyy")}</p>
            </div>
          ))}
        </div>
        <div className="grid min-h-[520px] grid-cols-7">
          {weekDays.map((day) => {
            const dayEvents = eventsByDay.get(format(day, "yyyy-MM-dd")) || [];
            return (
              <div key={day.toISOString()} className="space-y-2 overflow-y-auto border-r border-border/60 p-2 last:border-r-0">
                {dayEvents.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground/60">No events</p>
                ) : (
                  dayEvents.map((e) => (
                    <div
                      key={`${e.source}-${e.id}`}
                      title={`${e.source}: ${e.title}`}
                      className={cn("rounded-md border px-2 py-1.5 text-xs leading-snug shadow-sm", SOURCE_STYLES[e.source] || SOURCE_STYLES.calendar)}
                    >
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] opacity-70">{SOURCE_LABELS[e.source] || "Event"}</p>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const WEEKDAY_INITIALS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthGrid({ anchorDate, eventsByDay, conflictDays, onDayClick }: { anchorDate: Date; eventsByDay: Map<string, any[]>; conflictDays: Set<string>; onDayClick: (d: Date) => void }) {
  const cells = buildMonthCells(anchorDate.getFullYear(), anchorDate.getMonth());
  return (
    <div className="overflow-x-auto rounded-md border border-border/60 bg-card shadow-sm">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
          {WEEKDAY_INITIALS.map((w) => <div key={w} className="p-3 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="min-h-[112px] border-r border-b border-border/40 bg-muted/20 last:border-r-0" />;
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) || [];
            const shown = dayEvents.slice(0, 3);
            return (
              <button
                key={key}
                onClick={() => onDayClick(day)}
                className={cn(
                  "min-h-[112px] border-r border-b border-border/40 p-2 text-left align-top transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 last:border-r-0",
                  conflictDays.has(key) && "bg-amber-500/10",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className={cn("inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm font-medium", isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{format(day, "d")}</span>
                  {conflictDays.has(key) && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                </div>
                <div className="space-y-1">
                  {shown.map((e) => (
                    <div
                      key={`${e.source}-${e.id}`}
                      title={e.title}
                      className={cn("rounded-md border px-1.5 py-1 text-[10px] leading-tight shadow-sm", SOURCE_STYLES[e.source] || SOURCE_STYLES.calendar)}
                    >
                      <p className="truncate">{e.title}</p>
                    </div>
                  ))}
                  {dayEvents.length > shown.length && <p className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - shown.length} more</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Buckets are relative to the busiest day actually in view, not fixed
// absolute counts — a real tenant's days can easily all sit at "10+"
// events, which with fixed thresholds painted the entire year one flat
// color and defeated the point of a density heatmap.
function densityClass(count: number, maxCount: number): string {
  if (count === 0) return "bg-transparent";
  if (maxCount <= 0) return "bg-transparent";
  const ratio = count / maxCount;
  if (ratio <= 0.2) return "bg-blue-500/15 text-blue-600 dark:text-blue-300";
  if (ratio <= 0.45) return "bg-blue-500/30 text-blue-700 dark:text-blue-200";
  if (ratio <= 0.7) return "bg-emerald-500/30 text-emerald-700 dark:text-emerald-200";
  return "bg-amber-500/40 text-amber-800 dark:text-amber-100";
}

function YearGrid({ anchorDate, eventsByDay, onDayClick }: { anchorDate: Date; eventsByDay: Map<string, any[]>; onDayClick: (d: Date) => void }) {
  const year = anchorDate.getFullYear();
  const maxCount = Math.max(1, ...Array.from(eventsByDay.values(), (v) => v.length));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {Array.from({ length: 12 }).map((_, month) => {
        const cells = buildMonthCells(year, month);
        const monthDate = new Date(year, month, 1);
        return (
          <div key={month} className="rounded-md border border-border/60 bg-card p-3 shadow-sm">
            <p className={cn("mb-2 text-sm font-semibold", isSameMonth(monthDate, anchorDate) ? "text-primary" : "text-foreground")}>{format(monthDate, "MMMM")}</p>
            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAY_INITIALS.map((day) => (
                <span key={day} className="text-center text-[9px] font-medium text-muted-foreground">{day.slice(0, 1)}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} className="aspect-square" />;
                const key = format(day, "yyyy-MM-dd");
                const count = (eventsByDay.get(key) || []).length;
                return (
                  <button
                    key={key}
                    onClick={() => onDayClick(day)}
                    title={`${format(day, "MMM d")}: ${count} event(s)`}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded text-[10px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      densityClass(count, maxCount),
                      isToday(day) && "ring-1 ring-primary",
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
