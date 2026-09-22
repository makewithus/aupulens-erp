"use client";
import { cachedFetch } from "@/lib/api/cachedFetch";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { usePageRefresh } from "@/lib/hooks/usePageRefresh";
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
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch("/api/hr/summary");
      const json = await res.json();
      setData(json);
    } catch {
      toast.error("We couldn't load the report data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, []);

  usePageRefresh(load);

  useEffect(() => {

    if (status === "authenticated") load();
  }, [status, router, load]);

  const [exporting, setExporting] = useState<string | null>(null);

  // Downloads a presentation-ready .xlsx generated on the server straight from
  // the database, so the file always matches the source records.
  const exportReport = async (type: string, label: string) => {
    setExporting(type);
    try {
      const res = await fetch(`/api/hr/reports/export?type=${type}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "We couldn't generate this report. Please try again.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] || `${type}-report.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${label} exported`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(null);
    }
  };

  const reportCards = [
    { type: "headcount", title: "Headcount Report", description: "Employees by lifecycle status", icon: Users, color: "text-blue-500" },
    { type: "departments", title: "Department Distribution", description: "Employee count by department", icon: Building2, color: "text-green-500" },
    { type: "attendance", title: "Attendance Summary", description: "Today's attendance breakdown", icon: Clock, color: "text-amber-500" },
    { type: "leave", title: "Leave Summary", description: "Leave requests by type and status", icon: CalendarDays, color: "text-purple-500" },
    { type: "payroll", title: "Payroll Summary", description: "This month's payroll, employee by employee", icon: IndianRupee, color: "text-emerald-500" },
    { type: "hires", title: "Recent Hires", description: "Employees who joined in the last 90 days", icon: TrendingUp, color: "text-cyan-500" },
    { type: "employees", title: "Employee Directory", description: "Complete employee list with contact and salary details", icon: Users, color: "text-rose-500" },
  ].map((c) => ({ ...c, action: () => exportReport(c.type, c.title) }));

  return (
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
                  <p className="text-3xl font-black font-sans tabular-nums">{data?.stats?.totalEmployees || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Employees</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-black font-sans tabular-nums text-green-600">{data?.stats?.activeEmployees || 0}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-black font-sans tabular-nums">{data?.stats?.totalDepartments || 0}</p>
                  <p className="text-xs text-muted-foreground">Departments</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-black font-sans tabular-nums text-primary">₹{((data?.payrollSummary?.totalGross || data?.stats?.monthlyPayroll || 0) / 100000).toFixed(1)}L</p>
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
                        <Button size="sm" variant="outline" className="mt-4 w-full gap-2" onClick={report.action} disabled={exporting !== null}>
                          <Download className="h-3.5 w-3.5" />
                          {exporting === report.type ? "Preparing…" : "Export Excel"}
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
  );
}
