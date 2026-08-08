"use client";

import { useState, useEffect } from "react";
import { consumePrefill } from "@/lib/ai/aiPrefill";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { projectsSidebarConfig } from "@/config/sidebar/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Loader2, FolderKanban } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning", active: "Active", on_hold: "On Hold", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_COLORS: Record<string, string> = {
  planning: "border-blue-900/50 text-blue-400",
  active: "border-emerald-900/50 text-emerald-400",
  on_hold: "border-yellow-900/50 text-yellow-400",
  completed: "border-neutral-700 text-neutral-400",
  cancelled: "border-red-900/50 text-red-400",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", status: "planning", priority: "Medium", dueDate: "" });

  // AI-native pre-fill (sweep): open the create dialog with AI-extracted fields.
  useEffect(() => {
    const p = consumePrefill("project");
    if (!p) return;
    setForm((f: any) => { const n: any = { ...f }; for (const k of Object.keys(f)) { const v = (p.data as any)?.[k]; if (v !== undefined && v !== null && v !== "") n[k] = v; } return n; });
    setOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProjects = () => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => { if (data.success) setProjects(data.data); setLoading(false); });
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Project name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Project created");
        setForm({ name: "", description: "", status: "planning", priority: "Medium", dueDate: "" });
        setOpen(false);
        fetchProjects();
      } else {
        toast.error(data.message || "Failed to create project");
      }
    } catch { toast.error("Something went wrong"); }
    finally { setSaving(false); }
  };

  return (
    <DashboardLayout
      sidebarSections={projectsSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Projects"
      pageName="All Projects"
    >
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FolderKanban className="w-6 h-6" /> Projects
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Track initiatives, owners, and progress.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1" /> New Project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Low", "Medium", "High"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Due Date</Label>
                  <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
            No projects yet. Create your first one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Link key={p._id} href={`/projects/${p._id}`}>
                <div className="border rounded-lg p-5 hover:border-foreground/40 transition-colors h-full">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold">{p.name}</h3>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[p.status] || ""}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </Badge>
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{p.description}</p>}
                  <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: `${p.progress || 0}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{p.priority} priority</span>
                    <span>{p.progress || 0}%</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
