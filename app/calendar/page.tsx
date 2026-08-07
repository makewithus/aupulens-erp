import { CalendarDays } from "lucide-react";
import TaskCalendar from "@/components/crm/TaskCalendar";

/**
 * Smart Enterprise Calendar (6.5) — one page unifying dates from across the ERP
 * (CRM tasks, HR leave/attendance, finance payments, payroll) with AI conflict
 * detection. Role-scoped server-side by /api/calendar.
 */
export default function CalendarPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-indigo-500" /> Enterprise Calendar
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everything with a date, in one place — with AI conflict detection.
        </p>
      </div>
      <TaskCalendar />
    </div>
  );
}
