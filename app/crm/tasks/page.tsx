'use client';
import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [view, setView] = useState('my');

  useEffect(() => {
    fetch(`/api/crm/tasks?view=${view}`)
      .then(r => r.json())
      .then(d => { if (d.success) setTasks(d.data); });
  }, [view]);

  const toggleComplete = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Completed' ? 'Pending' : 'Completed';
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
      headers: { 'Content-Type': 'application/json' }
    });
    setTasks(tasks.map(t => t._id === taskId ? { ...t, status: newStatus } : t));
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tasks Dashboard</h1>
        <Button className="bg-primary">+ New Task</Button>
      </div>
      <div className="flex gap-2 mb-4">
        <Button variant={view === 'my' ? 'default' : 'outline'} onClick={() => setView('my')}>My Tasks</Button>
        <Button variant={view === 'all' ? 'default' : 'outline'} onClick={() => setView('all')}>Team Tasks</Button>
      </div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-md p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map(t => (
              <TableRow key={t._id}>
                <TableCell>
                  <input type="checkbox" checked={t.status === 'Completed'} onChange={() => toggleComplete(t._id, t.status)} className="w-4 h-4 cursor-pointer" />
                </TableCell>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                <TableCell className={new Date(t.due_date) < new Date() && t.status !== 'Completed' ? 'text-red-500 font-bold' : ''}>
                  {new Date(t.due_date).toLocaleDateString()}
                </TableCell>
                <TableCell><Badge variant={t.status === 'Overdue' ? 'destructive' : 'secondary'}>{t.status}</Badge></TableCell>
                <TableCell>{t.priority}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
