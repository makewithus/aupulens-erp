"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Users,
  Building2,
  Clock,
  CalendarDays,
  TrendingUp,
  Download,
  IndianRupee,
} from "lucide-react";

export default function HRReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/summary");
      const json = await res.json();
      setData(json);
    } catch {
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/hr");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const exportCSV = (title: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${title} exported`);
  };

  const reportCards = [
    {
      title: "Headcount Report",
      description: "Total, active, onboarding, and exited employee counts",
      icon: Users,
      color: "text-blue-500",
      action: () => {
        if (!data) return;
        exportCSV(
          "headcount-report",
          ["Metric", "Count"],
          [
            ["Total Employees", String(data.stats?.totalEmployees || 0)],
            ["Active", String(data.stats?.activeEmployees || 0)],
            ["Onboarding", String(data.stats?.onboardingCount || 0)],
            ["On Notice / Exit", String((data.stats?.totalEmployees || 0) - (data.stats?.activeEmployees || 0) - (data.stats?.onboardingCount || 0))],
          ],
        );
      },
    },
    {
      title: "Department Distribution",
      description: "Employee count by department",
      icon: Building2,
      color: "text-green-500",
      action: () => {
        if (!data?.departmentDistribution) return;
        exportCSV(
          "department-distribution",
          ["Department", "Count"],
          data.departmentDistribution.map((d: any) => [d.departmentName || d._id || "Unassigned", String(d.count)]),
        );
      },
    },
    {
      title: "Attendance Summary",
      description: "Today's attendance breakdown",
      icon: Clock,
      color: "text-amber-500",
      action: () => {
        if (!data?.todayAttendance) return;
        const att = data.todayAttendance;
        const rows = Array.isArray(att)
          ? att.map((a: any) => [a._id, String(a.count)])
          : Object.entries(att).map(([k, v]) => [k, String(v)]);
        exportCSV("attendance-summary", ["Status", "Count"], rows);
      },
    },
    {
      title: "Leave Summary",
      description: "Leave requests by status",
      icon: CalendarDays,
      color: "text-purple-500",
      action: () => {
        if (!data?.stats) return;
        exportCSV(
          "leave-summary",
          ["Metric", "Count"],
          [["Pending Leaves", String(data.stats.pendingLeaves || 0)]],
        );
      },
    },
    {
      title: "Payroll Summary",
      description: "Monthly payroll totals",
      icon: IndianRupee,
      color: "text-emerald-500",
      action: () => {
        if (!data?.payrollSummary && !data?.stats) return;
        const ps = data.payrollSummary || {};
        exportCSV(
          "payroll-summary",
          ["Metric", "Value"],
          [
            ["Total Gross (₹)", String(ps.totalGross ?? data.stats?.monthlyPayroll ?? 0)],
            ["Total Net (₹)", String(ps.totalNet ?? 0)],
            ["Status", ps.status || "N/A"],
          ],
        );
      },
    },
    {
      title: "Recent Hires",
      description: "Employees who joined recently",
      icon: TrendingUp,
      color: "text-cyan-500",
      action: () => {
        if (!data?.recentHires) return;
        exportCSV(
          "recent-hires",
          ["Name", "Code", "Date of Joining", "Department"],
          data.recentHires.map((h: any) => [
            `${h.firstName} ${h.lastName}`,
            h.employeeCode,
            new Date(h.dateOfJoining).toLocaleDateString(),
            h.departmentId?.name || "N/A",
          ]),
        );
      },
    },
  ];

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="HR Reports"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "Reports" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onRefresh={load}
    >
      <div className="space-y-8 max-w-8xl mx-auto">
        <div>
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">HR Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and export HR analytics and reports
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-border/40">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-black">{data?.stats?.totalEmployees || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Employees</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-black text-green-600">{data?.stats?.activeEmployees || 0}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-black">{data?.stats?.totalDepartments || 0}</p>
                  <p className="text-xs text-muted-foreground">Departments</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-black text-primary">₹{((data?.payrollSummary?.totalGross || data?.stats?.monthlyPayroll || 0) / 100000).toFixed(1)}L</p>
                  <p className="text-xs text-muted-foreground">Monthly Payroll</p>
                </CardContent>
              </Card>
            </div>

            {/* Department Distribution */}
            {data?.departmentDistribution && data.departmentDistribution.length > 0 && (
              <Card className="border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold uppercase text-muted-foreground">Department Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.departmentDistribution.map((dept: any, idx: number) => {
                      const maxCount = Math.max(...data.departmentDistribution.map((d: any) => d.count));
                      const pct = maxCount > 0 ? (dept.count / maxCount) * 100 : 0;
                      return (
                        <div key={idx}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{dept.departmentName || dept._id || "Unassigned"}</span>
                            <span className="text-muted-foreground">{dept.count}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Report Cards */}
            <div>
              <h2 className="text-sm font-bold text-muted-foreground uppercase mb-4">Export Reports</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reportCards.map((report, idx) => {
                  const Icon = report.icon;
                  return (
                    <Card key={idx} className="border-border/40 hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3">
                          <Icon className={`h-8 w-8 ${report.color}`} />
                          <div className="flex-1">
                            <h3 className="font-bold text-foreground">{report.title}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="mt-4 w-full gap-2" onClick={report.action}>
                          <Download className="h-3.5 w-3.5" />
                          Export CSV
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
