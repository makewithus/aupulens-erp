'use client';
import { useState, useEffect } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function TaskCalendar() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crm/tasks')
      .then(res => res.json())
      .then(d => {
        if (d.success) setTasks(d.data.tasks);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading calendar...</div>;

  const startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b border-neutral-800 bg-neutral-950">
        {weekDays.map(day => (
          <div key={day.toISOString()} className="p-3 text-center border-r border-neutral-800 last:border-r-0">
            <p className="text-sm font-bold">{format(day, 'EEEE')}</p>
            <p className="text-xs text-muted-foreground">{format(day, 'MMM d')}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 h-[60vh]">
        {weekDays.map(day => {
          const dayTasks = tasks.filter(t => new Date(t.due_date).toDateString() === day.toDateString());
          return (
            <div key={day.toISOString()} className="p-2 border-r border-neutral-800 last:border-r-0 overflow-y-auto">
              {dayTasks.map(t => (
                <div key={t._id} className={`p-1 mb-1 text-[10px] rounded truncate px-2 border ${t.status === 'Completed' ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-blue-900/20 border-blue-800 text-blue-300'}`}>
                  {t.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
