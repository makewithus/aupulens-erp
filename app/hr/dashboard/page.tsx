"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  Calendar,
  DollarSign,
  Building2,
  Clock,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Briefcase,
  ShieldCheck,
  CalendarCheck,
} from "lucide-react";
import { DailyBrickBarChart } from "@/components/charts/DailyBrickBarChart";
import { CanvasPieChart } from "@/components/inventory/CanvasCharts";
import { useThemeStore } from "@/store/themeStore";
import { BRAND_COLORS, BRAND_ACCENT_PALETTE } from "@/lib/constants/brandColors";
import { cn } from "@/lib/utils";

export default function HRDashboardPage() {
  const { data: session } = useSession();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [summaryData, setSummaryData] = useState<any>(null);
  const [pendingLeavesList, setPendingLeavesList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHRData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [sumRes, leaveRes] = await Promise.all([
        cachedFetch("/api/hr/summary"),
        cachedFetch("/api/hr/leave?status=pending&limit=5"),
      ]);

      if (sumRes.ok) {
        const d = await sumRes.json();
        setSummaryData(d);
      }
      if (leaveRes.ok) {
        const ld = await leaveRes.json();
        setPendingLeavesList(ld.leaveRequests || ld.leaves || []);
      }
    } catch (e) {
      console.error("Failed to fetch HR dashboard data", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHRData();
  }, [fetchHRData]);

  const totalEmployees = summaryData?.stats?.totalEmployees || 0;
  const activeEmployees = summaryData?.stats?.activeEmployees || 0;
  const onboardingEmployees = summaryData?.stats?.onboardingEmployees || 0;
  const presentToday = summaryData?.todayAttendance?.present || 0;
  const onLeaveToday = summaryData?.todayAttendance?.on_leave || 0;
  const todayAttendanceRate = activeEmployees > 0 ? Number(((presentToday / activeEmployees) * 100).toFixed(1)) : 0;
  const pendingLeavesCount = summaryData?.stats?.pendingLeaves || 0;
  const monthlyGrossPayroll = summaryData?.payrollSummary?.totalGross || 0;
  const monthlyNetPayroll = summaryData?.payrollSummary?.totalNet || 0;
  const totalDepartments = summaryData?.stats?.totalDepartments || 0;

  const hrStats = {
    totalEmployees,
    activeEmployees,
    onboardingEmployees,
    todayAttendanceRate,
    presentToday,
    onLeaveToday,
    pendingLeavesCount,
    monthlyGrossPayroll,
    monthlyNetPayroll,
    attritionRate: 0,
    totalDepartments,
    openJobRequisitions: 0,
  };

  const departmentDistribution = useMemo(() => {
    if (!summaryData?.departmentDistribution?.length) return [];
    return summaryData.departmentDistribution.map((d: any) => ({
      name: d.departmentName,
      value: d.count,
    }));
  }, [summaryData]);

  const recentHires = useMemo(() => {
    if (!summaryData?.recentHires?.length) return [];
    return summaryData.recentHires.map((h: any) => ({
      code: h.employeeCode || "EMP",
      name: `${h.firstName || ""} ${h.lastName || ""}`.trim() || "Employee",
      designation: h.designation || "Staff",
      department: h.department || "General",
      joiningDate: h.dateOfJoining ? new Date(h.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent",
      status: h.lifecycleStatus === "active" ? "Active (Onboarded)" : (h.lifecycleStatus || "Active"),
    }));
  }, [summaryData]);

  const dailyAttendance = useMemo(() => {
    return summaryData?.dailyAttendance || [];
  }, [summaryData]);

  const pendingLeaveRequests = useMemo(() => {
    if (!pendingLeavesList.length) return [];
    return pendingLeavesList.map((req: any) => ({
      id: req._id || req.id,
      name: req.employee ? `${req.employee.firstName || ""} ${req.employee.lastName || ""}`.trim() : (req.employeeName || "Employee"),
      department: req.employee?.department?.name || req.department || "Staff",
      type: req.leaveType || req.type || "Leave",
      period: `${req.startDate ? new Date(req.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""} - ${req.endDate ? new Date(req.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""}`,
      reason: req.reason || "Personal",
      appliedOn: req.createdAt ? new Date(req.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "Recent",
    }));
  }, [pendingLeavesList]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 min-w-0 max-w-full font-mono">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Workforce Intelligence
            </span>
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Attendance 95.4%
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
            HR & Workforce Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time human capital analytics tracking headcount, daily shift attendance, payroll disbursement, and leave approvals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="text-xs font-mono h-9 gap-1.5 bg-[#8AE06C] hover:bg-[#78cf5a] text-[#0A0A0A] font-bold shadow-sm"
          >
            <Link href="/hr/employees">
              <UserPlus className="w-3.5 h-3.5" />
              Add Employee
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
            <Link href="/hr/payroll">
              <DollarSign className="w-3.5 h-3.5" />
              Run Payroll
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
            <Link href="/hr/leave">
              <Calendar className="w-3.5 h-3.5" />
              Leave Approvals
            </Link>
          </Button>
        </div>
      </div>

      {/* 4 Primary HR KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Headcount */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
              <span>Total Workforce</span>
              <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                <Users className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-foreground">
              {hrStats.totalEmployees} Team Members
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{hrStats.onboardingEmployees} currently onboarding</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Today's Attendance */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
              <span>Today&apos;s Attendance Rate</span>
              <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                <CalendarCheck className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-emerald-400">
              {hrStats.todayAttendanceRate}%
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-semibold">
              <span>{hrStats.presentToday} checked in • {hrStats.onLeaveToday} on leave</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Monthly Net Payroll */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
              <span>Monthly Payroll Disbursement</span>
              <span className="p-1.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">
                <DollarSign className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-foreground">
              {formatCurrency(hrStats.monthlyNetPayroll)}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-purple-400 font-semibold">
              <span>Gross: {formatCurrency(hrStats.monthlyGrossPayroll)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Low Attrition & Approvals */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
              <span>Annualized Attrition Rate</span>
              <span className="p-1.5 bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20">
                <ShieldCheck className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-foreground">
              {hrStats.attritionRate}%
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-yellow-500 font-semibold">
              <span>{hrStats.pendingLeavesCount} leave approvals pending</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Attendance & Shift Execution Timeline (DailyBrickBarChart) */}
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
                  <span className="w-2 h-2 rounded-full bg-[#8AE06C] animate-pulse" />
                  <CardTitle className="text-base font-bold">
                    Daily Shift Attendance & Active Check-In Velocity
                  </CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  High-frequency time-clock tracking employee attendance consistency across factory & corporate divisions.
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#8AE06C]" />
                  <span className="text-muted-foreground">Present Check-In</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#F1DF38]" />
                  <span className="text-muted-foreground">Overtime Shift</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <DailyBrickBarChart
                data={dailyAttendance}
                valueKey="count"
                height={340}
                colorTheme="emerald"
                metricLabel="Checked-In Staff"
                yAxisFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()}
              />
            </CardContent>
          </Card>
        </div>

        {/* Headcount by Department Donut (CanvasPieChart) */}
        <div className="lg:col-span-4">
          <Card
            className={cn(
              "border border-border/60 shadow-sm h-full flex flex-col justify-between",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardHeader className="p-5 border-b border-border/60">
              <CardTitle className="text-base font-bold">
                Headcount by Department
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Staff allocation across core engineering, operations, and business teams.
              </p>
            </CardHeader>
            <CardContent className="p-5 flex-1 flex flex-col justify-center items-center">
              {departmentDistribution.length > 0 ? (
                <CanvasPieChart
                  data={departmentDistribution}
                  title="Staff"
                  colors={BRAND_ACCENT_PALETTE}
                />
              ) : (
                <div className="h-[220px] flex items-center justify-center text-xs font-mono text-muted-foreground">
                  No department distribution records
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 3: Pending Leave Approvals & Recent Onboardings Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Pending Leave Approvals */}
        <div className="lg:col-span-6">
          <Card
            className={cn(
              "border border-border/60 shadow-sm h-full",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardHeader className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-yellow-500" /> Pending Leave Approvals Queue
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Awaiting manager sign-off for upcoming scheduled time off.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="text-xs font-mono h-8 border-border/60 self-start sm:self-auto"
              >
                <Link href="/hr/leave">All Leaves ({hrStats.pendingLeavesCount})</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono min-w-[500px] whitespace-nowrap">
                  <thead className="border-b border-border/60 text-muted-foreground bg-muted/20 whitespace-nowrap">
                    <tr>
                      <th className="p-3 pl-5">Employee / Dept</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Duration</th>
                      <th className="p-3 pr-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {pendingLeaveRequests.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground text-xs font-mono">
                          No pending leave approvals
                        </td>
                      </tr>
                    ) : (
                      pendingLeaveRequests.map((req, i) => (
                        <tr key={i} className="hover:bg-muted/10 transition-colors">
                          <td className="p-3 pl-5">
                            <div className="font-bold text-foreground">{req.name}</div>
                            <div className="text-[10px] text-muted-foreground">{req.department}</div>
                          </td>
                          <td className="p-3 text-muted-foreground">{req.type}</td>
                          <td className="p-3">
                            <div className="font-semibold text-foreground">{req.period}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                              {req.reason}
                            </div>
                          </td>
                          <td className="p-3 pr-5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="h-7 text-[10px] font-mono bg-emerald-600 hover:bg-emerald-700 text-white"
                                asChild
                              >
                                <Link href="/hr/leave">Approve</Link>
                              </Button>
                            </div>
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

        {/* Recent Onboardings Queue */}
        <div className="lg:col-span-6">
          <Card
            className={cn(
              "border border-border/60 shadow-sm h-full",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardHeader className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#8AE06C]" /> Recent Hires & Onboarding Pipeline
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  New talent joined across enterprise departments within the last 14 days.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="text-xs font-mono h-8 border-border/60 self-start sm:self-auto"
              >
                <Link href="/hr/onboarding">View Pipeline</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono min-w-[500px] whitespace-nowrap">
                  <thead className="border-b border-border/60 text-muted-foreground bg-muted/20 whitespace-nowrap">
                    <tr>
                      <th className="p-3 pl-5">Member / Role</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Joined</th>
                      <th className="p-3 pr-5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {recentHires.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground text-xs font-mono">
                          No recent hires recorded for this organization
                        </td>
                      </tr>
                    ) : (
                      recentHires.map((hire, i) => (
                        <tr key={i} className="hover:bg-muted/10 transition-colors">
                          <td className="p-3 pl-5">
                            <div className="font-bold text-foreground">{hire.name}</div>
                            <div className="text-[10px] text-muted-foreground">{hire.designation}</div>
                          </td>
                          <td className="p-3 text-muted-foreground">{hire.department}</td>
                          <td className="p-3 text-muted-foreground">{hire.joiningDate}</td>
                          <td className="p-3 pr-5 text-right">
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-mono text-[10px]",
                                hire.status.includes("Active")
                                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                  : "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10"
                              )}
                            >
                              {hire.status}
                            </Badge>
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
      </div>
    </div>
  );
}
