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
import { cn } from "@/lib/utils";

export default function ProjectsDashboardPage() {
  const { data: session } = useSession();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  // Projects-specific parameters & portfolio velocity
  const projectStats = {
    totalProjects: 34,
    activeProjects: 24,
    planningProjects: 6,
    onHoldProjects: 4,
    milestoneOnTimeRate: 91.8,
    avgProgress: 72,
    totalBudgetAllocated: 152000000, // ₹15.20 Cr
    totalBudgetConsumed: 124500000, // ₹12.45 Cr
    budgetUtilization: 81.9,
    overdueTasksCount: 5,
    criticalPathBlockers: 2,
    sprintVelocityPoints: 184,
  };

  const projectPhaseDistribution = [
    { name: "Active Execution", value: 16 },
    { name: "Planning & Scoping", value: 6 },
    { name: "Validation & Testing", value: 5 },
    { name: "On Hold", value: 4 },
    { name: "Review & Signoff", value: 3 },
  ];

  const criticalProjectsList = [
    {
      id: "PRJ-2026-042",
      name: "Automated Warehousing AGV Fleet Integration",
      lead: "Karthik Subramanian",
      progress: 88,
      budgetConsumed: "₹3.8 Cr / ₹4.2 Cr",
      milestone: "Commissioning & Safety Signoff",
      dueDate: "30 Oct 2026",
      status: "On Schedule",
      color: BRAND_COLORS.accent.green,
    },
    {
      id: "PRJ-2026-039",
      name: "ERP Enterprise AI Logic Co-Pilot",
      lead: "Tanvi Saxena",
      progress: 68,
      budgetConsumed: "₹2.4 Cr / ₹3.0 Cr",
      milestone: "Model Fine-Tuning & Ingestion",
      dueDate: "15 Nov 2026",
      status: "At Risk (Blocker)",
      color: BRAND_COLORS.accent.red,
    },
    {
      id: "PRJ-2026-037",
      name: "Supply Chain IoT Sensors Rollout",
      lead: "Arjun Mehta",
      progress: 94,
      budgetConsumed: "₹1.8 Cr / ₹2.0 Cr",
      milestone: "Port Depot Gate Readers",
      dueDate: "25 Oct 2026",
      status: "On Schedule",
      color: BRAND_COLORS.accent.green,
    },
    {
      id: "PRJ-2026-035",
      name: "Plant Solar Microgrid & Power Backup",
      lead: "Suresh Pillai",
      progress: 45,
      budgetConsumed: "₹4.1 Cr / ₹5.5 Cr",
      milestone: "Inverter Synchronisation",
      dueDate: "10 Dec 2026",
      status: "Delayed (Permits)",
      color: BRAND_COLORS.accent.yellow,
    },
  ];

  const criticalSprintTasks = [
    {
      task: "Resolve CAN-bus baud rate timing jitter",
      project: "AGV Fleet Integration",
      assignee: "Naveen K.",
      daysOverdue: 2,
      priority: "CRITICAL",
    },
    {
      task: "Optimize BigQuery partitioned vector indexing",
      project: "AI Logic Co-Pilot",
      assignee: "Siddharth R.",
      daysOverdue: 1,
      priority: "HIGH",
    },
    {
      task: "Inspect battery thermal run-away sensor relay",
      project: "Plant Solar Microgrid",
      assignee: "Harish M.",
      daysOverdue: 4,
      priority: "CRITICAL",
    },
  ];

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
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
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
                On-Time 91.8%
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
              <Link href="/projects">
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
              <Link href="/projects">
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
                {projectStats.activeProjects} in execution
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-purple-400 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{projectStats.totalProjects} total across enterprise</span>
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
                {projectStats.milestoneOnTimeRate}%
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-semibold">
                <span>Avg progress across portfolio: {projectStats.avgProgress}%</span>
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
                <span>Portfolio Budget Consumed</span>
                <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                  <DollarSign className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {projectStats.budgetUtilization}%
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
                <span>{formatCurrency(projectStats.totalBudgetConsumed)} of {formatCurrency(projectStats.totalBudgetAllocated)}</span>
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
                {projectStats.criticalPathBlockers} Blockers
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-red-400 font-semibold">
                <span>{projectStats.overdueTasksCount} overdue sprint deliverables</span>
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
                "border border-border/60 shadow-sm h-full",
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
                    Day-by-day sprint burnup tracking completed engineering story points vs scope additions.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#A77DFF]" />
                    <span className="text-muted-foreground">Story Points Delivered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#6CADF5]" />
                    <span className="text-muted-foreground">Sprint Target</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <DailyBrickBarChart
                  height={340}
                  colorTheme="purple"
                  metricLabel="Story Points"
                  yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                />
              </CardContent>
            </Card>
          </div>

          {/* Projects by Lifecycle Phase Donut (CanvasPieChart) */}
          <div className="lg:col-span-4">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full flex flex-col justify-between",
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
                <CanvasPieChart
                  data={projectPhaseDistribution}
                  title="Projects"
                  colors={BRAND_ACCENT_PALETTE}
                />
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
                  <Link href="/projects">All Projects</Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono min-w-[620px] whitespace-nowrap">
                    <thead className="border-b border-border/60 text-muted-foreground bg-muted/20 whitespace-nowrap">
                      <tr>
                        <th className="p-3 pl-5">Project / Lead</th>
                        <th className="p-3">Current Milestone</th>
                        <th className="p-3">Budget</th>
                        <th className="p-3">Progress</th>
                        <th className="p-3 pr-5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {criticalProjectsList.map((prj, i) => (
                        <tr key={i} className="hover:bg-muted/10 transition-colors">
                          <td className="p-3 pl-5">
                            <div className="font-bold text-foreground">{prj.name}</div>
                            <div className="text-[10px] text-muted-foreground">{prj.id} • Lead: {prj.lead}</div>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            <div>{prj.milestone}</div>
                            <div className="text-[10px] text-muted-foreground/80">Target: {prj.dueDate}</div>
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
                      ))}
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
                  {criticalSprintTasks.map((t, idx) => (
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
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
