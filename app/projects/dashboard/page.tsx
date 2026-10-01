"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { projectsSidebarConfig } from "@/config/sidebar/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Loader2,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "border-blue-900/50 text-blue-400",
  active: "border-emerald-900/50 text-emerald-400",
  on_hold: "border-yellow-900/50 text-yellow-400",
  completed: "border-border text-muted-foreground",
  cancelled: "border-red-900/50 text-red-400",
};

type Project = {
  _id: string;
  name: string;
  description?: string;
  status: string;
  priority: "Low" | "Medium" | "High";
  progress?: number;
  dueDate?: string;
};

export default function ProjectsDashboardPage() {
  const { data: session } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setProjects(data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const metrics = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((project) => project.status === "active").length;
    const completed = projects.filter((project) => project.status === "completed").length;
    const onHold = projects.filter((project) => project.status === "on_hold").length;
    const highPriority = projects.filter((project) => project.priority === "High").length;
    const avgProgress = total
      ? Math.round(projects.reduce((sum, project) => sum + (project.progress || 0), 0) / total)
      : 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = projects.filter((project) => {
      if (!project.dueDate || project.status === "completed" || project.status === "cancelled") return false;
      return new Date(project.dueDate) < today;
    }).length;
    const dueSoon = projects.filter((project) => {
      if (!project.dueDate || project.status === "completed" || project.status === "cancelled") return false;
      const due = new Date(project.dueDate);
      const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
      return days >= 0 && days <= 7;
    }).length;

    return { total, active, completed, onHold, highPriority, avgProgress, overdue, dueSoon };
  }, [projects]);

  const recentProjects = projects.slice(0, 5);

  return (
    <DashboardLayout
      sidebarSections={projectsSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Projects"
      pageName="Dashboard"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
    >
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <BarChart3 className="h-6 w-6" /> Project Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Track project health, delivery risk, and progress.</p>
          </div>
          <Button asChild>
            <Link href="/projects">View Projects</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading project metrics...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={FolderKanban} label="Total Projects" value={metrics.total} />
              <MetricCard icon={Activity} label="Active" value={metrics.active} />
              <MetricCard icon={CheckCircle2} label="Completed" value={metrics.completed} />
              <MetricCard icon={Clock3} label="Average Progress" value={`${metrics.avgProgress}%`} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="border rounded-lg p-5 lg:col-span-2">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Project Status</h2>
                  <Badge variant="outline" className="rounded-none text-[10px] uppercase">Live</Badge>
                </div>
                <div className="space-y-4">
                  {["planning", "active", "on_hold", "completed", "cancelled"].map((status) => {
                    const count = projects.filter((project) => project.status === status).length;
                    const percent = metrics.total ? Math.round((count / metrics.total) * 100) : 0;
                    return (
                      <div key={status} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>{STATUS_LABELS[status]}</span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border rounded-lg p-5">
                <div className="mb-5 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  <h2 className="text-lg font-semibold">Risk Snapshot</h2>
                </div>
                <div className="space-y-4">
                  <RiskRow label="Overdue" value={metrics.overdue} tone="text-red-400" />
                  <RiskRow label="Due in 7 days" value={metrics.dueSoon} tone="text-yellow-400" />
                  <RiskRow label="On hold" value={metrics.onHold} tone="text-yellow-400" />
                  <RiskRow label="High priority" value={metrics.highPriority} tone="text-foreground" />
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-5">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent Projects</h2>
                <Button asChild variant="outline" size="sm">
                  <Link href="/projects">All Projects</Link>
                </Button>
              </div>
              {recentProjects.length === 0 ? (
                <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">
                  No projects yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentProjects.map((project) => (
                    <Link
                      key={project._id}
                      href={`/projects/${project._id}`}
                      className="flex items-center justify-between gap-4 border rounded-lg p-4 transition-colors hover:border-foreground/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{project.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{project.priority} priority</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[project.status] || ""}`}>
                          {STATUS_LABELS[project.status] || project.status}
                        </Badge>
                        <span className="w-10 text-right text-xs text-muted-foreground">{project.progress || 0}%</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border rounded-lg p-5">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function RiskRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${tone}`}>{value}</span>
    </div>
  );
}
