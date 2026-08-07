"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { projectsSidebarConfig } from "@/config/sidebar/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProject(data.data);
          setForm({
            name: data.data.name,
            description: data.data.description || "",
            status: data.data.status,
            priority: data.data.priority,
            progress: data.data.progress || 0,
            dueDate: data.data.dueDate ? data.data.dueDate.slice(0, 10) : "",
          });
        }
        setLoading(false);
      });
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, progress: Number(form.progress) }),
      });
      const data = await res.json();
      if (data.success) toast.success("Saved");
      else toast.error(data.message || "Failed to save");
    } catch { toast.error("Something went wrong"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const res = await fetch(`/api/projects/${params.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { toast.success("Deleted"); router.push("/projects"); }
    else toast.error(data.message || "Failed to delete");
  };

  if (loading) return <DashboardLayout sidebarSections={projectsSidebarConfig}><div className="p-6">Loading…</div></DashboardLayout>;
  if (!project) return <DashboardLayout sidebarSections={projectsSidebarConfig}><div className="p-6">Project not found</div></DashboardLayout>;

  return (
    <DashboardLayout
      sidebarSections={projectsSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Projects"
      pageName={project.name}
    >
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.ownerId?.name && (
              <p className="text-sm text-muted-foreground mt-1">Owner: {project.ownerId.name}</p>
            )}
          </div>
          <Badge variant="outline" className="uppercase text-[10px]">{project.priority}</Badge>
        </div>

        <div className="space-y-4 border rounded-lg p-6">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Progress (%)</Label>
              <Input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
          <Button variant="outline" onClick={handleDelete} className="gap-2 text-destructive">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
