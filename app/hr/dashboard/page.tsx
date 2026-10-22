"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
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

  // HR-specific operational parameters
  const hrStats = {
    totalEmployees: 428,
    activeEmployees: 416,
    onboardingEmployees: 12,
    todayAttendanceRate: 95.4,
    presentToday: 397,
    onLeaveToday: 15,
    pendingLeavesCount: 8,
    monthlyGrossPayroll: 38500000, // ₹3.85 Cr
    monthlyNetPayroll: 32200000, // ₹3.22 Cr
    attritionRate: 4.2,
    totalDepartments: 6,
    openJobRequisitions: 14,
  };

  const departmentDistribution = [
    { name: "Engineering & R&D", value: 140 },
    { name: "Operations & Logistics", value: 112 },
    { name: "Sales & Client Success", value: 84 },
    { name: "Finance & Accounting", value: 52 },
    { name: "Human Resources", value: 40 },
  ];

  const pendingLeaveRequests = [
    {
      id: "LR-2026-108",
      name: "Aditya Kulkarni",
      department: "Engineering",
      type: "Annual Leave",
      period: "24 Oct - 28 Oct (5 Days)",
      reason: "Family Vacation",
      appliedOn: "Today, 09:30",
    },
    {
      id: "LR-2026-107",
      name: "Pooja Sundaram",
      department: "Operations",
      type: "Sick Leave",
      period: "22 Oct - 23 Oct (2 Days)",
      reason: "Medical Recovery",
      appliedOn: "Today, 08:15",
    },
    {
      id: "LR-2026-106",
      name: "Farhan Qureshi",
      department: "Sales & Marketing",
      type: "Casual Leave",
      period: "27 Oct (1 Day)",
      reason: "Personal Commute",
      appliedOn: "Yesterday",
    },
    {
      id: "LR-2026-105",
      name: "Meera Sen",
      department: "Finance",
      type: "Compensatory Off",
      period: "30 Oct (1 Day)",
      reason: "Weekend Audit Shift",
      appliedOn: "20 Oct 2026",
    },
  ];

  const recentHires = [
    {
      code: "EMP-2026-89",
      name: "Rohan Varma",
      designation: "Senior Embedded Firmware Lead",
      department: "Engineering",
      joiningDate: "15 Oct 2026",
      status: "Active (Onboarded)",
    },
    {
      code: "EMP-2026-90",
      name: "Sunita Reddy",
      designation: "Plant Logistics Coordinator",
      department: "Operations",
      joiningDate: "18 Oct 2026",
      status: "Active (Onboarded)",
    },
    {
      code: "EMP-2026-91",
      name: "Kavita Singhal",
      designation: "Enterprise Accounts Executive",
      department: "Sales",
      joiningDate: "20 Oct 2026",
      status: "In Orientation",
    },
    {
      code: "EMP-2026-92",
      name: "Devendra Patel",
      designation: "Senior Quality Assurance Auditor",
      department: "Operations",
      joiningDate: "21 Oct 2026",
      status: "Documentation",
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
                height={340}
                colorTheme="emerald"
                metricLabel="Checked-In Staff"
                yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
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
              <CanvasPieChart
                data={departmentDistribution}
                title="Staff"
                colors={BRAND_ACCENT_PALETTE}
              />
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
                    {pendingLeaveRequests.map((req, i) => (
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
                    ))}
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
                    {recentHires.map((hire, i) => (
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
                    ))}
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
