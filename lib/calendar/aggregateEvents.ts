/**
 * Smart Enterprise Calendar aggregation (6.5).
 *
 * Pulls date-bearing records that today live scattered across modules — CRM
 * tasks, HR leave & attendance, finance payments, payroll — plus user-created
 * CalendarEvents, and normalises them into ONE unified event list, role-scoped
 * so a user only sees what their role can access. This is the single source the
 * unified calendar UI and the AI conflict detector consume.
 */
import dbConnect from "@/lib/db";
import CalendarEvent from "@/models/shared/CalendarEvent";
import CrmTask from "@/models/crm/Task";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Attendance from "@/models/hr/Attendance";
import Payment from "@/models/sales/Payment";
import Payroll from "@/models/hr/Payroll";

export interface UnifiedEvent {
  id: string;
  source: "calendar" | "task" | "leave" | "attendance" | "payment" | "payroll";
  type: string;
  title: string;
  start: string; // ISO
  end?: string;  // ISO
  allDay: boolean;
  url?: string;
  meta?: Record<string, unknown>;
}

function iso(d: any): string { return new Date(d).toISOString(); }

export async function getCalendarEvents(
  tenantId: string,
  role: string,
  from: Date,
  to: Date,
): Promise<UnifiedEvent[]> {
  await dbConnect();
  const r = (role || "").toLowerCase();
  const isAdmin = r === "admin" || r === "master-admin";
  const can = (module: string) => isAdmin || r === module;

  const events: UnifiedEvent[] = [];
  const tasks: Promise<void>[] = [];

  // Every query below is sorted by its own date field before the limit is
  // applied — a plain Mongoose .find() with no .sort() returns documents in
  // arbitrary/insertion order, so hitting the cap used to silently drop a
  // random-looking slice of the range (e.g. everything after a certain
  // creation-order cutoff) instead of a predictable one. The limits
  // themselves are generous enough that legitimate tenants shouldn't hit
  // them for a single year's view; the sort just makes the (rare) worst
  // case honest instead of confusing.

  // User-created calendar events — visible to everyone in the tenant.
  tasks.push(
    CalendarEvent.find({ tenantId, start: { $gte: from, $lte: to } }).sort({ start: 1 }).limit(5000).lean().then((rows: any[]) => {
      for (const e of rows) events.push({ id: String(e._id), source: "calendar", type: e.type, title: e.title, start: iso(e.start), end: e.end ? iso(e.end) : undefined, allDay: !!e.allDay, url: "/calendar", meta: {} });
    }),
  );

  // CRM tasks (sales role or admin).
  if (can("sales")) {
    tasks.push(
      CrmTask.find({ tenantId, due_date: { $gte: from, $lte: to } }).select("title status due_date priority").sort({ due_date: 1 }).limit(20000).lean().then((rows: any[]) => {
        for (const t of rows) events.push({ id: String(t._id), source: "task", type: "task", title: t.title, start: iso(t.due_date), allDay: true, url: "/crm/tasks", meta: { status: t.status, priority: t.priority } });
      }),
    );
  }

  // HR: leave (as ranges) + attendance anomalies + payroll periods.
  if (can("hr")) {
    tasks.push(
      LeaveRequest.find({ tenantId, status: { $in: ["approved", "pending"] }, startDate: { $lte: to }, endDate: { $gte: from } }).select("leaveType status startDate endDate employeeId").sort({ startDate: 1 }).limit(5000).lean().then((rows: any[]) => {
        for (const l of rows) events.push({ id: String(l._id), source: "leave", type: `leave:${l.leaveType}`, title: `${l.status === "pending" ? "Leave (pending)" : "Leave"} — ${l.leaveType}`, start: iso(l.startDate), end: iso(l.endDate), allDay: true, url: "/hr/leaves", meta: { employeeId: String(l.employeeId), status: l.status } });
      }),
      Attendance.find({ tenantId, status: { $in: ["absent", "on-leave"] }, date: { $gte: from, $lte: to } }).select("status date employeeId").sort({ date: 1 }).limit(10000).lean().then((rows: any[]) => {
        for (const a of rows) events.push({ id: String(a._id), source: "attendance", type: `attendance:${a.status}`, title: a.status === "absent" ? "Absent" : "On leave", start: iso(a.date), allDay: true, url: "/hr/attendance", meta: { employeeId: String(a.employeeId) } });
      }),
      Payroll.find({ tenantId, "payPeriod.endDate": { $gte: from }, "payPeriod.startDate": { $lte: to } }).select("payPeriod month").sort({ "payPeriod.startDate": 1 }).limit(2000).lean().then((rows: any[]) => {
        for (const p of rows) if (p.payPeriod?.startDate) events.push({ id: String(p._id), source: "payroll", type: "payroll", title: "Payroll period", start: iso(p.payPeriod.startDate), end: p.payPeriod.endDate ? iso(p.payPeriod.endDate) : undefined, allDay: true, url: "/hr/payroll", meta: {} });
      }),
    );
  }

  // Finance: payments due/received.
  if (can("finance")) {
    tasks.push(
      Payment.find({ tenantId, paymentDate: { $gte: from, $lte: to } }).select("amount paymentDate reference customerId").sort({ paymentDate: 1 }).limit(5000).lean().then((rows: any[]) => {
        for (const p of rows) events.push({ id: String(p._id), source: "payment", type: "payment", title: `Payment ${p.reference || ""} — ${p.amount ?? ""}`.trim(), start: iso(p.paymentDate), allDay: true, url: "/finance/payments", meta: { amount: p.amount } });
      }),
    );
  }

  await Promise.all(tasks.map((p) => p.catch(() => {})));
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

// ── Deterministic conflict detection (the AI layer prioritises/explains these) ─

export interface CalendarConflict {
  date: string; // YYYY-MM-DD
  severity: "low" | "medium" | "high";
  reason: string;
  eventIds: string[];
}

function dayKey(iso: string): string { return iso.slice(0, 10); }

/**
 * Find scheduling conflicts deterministically: too many task deadlines on one
 * day, and task deadlines that land on a day someone is on leave/absent. Pure,
 * so it's unit-tested and works as the fallback when AI is unavailable.
 */
export function detectConflicts(events: UnifiedEvent[], opts: { taskCrowdThreshold?: number } = {}): CalendarConflict[] {
  const threshold = opts.taskCrowdThreshold ?? 4;
  const byDay = new Map<string, UnifiedEvent[]>();
  for (const e of events) {
    const k = dayKey(e.start);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(e);
  }

  const conflicts: CalendarConflict[] = [];
  for (const [day, dayEvents] of byDay) {
    const taskEvents = dayEvents.filter((e) => e.source === "task");
    const leaveEvents = dayEvents.filter((e) => e.source === "leave" || e.source === "attendance");

    // Crowded deadline day.
    if (taskEvents.length >= threshold) {
      conflicts.push({ date: day, severity: taskEvents.length >= threshold * 2 ? "high" : "medium", reason: `${taskEvents.length} task deadlines fall on the same day.`, eventIds: taskEvents.map((e) => e.id) });
    }
    // Deadlines colliding with someone's leave/absence.
    if (taskEvents.length > 0 && leaveEvents.length > 0) {
      conflicts.push({ date: day, severity: "high", reason: `${taskEvents.length} task deadline(s) land on a day with ${leaveEvents.length} team absence(s)/leave.`, eventIds: [...taskEvents, ...leaveEvents].map((e) => e.id) });
    }
  }
  return conflicts.sort((a, b) => a.date.localeCompare(b.date));
}
