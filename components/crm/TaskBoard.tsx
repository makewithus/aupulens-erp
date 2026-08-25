'use client';
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function TaskBoard() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = () => {
    fetch('/api/crm/tasks')
      .then(res => res.json())
      .then(d => {
        if (d.success) setTasks(d.data.tasks);
        setLoading(false);
      });
  };

  useEffect(() => { fetchTasks(); }, []);

  const moveTask = async (id: string, newStatus: string) => {
    // Optimistic update
    setTasks(tasks.map(t => t._id === id ? { ...t, status: newStatus } : t));
    await fetch(`/api/crm/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
  };

  const columns = ['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'];

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(col => (
        <div key={col} className="bg-card border border-border rounded-lg w-80 flex-shrink-0 flex flex-col h-[70vh]">
          <div className="p-3 border-b border-border font-bold bg-background rounded-t-lg flex justify-between">
            {col} <Badge variant="secondary">{tasks.filter(t => t.status === col).length}</Badge>
          </div>
          <div className="p-2 flex-1 overflow-y-auto space-y-2">
            {tasks.filter(t => t.status === col).map(t => (
              <div key={t._id} className="bg-background p-3 rounded border border-border shadow-sm cursor-grab active:cursor-grabbing">
                <p className="font-bold text-sm">{t.title}</p>
                <div className="flex justify-between items-center mt-3">
                  <Badge variant="outline" className={t.priority === 'Urgent' ? 'border-red-500 text-red-500' : ''}>{t.priority}</Badge>
                  <p className="text-xs text-muted-foreground">{new Date(t.due_date).toLocaleDateString()}</p>
                </div>
                {col !== 'Completed' && (
                  <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => moveTask(t._id, 'Completed')}>Mark Done</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
