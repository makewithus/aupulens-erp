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

/**
 * Smart Enterprise Calendar (6.5) — unified calendar showing events aggregated
 * across CRM tasks, HR leave/attendance, finance payments and payroll (via
 * /api/calendar), plus AI conflict detection (via /api/calendar/conflicts?ai=true).
 *
 * Supports Week/Month/Year views, prev/next/today/date-jump navigation, and
 * client-side filtering by event type + task status/priority.
 */
const SOURCE_STYLES: Record<string, string> = {
  task: "bg-blue-900/20 border-blue-800 text-blue-300",
  leave: "bg-purple-900/20 border-purple-800 text-purple-300",
  attendance: "bg-red-900/20 border-red-800 text-red-300",
  payment: "bg-emerald-900/20 border-emerald-800 text-emerald-300",
  payroll: "bg-amber-900/20 border-amber-800 text-amber-300",
  calendar: "bg-accent/40 border-border text-foreground",
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
          className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${sourceFilter.has(key) ? SOURCE_STYLES[key] : "bg-transparent border-border text-muted-foreground opacity-50"}`}
        >
          {SOURCE_LABELS[key]}
        </button>
      ))}
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-[11px] bg-card border border-border rounded-md px-2 py-1">
        <option value="all">All statuses</option>
        {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="text-[11px] bg-card border border-border rounded-md px-2 py-1">
        <option value="all">All priorities</option>
        {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );

  const navBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-1">
        <button onClick={goPrev} aria-label="Previous" className="p-1.5 rounded-md border border-border hover:bg-accent"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <button onClick={goToday} className="text-xs border border-border rounded-md px-2 py-1 hover:bg-accent">Today</button>
        <button onClick={goNext} aria-label="Next" className="p-1.5 rounded-md border border-border hover:bg-accent"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
        <PopoverTrigger asChild>
          <button className="text-xs border border-border rounded-md px-2 py-1 hover:bg-accent flex items-center gap-1">
            <CalendarIcon className="h-3 w-3" /> {rangeLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-auto p-0">
          <MiniCalendar value={toISODate(anchorDate)} onChange={jumpToISO} />
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Unified view — tasks, leave, attendance, payments, payroll.</p>
        <button onClick={checkConflicts} disabled={checkingConflicts} className="text-xs border border-border rounded-md px-3 py-1.5 hover:bg-accent flex items-center gap-1 disabled:opacity-50">
          {checkingConflicts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-indigo-400" />} Detect conflicts (AI)
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {navBar}
        {filterBar}
      </div>

      {conflicts && (
        <div className={`border rounded-lg p-3 text-xs ${conflicts.length ? "border-amber-700/50 bg-amber-950/20" : "border-emerald-700/40 bg-emerald-950/10"}`}>
          {conflicts.length ? (
            <>
              <p className="font-semibold text-amber-300 flex items-center gap-1 mb-1"><AlertTriangle className="h-3 w-3" /> {conflicts.length} conflict(s)</p>
              <p className="whitespace-pre-wrap text-foreground">{conflictSummary}</p>
            </>
          ) : <p className="text-emerald-300">No scheduling conflicts in this range.</p>}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading calendar…</div>
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
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-border bg-background">
          {weekDays.map((day) => (
            <div key={day.toISOString()} className={`p-3 text-center border-r border-border last:border-r-0 ${conflictDays.has(format(day, "yyyy-MM-dd")) ? "bg-amber-950/30" : ""}`}>
              <p className="text-sm font-bold">{format(day, "EEEE")}</p>
              <p className="text-xs text-muted-foreground">{format(day, "MMM d")}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 h-[60vh]">
          {weekDays.map((day) => {
            const dayEvents = eventsByDay.get(format(day, "yyyy-MM-dd")) || [];
            return (
              <div key={day.toISOString()} className="p-2 border-r border-border last:border-r-0 overflow-y-auto">
                {dayEvents.map((e) => (
                  <div key={`${e.source}-${e.id}`} title={`${e.source}: ${e.title}`} className={`p-1 mb-1 text-[10px] rounded truncate px-2 border ${SOURCE_STYLES[e.source] || SOURCE_STYLES.calendar}`}>
                    {e.title}
                  </div>
                ))}
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
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-background">
        {WEEKDAY_INITIALS.map((w) => <div key={w} className="p-2 text-center text-xs font-semibold text-muted-foreground">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} className="border-r border-b border-border last:border-r-0 min-h-[90px] bg-background/40" />;
          const key = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(key) || [];
          const shown = dayEvents.slice(0, 3);
          return (
            <button
              key={key}
              onClick={() => onDayClick(day)}
              className={`text-left border-r border-b border-border last:border-r-0 min-h-[90px] p-1.5 align-top hover:bg-accent/40 transition-colors ${conflictDays.has(key) ? "bg-amber-950/20" : ""}`}
            >
              <p className={`text-xs mb-1 ${isToday(day) ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white font-semibold" : "text-muted-foreground"}`}>{format(day, "d")}</p>
              <div className="space-y-0.5">
                {shown.map((e) => (
                  <div key={`${e.source}-${e.id}`} title={e.title} className={`text-[9px] rounded truncate px-1 py-0.5 border ${SOURCE_STYLES[e.source] || SOURCE_STYLES.calendar}`}>{e.title}</div>
                ))}
                {dayEvents.length > shown.length && <p className="text-[9px] text-muted-foreground">+{dayEvents.length - shown.length} more</p>}
              </div>
            </button>
          );
        })}
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
  if (ratio <= 0.2) return "bg-indigo-900/40";
  if (ratio <= 0.45) return "bg-indigo-700/60";
  if (ratio <= 0.7) return "bg-indigo-500/70";
  return "bg-indigo-400/90";
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
          <div key={month} className="bg-card border border-border rounded-lg p-2">
            <p className={`text-xs font-semibold mb-1.5 ${isSameMonth(monthDate, anchorDate) ? "text-indigo-300" : ""}`}>{format(monthDate, "MMMM")}</p>
            <div className="grid grid-cols-7 gap-[2px]">
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} className="aspect-square" />;
                const key = format(day, "yyyy-MM-dd");
                const count = (eventsByDay.get(key) || []).length;
                return (
                  <button
                    key={key}
                    onClick={() => onDayClick(day)}
                    title={`${format(day, "MMM d")}: ${count} event(s)`}
                    className={`aspect-square rounded-sm text-[8px] flex items-center justify-center hover:ring-1 hover:ring-indigo-400 transition-colors ${densityClass(count, maxCount)} ${isToday(day) ? "ring-1 ring-indigo-400" : ""}`}
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
