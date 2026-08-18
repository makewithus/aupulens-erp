'use client';
import { useState, useEffect } from "react";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/shared/Table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FolderKanban, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TASK_CATEGORIES = ['Call Back', 'Send Proposal', 'Schedule Demo', 'Follow Up on Quote', 'Collect Documents', 'Renew Contract', 'Resolve Issue', 'Prepare Meeting', 'Follow Up', 'Prepare Quote', 'Onboarding', 'Other'];

const EMPTY_FORM = {
  title: "",
  category: "",
  description: "",
  due_date: "",
  priority: "Medium",
  status: "Pending",
};

function NewTaskModal({
  open,
  onClose,
  onCreated,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialData?: any;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const field = (name: keyof typeof form, value: any) =>
    setForm((p) => ({ ...p, [name]: value }));

  // AI-native pre-fill: merge in any AI-extracted fields when the assistant
  // opens this modal with data already prepared.
  useEffect(() => {
    if (open && initialData) {
      setForm((p) => {
        const n = { ...p };
        for (const k of Object.keys(p)) {
          const v = initialData[k];
          if (v !== undefined && v !== null && v !== "") n[k as keyof typeof n] = v;
        }
        return n;
      });
    }
  }, [open, initialData]);

  const submit = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.due_date) return toast.error("Due date is required");

    setSaving(true);
    try {
      const res = await fetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Task created!");
        setForm(EMPTY_FORM);
        onCreated();
      } else {
        toast.error(data.message || "Failed to create task");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Title <span className="text-[#F56868]">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => field("title", e.target.value)}
              disabled={saving}
              placeholder="e.g. Follow up with Acme Corp"
              className="rounded-none border-border/40 bg-white/[0.02] focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
              disabled={saving}
              rows={3}
              className="rounded-none border-border/40 bg-white/[0.02] focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Category</Label>
              <Select value={form.category} onValueChange={(v) => field("category", v)} disabled={saving}>
                <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  {TASK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Due Date <span className="text-[#F56868]">*</span></Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => field("due_date", e.target.value)}
                disabled={saving}
                className="rounded-none border-border/40 bg-white/[0.02] focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => field("priority", v)} disabled={saving}>
                <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  {['Low', 'Medium', 'High', 'Urgent'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Status</Label>
              <Select value={form.status} onValueChange={(v) => field("status", v)} disabled={saving}>
                <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  {['Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 flex gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="rounded-none border-border/20 font-mono text-[11px] uppercase tracking-[0.15em]"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="rounded-none font-mono text-[11px] uppercase tracking-[0.15em] bg-tertiary text-primary hover:bg-muted border border-secondary"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [view, setView] = useState('my');
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [aiTaskData, setAiTaskData] = useState<any>(undefined);

  const fetchTasks = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('view', view);
    if (statusFilter) params.set('status', statusFilter);
    fetch(`/api/crm/tasks?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setTasks(d.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
  }, [view, statusFilter]);

  // AI-native: extract the task's details → open New Task pre-filled.
  useAiPrefill("task", (p) => {
    setAiTaskData(p.data || {});
    setShowModal(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
  });

  const toggleComplete = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Completed' ? 'Pending' : 'Completed';
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
      headers: { 'Content-Type': 'application/json' }
    });
    setTasks(tasks.map(t => t._id === taskId ? { ...t, status: newStatus } : t));
  };

  const filteredTasks = tasks.filter((t) => {
    if (priorityFilter && t.priority !== priorityFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Table Card */}
      <Card className="overflow-hidden border-border/40 shadow-none bg-background">
        {/* Toolbar */}
        <div className="border-b border-border/20 px-6 py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="shrink-0">
              <h2 className="text-[30px] font-medium tracking-[-0.05em]">
                Tasks
              </h2>

              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                {filteredTasks.length} {filteredTasks.length === 1 ? "Task" : "Tasks"}
              </p>
            </div>

            <div className="w-full max-w-4xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              {/* View Filter */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-muted-foreground/50">View:</span>
                <Select value={view} onValueChange={setView}>
                  <SelectTrigger className="w-[150px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    <SelectItem value="my">My Tasks</SelectItem>
                    <SelectItem value="all">Team Tasks</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-muted-foreground/50">Status:</span>
                <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-[150px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-muted-foreground/50">Priority:</span>
                <Select value={priorityFilter || "all"} onValueChange={(v) => setPriorityFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-[140px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* New Task Action */}
              <Button
                onClick={() => setShowModal(true)}
                className="none-xl h-10 px-4 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
              >
                + New Task
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          <TableContainer>
            <TableHead>
              <TableRow className="text-left hover:bg-transparent">
                <TableHeaderCell className="w-12"></TableHeaderCell>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Due Date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Priority</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTasks.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-24 text-center">
                    <FolderKanban className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                    <h3 className="text-lg font-medium text-foreground">No tasks found</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Try adjusting your filters.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTasks.map((t) => {
                  const isOverdue = new Date(t.due_date) < new Date() && t.status !== 'Completed';

                  const statusColors: Record<string, string> = {
                    Completed: "text-[#8AE06C]",
                    "In Progress": "text-[#6CADF5]",
                    Pending: "text-[#F1DF38]",
                    Overdue: "text-[#F56868]",
                    Cancelled: "text-[#A77DFF]",
                  };

                  const priorityColors: Record<string, string> = {
                    High: "text-[#F56868]",
                    Medium: "text-[#F1DF38]",
                    Low: "text-[#6CADF5]",
                  };

                  return (
                    <TableRow key={t._id}>
                      {/* Checkbox */}
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={t.status === 'Completed'}
                          onChange={() => toggleComplete(t._id, t.status)}
                          className="h-4 w-4 rounded-none border border-border/40 bg-white/[0.02] text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#8AE06C]"
                        />
                      </TableCell>

                      {/* Title */}
                      <TableCell className="font-medium text-foreground text-sm">
                        {t.title}
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="rounded-none border-border/40 font-mono text-[10px] text-muted-foreground bg-transparent"
                        >
                          {t.category}
                        </Badge>
                      </TableCell>

                      {/* Due Date */}
                      <TableCell className={`text-sm ${isOverdue ? 'text-[#F56868] font-semibold' : 'text-muted-foreground'}`}>
                        {new Date(t.due_date).toLocaleDateString()}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          className={`
                            rounded-none
                            border-0
                            bg-transparent
                            px-0
                            font-mono
                            text-[12px]
                            hover:bg-transparent
                            shadow-none
                            ${statusColors[t.status] ?? "text-muted-foreground"}
                          `}
                        >
                          {t.status}
                        </Badge>
                      </TableCell>

                      {/* Priority */}
                      <TableCell>
                        <Badge
                          className={`
                            rounded-none
                            border-0
                            bg-transparent
                            px-0
                            font-mono
                            text-[12px]
                            hover:bg-transparent
                            shadow-none
                            ${priorityColors[t.priority] ?? "text-muted-foreground"}
                          `}
                        >
                          {t.priority}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </TableContainer>
        </CardContent>
      </Card>

      <NewTaskModal
        open={showModal}
        onClose={() => { setShowModal(false); setAiTaskData(undefined); }}
        onCreated={() => { setShowModal(false); setAiTaskData(undefined); fetchTasks(); }}
        initialData={aiTaskData}
      />
    </div>
  );
}
