"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { projectsSidebarConfig } from "@/config/sidebar/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FolderKanban,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  ArrowRight,
  Plus,
  Activity,
  Layers,
  Calendar,
  DollarSign,
  Users,
  Target,
  ShieldAlert,
} from "lucide-react";
import { DailyBrickBarChart } from "@/components/charts/DailyBrickBarChart";
import { CanvasPieChart } from "@/components/inventory/CanvasCharts";
import { useThemeStore } from "@/store/themeStore";
import { BRAND_COLORS, BRAND_ACCENT_PALETTE } from "@/lib/constants/brandColors";
import { cn, toLocalDateString } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";

function computeProjectDashboardData(projects: any[]) {
  const projectStatusLabels: Record<string, string> = {
    planning: "Planning",
    active: "Active",
    in_progress: "In Progress",
    on_hold: "On Hold",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  const total = projects.length;
  const active = projects.filter((p: any) => p.status === "in_progress" || p.status === "active").length;
  const planning = projects.filter((p: any) => p.status === "planning").length;
  const onHold = projects.filter((p: any) => p.status === "on_hold").length;
  const completed = projects.filter((p: any) => p.status === "completed").length;
  const avgProg = total > 0 ? Math.round(projects.reduce((acc: number, p: any) => acc + (p.progress || 0), 0) / total) : 0;
  // Project records do not contain milestone dates, budgets, or task data.
  // Keep those measures unavailable instead of deriving plausible-looking values.

  const stats = {
    totalProjects: total,
    activeProjects: active,
    planningProjects: planning,
    onHoldProjects: onHold,
    milestoneOnTimeRate: null,
    avgProgress: avgProg,
    totalBudgetAllocated: null,
    totalBudgetConsumed: null,
    budgetUtilization: null,
    overdueTasksCount: null,
    criticalPathBlockers: null,
    sprintVelocityPoints: null,
  };

  const projectPhaseDistribution = [
    { name: "Active Execution", value: active },
    { name: "Planning & Scoping", value: planning },
    { name: "On Hold", value: onHold },
    { name: "Completed", value: completed },
  ].filter((p) => p.value > 0);

  const criticalProjectsList = projects.slice(0, 5).map((p: any) => ({
    id: p._id?.slice(-8).toUpperCase() || "PRJ",
    name: p.name,
    lead: p.ownerId?.name || "Unassigned",
    progress: p.progress || 0,
    budgetConsumed: "Not tracked",
    milestone: p.status || "Unknown",
    dueDate: p.dueDate ? new Date(p.dueDate).toLocaleDateString() : "Ongoing",
    status: projectStatusLabels[p.status] || "In Review",
    color: p.status === "completed" ? BRAND_COLORS.accent.green : p.status === "cancelled" ? BRAND_COLORS.accent.red : BRAND_COLORS.accent.blue,
  }));

  const countsByDate = new Map<string, number>();
  for (const proj of projects) {
    const d = proj.createdAt || proj.startDate || proj.updatedAt;
    if (!d) continue;
    const dateStr = toLocalDateString(d);
    if (!dateStr) continue;
    countsByDate.set(dateStr, (countsByDate.get(dateStr) || 0) + 1);
  }

  const dailyDeliverables = countsByDate.size > 0
    ? Array.from(countsByDate.entries())
        .map(([date, count]) => {
          const dObj = new Date(date + "T00:00:00");
          return {
            date,
            count,
            label: isNaN(dObj.getTime())
              ? date
              : dObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return {
    stats,
    projectPhaseDistribution,
    criticalProjectsList,
    criticalSprintTasks: null as any[] | null,
    dailyDeliverables,
  };
}

export default function ProjectsDashboardPage() {
  const { data: session } = useSession();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const emptyData = computeProjectDashboardData([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState(emptyData.stats);
  const [projectPhaseDistribution, setProjectPhaseDistribution] = useState<any[]>(emptyData.projectPhaseDistribution);
  const [criticalProjectsList, setCriticalProjectsList] = useState<any[]>(emptyData.criticalProjectsList);
  const [criticalSprintTasks, setCriticalSprintTasks] = useState<any[] | null>(emptyData.criticalSprintTasks);
  const [dailyDeliverables, setDailyDeliverables] = useState<any[]>(emptyData.dailyDeliverables);

  const loadProjects = async (force = false) => {
    try {
      const res = await cachedFetch("/api/projects", undefined, { force });
      const json = res.ok ? await res.json() : null;
      if (json?.success && Array.isArray(json.data)) {
        const computed = computeProjectDashboardData(json.data);
        setStats(computed.stats);
        setProjectPhaseDistribution(computed.projectPhaseDistribution);
        setCriticalProjectsList(computed.criticalProjectsList);
        setCriticalSprintTasks(computed.criticalSprintTasks);
        setDailyDeliverables(computed.dailyDeliverables);
      }
    } catch (err) {
      console.error("Failed to load projects dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 1. Safe post-hydration cache read for instant 0ms load
    const cachedProjects = getInstantCachedData<{ success: boolean; data: any[] }>("/api/projects", { allowPreHydration: true });
    if (cachedProjects?.data && Array.isArray(cachedProjects.data)) {
      const computed = computeProjectDashboardData(cachedProjects.data);
      setStats(computed.stats);
      setProjectPhaseDistribution(computed.projectPhaseDistribution);
      setCriticalProjectsList(computed.criticalProjectsList);
      setCriticalSprintTasks(computed.criticalSprintTasks);
      setDailyDeliverables(computed.dailyDeliverables);
      setIsLoading(false);
    }

    loadProjects();
  }, []);

  useEffect(() => {
    const handleRevalidate = (e: any) => {
      if (e?.detail?.url?.includes("/api/projects")) {
        loadProjects(true);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("aup:revalidated", handleRevalidate);
      return () => window.removeEventListener("aup:revalidated", handleRevalidate);
    }
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <DashboardLayout
      sidebarSections={projectsSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Projects Portfolio Dashboard"
      pageName="Projects Dashboard"
      breadcrumbs={[{ label: "Projects", href: "/projects/dashboard" }, { label: "Portfolio Dashboard" }]}
      userName={session?.user?.name || "Program Manager"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 min-w-0 max-w-full font-mono">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Portfolio Governance
              </span>
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Milestone timing: Not tracked
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
              Projects & Deliverables Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Cross-enterprise capital project delivery tracking milestone velocity, budget burn, sprint output, and risk blockers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="text-xs font-mono h-9 gap-1.5 bg-[#A77DFF] hover:bg-[#966be8] text-[#0A0A0A] font-bold shadow-sm"
            >
              <Link href="/projects/list">
                <Plus className="w-3.5 h-3.5" />
                New Project
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(
                "text-xs font-mono h-9 gap-1.5 border-border/70",
                isDark ? "bg-[#161616] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white text-zinc-800 hover:bg-zinc-100"
              )}
            >
              <Link href="/projects/list">
                <FolderKanban className="w-3.5 h-3.5" />
                All Projects
              </Link>
            </Button>
          </div>
        </div>

        {/* 4 Primary Project KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Active Projects */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Active Capital Projects</span>
                <span className="p-1.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">
                  <FolderKanban className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {isLoading ? (
                  <Skeleton className="h-8 w-32 rounded-none bg-muted-foreground/15 my-1" />
                ) : (
                  `${stats.activeProjects} in execution`
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-purple-400 font-semibold">
                {isLoading ? (
                  <Skeleton className="h-3.5 w-40 rounded-none bg-muted-foreground/10" />
                ) : (
                  <>
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>{stats.totalProjects} total across enterprise</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Milestone On-Time Rate */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Milestone Delivery Rate</span>
                <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-emerald-400">
                {isLoading ? (
                  <Skeleton className="h-8 w-20 rounded-none bg-muted-foreground/15 my-1" />
                ) : (
                  "Not tracked"
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-semibold">
                {isLoading ? (
                  <Skeleton className="h-3.5 w-44 rounded-none bg-muted-foreground/10" />
                ) : (
                  <span>Avg progress across portfolio: {stats.avgProgress}%</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Budget Burn Rate */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Completed Velocity Points</span>
                <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                  <Target className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {isLoading ? (
                  <Skeleton className="h-8 w-24 rounded-none bg-muted-foreground/15 my-1" />
                ) : (
                  "Not tracked"
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
                {isLoading ? (
                  <Skeleton className="h-3.5 w-36 rounded-none bg-muted-foreground/10" />
                ) : (
                  <span>Sprint completion telemetry</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Critical Path Blockers */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Delivery Blockers & Risks</span>
                <span className="p-1.5 bg-red-500/10 text-red-500 rounded border border-red-500/20">
                  <ShieldAlert className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-red-500">
                {isLoading ? (
                  <Skeleton className="h-8 w-28 rounded-none bg-muted-foreground/15 my-1" />
                ) : (
                  "Not tracked"
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-red-400 font-semibold">
                {isLoading ? (
                  <Skeleton className="h-3.5 w-44 rounded-none bg-muted-foreground/10" />
                ) : (
                  <span>Task and blocker data is not connected</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 2: Visual Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sprint Velocity & Task Throughput (DailyBrickBarChart) */}
          <div className="lg:col-span-8">
            <Card
              className={cn(
                "chart-animate-in chart-delay-1 border border-border/60 shadow-sm h-full",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#A77DFF] animate-pulse" />
                    <CardTitle className="text-base font-bold">
                      Sprint Velocity & Daily Deliverables Throughput
                    </CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Day-by-day sprint burnup tracking completed engineering deliverables vs scope additions.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#A77DFF]" />
                    <span className="text-muted-foreground">Deliverables</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#6CADF5]" />
                    <span className="text-muted-foreground">Active Initiatives</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <DailyBrickBarChart
                  height={340}
                  colorTheme="purple"
                  metricLabel="Project Activity"
                  data={dailyDeliverables}
                  valueKey="count"
                  yAxisFormatter={(v) => `${v}`}
                />
              </CardContent>
            </Card>
          </div>

          {/* Projects by Lifecycle Phase Donut (CanvasPieChart) */}
          <div className="lg:col-span-4">
            <Card
              className={cn(
                "chart-animate-in chart-delay-2 border border-border/60 shadow-sm h-full flex flex-col justify-between",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60">
                <CardTitle className="text-base font-bold">
                  Projects by Phase
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Portfolio balance between planning, execution, and signoff stages.
                </p>
              </CardHeader>
              <CardContent className="p-5 flex-1 flex flex-col justify-center items-center">
                {projectPhaseDistribution.length > 0 ? (
                  <CanvasPieChart
                    data={projectPhaseDistribution}
                    title="Projects"
                    colors={BRAND_ACCENT_PALETTE}
                  />
                ) : (
                  <div className="py-12 text-center text-xs text-muted-foreground font-mono">
                    No active projects across lifecycle phases
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section 3: Critical Path Deliverables & Sprint Task Risks */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Critical Path Projects */}
          <div className="lg:col-span-8">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold">
                    Critical Strategic Deliverables
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Key enterprise initiatives under active milestone tracking.
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="text-xs font-mono h-8 border-border/60 self-start sm:self-auto"
                >
                  <Link href="/projects/list">All Projects</Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono min-w-[620px] whitespace-nowrap">
                    <thead className="border-b border-border/60 text-muted-foreground bg-muted/20 whitespace-nowrap">
                      <tr>
                        <th className="p-3 pl-5">Project / Lead</th>
                        <th className="p-3">Project Status / Due Date</th>
                        <th className="p-3">Budget</th>
                        <th className="p-3">Progress</th>
                        <th className="p-3 pr-5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {criticalProjectsList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-muted-foreground font-mono">
                            No active capital projects registered for this organization.
                          </td>
                        </tr>
                      ) : (
                        criticalProjectsList.map((prj, i) => (
                          <tr key={i} className="hover:bg-muted/10 transition-colors">
                            <td className="p-3 pl-5">
                              <div className="font-bold text-foreground">{prj.name}</div>
                              <div className="text-[10px] text-muted-foreground">{prj.id} • Lead: {prj.lead}</div>
                            </td>
                            <td className="p-3 text-muted-foreground">
                              <div>{prj.status}</div>
                              <div className="text-[10px] text-muted-foreground/80">Due: {prj.dueDate}</div>
                            </td>
                            <td className="p-3 font-semibold text-foreground">{prj.budgetConsumed}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-border/40 overflow-hidden">
                                  <div
                                    className="h-full bg-[#A77DFF]"
                                    style={{ width: `${prj.progress}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground">{prj.progress}%</span>
                              </div>
                            </td>
                            <td className="p-3 pr-5 text-right">
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-bold"
                                style={{
                                  backgroundColor: `${prj.color}20`,
                                  color: prj.color,
                                  border: `1px solid ${prj.color}40`,
                                }}
                              >
                                {prj.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Overdue Tasks / Blockers */}
          <div className="lg:col-span-4">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60">
                <CardTitle className="text-base font-bold text-red-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Blockers & Overdue Tasks
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Critical sprint deliverables delaying scheduled releases.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {!criticalSprintTasks ? (
                    <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                      Task and blocker data is not available from the project records.
                    </div>
                  ) : criticalSprintTasks.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                      No blocker records found.
                    </div>
                  ) : (
                    criticalSprintTasks.map((t, idx) => (
                      <div key={idx} className="p-4 hover:bg-muted/10 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-bold text-foreground max-w-[200px]">
                            {t.task}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                            {t.priority}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex justify-between items-center mt-1">
                          <span>Project: {t.project}</span>
                          <span className="text-red-400 font-bold">{t.daysOverdue} days overdue</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Assignee: {t.assignee}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
