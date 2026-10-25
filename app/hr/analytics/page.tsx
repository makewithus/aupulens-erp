"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";
import {
  CanvasBarChart,
  CanvasPieChart,
  CanvasComposedChart,
} from "@/components/inventory/CanvasCharts";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";
import { AnalyticsPageSkeleton } from "@/components/ui/loading-skeletons";
import { toast } from "sonner";
import {
  Users,
  BarChart3,
  TrendingUp,
  UserCheck,
  CalendarCheck,
  DollarSign,
  Briefcase,
  Award,
  Download,
  Clock,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  HeartPulse,
  RefreshCw,
} from "lucide-react";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
}

export default function HrAnalyticsPage() {
  const cached = getInstantCachedData<any>(`/api/hr/analytics?range=1y`);
  const [data, setData] = useState<any>(() => cached ?? null);
  const [timeRange, setTimeRange] = useState<string>("1y");
  const [isLoading, setIsLoading] = useState<boolean>(() => !cached);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (fresh: boolean = false) => {
    try {
      if (fresh) setIsRefreshing(true);
      const res = await cachedFetch(`/api/hr/analytics?range=${timeRange}${fresh ? "&fresh=true" : ""}`, {
        cache: fresh ? "no-store" : "default",
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (fresh) toast.success("Live HR database synchronized");
      }
    } catch (e) {
      console.error("Failed to load HR analytics:", e);
      if (fresh) toast.error("Failed to sync live HR data");
    } finally {
      if (fresh) setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const handleRevalidate = (e: any) => {
      if (e?.detail?.url?.includes("/api/hr")) {
        loadData(true);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("aup:revalidated", handleRevalidate);
      return () => window.removeEventListener("aup:revalidated", handleRevalidate);
    }
  }, [loadData]);

  const kpis = data?.kpis || {
    totalHeadcount: 0,
    activeHeadcount: 0,
    onboardingCount: 0,
    monthlyTurnoverRate: 0,
    attendanceCompliance: 0,
    avgTenureYears: 0,
    monthlyGrossPayroll: 0,
    openRequisitions: 0,
    totalDepartments: 0,
  };
  const headcountTrajectory = Array.isArray(data?.headcountTrajectory) ? data.headcountTrajectory : [];
  const departmentDistribution = Array.isArray(data?.departmentDistribution) ? data.departmentDistribution : [];
  const attendanceTrends = Array.isArray(data?.attendanceTrends) ? data.attendanceTrends : [];
  const leaveTypeDistribution = Array.isArray(data?.leaveTypeDistribution) ? data.leaveTypeDistribution : [];
  const payrollAllocation = Array.isArray(data?.payrollAllocation) ? data.payrollAllocation : [];
  const tenureDistribution = Array.isArray(data?.tenureDistribution) ? data.tenureDistribution : [];
  const performanceDistribution = Array.isArray(data?.performanceDistribution) ? data.performanceDistribution : [];

  // Headcount Trajectory Composed Chart: Headcount (Bars) vs Net Hires (Line)
  const trajectoryChartData = useMemo(() => {
    return headcountTrajectory.map((h: any) => ({
      name: h.month,
      Headcount: h.headcount,
      "New Hires": h.hires,
      Exits: h.exits,
    }));
  }, [headcountTrajectory]);

  // Attendance Trend Bar Chart Data
  const attendanceChartData = useMemo(() => {
    return attendanceTrends.map((a: any) => ({
      name: a.day,
      "Present %": a.present,
      "Remote %": a.remote,
      "On Leave %": a.onLeave,
    }));
  }, [attendanceTrends]);

  // Performance Rating Bar Chart Data
  const performanceChartData = useMemo(() => {
    return performanceDistribution.map((p: any) => ({
      name: p.rating,
      "Employees %": p.percentage,
    }));
  }, [performanceDistribution]);

  const peakOfficeDay = useMemo(() => {
    if (!attendanceTrends || attendanceTrends.length === 0) return { day: "N/A", pct: 0 };
    const best = [...attendanceTrends].sort((a: any, b: any) => (b.present || 0) - (a.present || 0))[0];
    return { day: best.day, pct: best.present || 0 };
  }, [attendanceTrends]);

  const peakRemoteDay = useMemo(() => {
    if (!attendanceTrends || attendanceTrends.length === 0) return { day: "N/A", pct: 0 };
    const best = [...attendanceTrends].sort((a: any, b: any) => (b.remote || 0) - (a.remote || 0))[0];
    return { day: best.day, pct: best.remote || 0 };
  }, [attendanceTrends]);

  if (isLoading && !data) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <AnalyticsPageSkeleton />
      </div>
    );
  }

  const exportCsv = () => {
    const headers = ["Metric", "Value"];
    const rows = [
      ["Total Active Headcount", kpis.totalHeadcount],
      ["Monthly Turnover Rate (%)", `${kpis.monthlyTurnoverRate}%`],
      ["Attendance Compliance (%)", `${kpis.attendanceCompliance}%`],
      ["Average Employee Tenure", `${kpis.avgTenureYears} Years`],
      ["Monthly Gross Payroll", formatCurrency(kpis.monthlyGrossPayroll)],
      ["Open Job Requisitions", kpis.openRequisitions],
      ["Active Onboarding Employees", kpis.onboardingCount],
    ];
    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `HR_Analytics_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("HR analytics exported to CSV");
  };

  return (
    <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8 py-6 max-w-full font-sans">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/25 rounded-md flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Live People Intelligence
            </span>
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-md flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Real-Time MongoDB
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground break-words leading-none">
            HR Workforce Analytics & Demographics
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Longitudinal headcount trajectory, departmental staffing density, attendance patterns, and performance appraisal distributions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-muted/30 border border-border/60 rounded-lg p-1 text-xs font-mono">
            {(["30d", "90d", "1y"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1 rounded-md transition-all font-semibold uppercase ${
                  timeRange === r
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <Button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-mono text-xs shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Syncing..." : "Live Sync"}
          </Button>

          <Button
            onClick={exportCsv}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-border/60 font-mono text-xs shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>

          <Button asChild size="sm" className="h-9 gap-1.5 font-bold shadow-sm">
            <Link href="/hr/dashboard">
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              HR Dashboard
            </Link>
          </Button>
        </div>
      </div>

      {/* Top 5 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Total Active Workforce"
            value={kpis.totalHeadcount}
            visual={<UsersGraph />}
            subtitle={`Across ${kpis.totalDepartments} departments`}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Monthly Turnover"
            value={`${kpis.monthlyTurnoverRate}%`}
            visual={<ActivePulse />}
            subtitle={`${kpis.monthlyTurnoverRate <= 3 ? "Within" : "Exceeds"} 3% benchmark target`}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Attendance Compliance"
            value={`${kpis.attendanceCompliance}%`}
            visual={<InactiveOrbit />}
            subtitle="Daily biometric & geofenced check-in"
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Average Tenure"
            value={`${kpis.avgTenureYears} Years`}
            visual={<UsersGraph />}
            subtitle="High team continuity & stability"
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Monthly Payroll Outflow"
            value={formatCurrency(kpis.monthlyGrossPayroll)}
            visual={<ActivePulse />}
            subtitle="Gross monthly compensation"
          />
        </div>
      </div>

      {/* Row 1: Headcount Trajectory Composed Chart & Department Distribution Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Headcount Growth Trajectory (lg:col-span-8) */}
        <Card className="chart-animate-in chart-delay-1 lg:col-span-8 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  12-Month Headcount Trajectory & Hiring Velocity
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Net headcount expansion tracking monthly onboardings vs resignations.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" /> Total Staff
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Hires
                </span>
                <span className="flex items-center gap-1.5 text-red-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Exits
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            {trajectoryChartData.length > 0 ? (
              <div className="h-[280px] w-full">
                <CanvasComposedChart
                  data={trajectoryChartData}
                  xAxisKey="name"
                  barSeries={[{ key: "Headcount", color: "#3b82f6", name: "Headcount" }]}
                  lineSeries={{ key: "New Hires", color: "#10b981", name: "Hires" }}
                />
              </div>
            ) : (
              <div className="h-[280px] w-full flex items-center justify-center text-xs text-muted-foreground font-mono">
                No headcount trajectory records found for this period.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department Distribution (lg:col-span-4) */}
        <Card className="chart-animate-in chart-delay-2 lg:col-span-4 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all flex flex-col justify-between min-w-0">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-purple-400" />
                  Department Staffing Density
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Headcount distribution across operating units.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">
                {departmentDistribution.length} Depts
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-2 flex-1 flex flex-col justify-between">
            {departmentDistribution.length > 0 ? (
              <>
                <div className="h-[200px] w-full flex items-center justify-center relative">
                  <CanvasPieChart
                    data={departmentDistribution.map((d: any) => ({
                      name: d.name,
                      value: d.count ?? d.value,
                      color: d.color,
                    }))}
                    showLegend={false}
                    title="STAFF"
                    height={200}
                  />
                </div>
                <div className="mt-3 space-y-1.5 font-mono text-xs max-h-[160px] overflow-y-auto pr-1">
                  {departmentDistribution.map((d: any) => (
                    <div key={d.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-foreground text-[11px] font-medium truncate">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground text-[11px] tabular-nums">{d.count} staff</span>
                        <span className="font-bold text-foreground text-[11px] tabular-nums">{d.value}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[200px] w-full flex items-center justify-center text-xs text-muted-foreground font-mono">
                No departmental staffing records configured.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Attendance Patterns, Performance Bell Curve, Tenure Retention */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Attendance Compliance (lg:col-span-4) */}
        <Card className="chart-animate-in chart-delay-3 lg:col-span-4 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-emerald-400" />
              Weekly Attendance & Presence Ratio (%)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              In-office vs remote vs approved leave breakdown.
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            {attendanceChartData.length > 0 ? (
              <>
                <div className="h-[220px] w-full">
                  <CanvasBarChart
                    data={attendanceChartData}
                    xAxisKey="name"
                    series={[
                      { key: "Present %", color: "#10b981", name: "Present %" },
                      { key: "Remote %", color: "#3b82f6", name: "Remote %" },
                      { key: "On Leave %", color: "#f59e0b", name: "On Leave %" },
                    ]}
                  />
                </div>
                <div className="mt-4 p-3 rounded-lg border border-border/40 bg-muted/10 font-mono text-xs space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Peak In-Office Day</span>
                    <span className="font-bold text-foreground">{peakOfficeDay.day} ({peakOfficeDay.pct}%)</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Peak Remote Day</span>
                    <span className="font-bold text-foreground">{peakRemoteDay.day} ({peakRemoteDay.pct}% WFH)</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-[220px] w-full flex items-center justify-center text-xs text-muted-foreground font-mono">
                No attendance logs found for this period.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Review Appraisal Bell Curve (lg:col-span-4) */}
        <Card className="chart-animate-in chart-delay-4 lg:col-span-4 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              Annual Performance Bell Curve
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Normal distribution across appraisal evaluation bands.
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            {performanceDistribution.length > 0 ? (
              <>
                <div className="h-[220px] w-full">
                  <CanvasBarChart
                    data={performanceChartData}
                    xAxisKey="name"
                    series={[{ key: "Employees %", color: "#8b5cf6", name: "Employees %" }]}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[11px]">
                  {performanceDistribution.map((p: any) => (
                    <div key={p.rating} className="p-2 rounded border border-border/30 bg-muted/15 space-y-0.5">
                      <div className="text-muted-foreground truncate">{p.rating}</div>
                      <div className="font-bold text-foreground">{p.percentage}% ({p.count} staff)</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[220px] w-full flex items-center justify-center text-xs text-muted-foreground font-mono">
                No appraisal review records found.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Employee Tenure & Cohorts (lg:col-span-4) */}
        <Card className="chart-animate-in chart-delay-5 lg:col-span-4 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              Tenure & Retention Cohorts
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Longevity and organizational maturity distribution.
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-3 space-y-3 font-mono text-xs">
            {tenureDistribution.length > 0 ? (
              tenureDistribution.map((t: any) => (
                <div key={t.cohort} className="p-3 rounded-lg border border-border/40 bg-muted/10 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-foreground">{t.cohort}</span>
                    <span className="text-foreground font-bold">{t.percentage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${t.percentage}%` }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right">
                    {t.count} active employees
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground font-mono">
                No employee tenure cohort records.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Compensation & Payroll Allocation */}
      <Card className="bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
        <CardHeader className="p-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Monthly Payroll Allocation & Statutory Breakdown
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total monthly disbursement: {formatCurrency(kpis.monthlyGrossPayroll)} across {kpis.totalHeadcount} employees.
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              Disbursed on 1st of Month
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-3">
          {payrollAllocation.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              {payrollAllocation.map((p: any) => (
                <div key={p.component} className="p-4 rounded-lg border border-border/40 bg-muted/10 space-y-2">
                  <div className="text-muted-foreground text-xs uppercase font-semibold">{p.component}</div>
                  <div className="text-xl font-bold text-foreground">{formatCurrency(p.amount)}</div>
                  <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${p.percentage}%` }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right">{p.percentage}% of total payroll</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground font-mono">
              No payroll disbursement cycles recorded.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
