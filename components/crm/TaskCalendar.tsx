'use client';
import { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { AlertTriangle, Sparkles, Loader2 } from "lucide-react";

/**
 * Smart Enterprise Calendar (6.5) — rebuilt from the old orphaned CRM-tasks-only
 * week grid into a UNIFIED calendar that shows events aggregated across CRM
 * tasks, HR leave/attendance, finance payments and payroll (via /api/calendar),
 * plus AI conflict detection (via /api/calendar/conflicts?ai=true).
 */
const SOURCE_STYLES: Record<string, string> = {
  task: "bg-blue-900/20 border-blue-800 text-blue-300",
  leave: "bg-purple-900/20 border-purple-800 text-purple-300",
  attendance: "bg-red-900/20 border-red-800 text-red-300",
  payment: "bg-emerald-900/20 border-emerald-800 text-emerald-300",
  payroll: "bg-amber-900/20 border-amber-800 text-amber-300",
  calendar: "bg-neutral-800/40 border-neutral-700 text-neutral-200",
};

export default function TaskCalendar() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [conflicts, setConflicts] = useState<any[] | null>(null);
  const [conflictSummary, setConflictSummary] = useState<string>("");
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  useEffect(() => {
    const from = weekStart.toISOString();
    const to = addDays(weekEnd, 1).toISOString();
    fetch(`/api/calendar?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((d) => { if (d.success) setEvents(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const checkConflicts = useCallback(async () => {
    setCheckingConflicts(true);
    try {
      const from = weekStart.toISOString();
      const to = addDays(weekEnd, 1).toISOString();
      const res = await fetch(`/api/calendar/conflicts?from=${from}&to=${to}&ai=true`);
      const d = await res.json();
      if (d.success) { setConflicts(d.data.conflicts); setConflictSummary(d.data.summary || ""); }
    } finally { setCheckingConflicts(false); }
  }, []);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading calendar…</div>;

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const conflictDays = new Set((conflicts || []).map((c) => c.date));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Unified view — tasks, leave, attendance, payments, payroll.</p>
        <button onClick={checkConflicts} disabled={checkingConflicts} className="text-xs border border-neutral-700 rounded-md px-3 py-1.5 hover:bg-neutral-800 flex items-center gap-1 disabled:opacity-50">
          {checkingConflicts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-indigo-400" />} Detect conflicts (AI)
        </button>
      </div>

      {conflicts && (
        <div className={`border rounded-lg p-3 text-xs ${conflicts.length ? "border-amber-700/50 bg-amber-950/20" : "border-emerald-700/40 bg-emerald-950/10"}`}>
          {conflicts.length ? (
            <>
              <p className="font-semibold text-amber-300 flex items-center gap-1 mb-1"><AlertTriangle className="h-3 w-3" /> {conflicts.length} conflict(s)</p>
              <p className="whitespace-pre-wrap text-neutral-300">{conflictSummary}</p>
            </>
          ) : <p className="text-emerald-300">No scheduling conflicts this week.</p>}
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-neutral-800 bg-neutral-950">
          {weekDays.map((day) => (
            <div key={day.toISOString()} className={`p-3 text-center border-r border-neutral-800 last:border-r-0 ${conflictDays.has(format(day, "yyyy-MM-dd")) ? "bg-amber-950/30" : ""}`}>
              <p className="text-sm font-bold">{format(day, "EEEE")}</p>
              <p className="text-xs text-muted-foreground">{format(day, "MMM d")}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 h-[60vh]">
          {weekDays.map((day) => {
            const dayEvents = events.filter((e) => new Date(e.start).toDateString() === day.toDateString());
            return (
              <div key={day.toISOString()} className="p-2 border-r border-neutral-800 last:border-r-0 overflow-y-auto">
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
