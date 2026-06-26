"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  UserPlus,
  Calendar,
  DollarSign,
  Building2,
  Clock,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HRStats } from "@/components/hr/HRStats";
import { DepartmentDistribution } from "@/components/hr/DepartmentDistribution";
import { WorkforceOverview } from "@/components/hr/WorkforceOverview";

interface DashboardData {
  stats: {
    totalEmployees: number;
    activeEmployees: number;
    onboardingEmployees: number;
    exitedLast30Days: number;
    totalDepartments: number;
    pendingLeaves: number;
  };
  todayAttendance: Record<string, number>;
  payrollSummary: {
    totalGross: number;
    totalNet: number;
    status: string;
  };
  departmentDistribution: Array<{
    departmentName: string;
    count: number;
  }>;
  recentHires: Array<{
    firstName: string;
    lastName: string;
    employeeCode: string;
    designation: string;
    dateOfJoining: string;
    lifecycleStatus: string;
  }>;
}

export default function HRDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/summary");
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json);
    } catch (error) {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/hr");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const formatCurrency = (val: number) =>
    "₹" + (val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const statCards = [
    {
      title: "Total Employees",
      value: data?.stats.totalEmployees || 0,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Active Employees",
      value: data?.stats.activeEmployees || 0,
      icon: TrendingUp,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      title: "Onboarding",
      value: data?.stats.onboardingEmployees || 0,
      icon: UserPlus,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      title: "Pending Leaves",
      value: data?.stats.pendingLeaves || 0,
      icon: Calendar,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      title: "Departments",
      value: data?.stats.totalDepartments || 0,
      icon: Building2,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      title: "Monthly Payroll",
      value: formatCurrency(data?.payrollSummary.totalNet || 0),
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
  ];

  const quickActions = [
    {
      title: "Add Employee",
      description: "Create a new employee",
      href: "/hr/employees",
      icon: UserPlus,
    },
    {
      title: "Run Payroll",
      description: "Process monthly payroll",
      href: "/hr/payroll",
      icon: DollarSign,
    },
    {
      title: "Leave Requests",
      description: "Approve pending leaves",
      href: "/hr/leave",
      icon: Calendar,
    },
    {
      title: "Attendance",
      description: "View & manage attendance",
      href: "/hr/attendance",
      icon: Clock,
    },
    {
      title: "Departments",
      description: "Manage departments",
      href: "/hr/departments",
      icon: Building2,
    },
    {
      title: "HR Reports",
      description: "View analytics & reports",
      href: "/hr/reports",
      icon: TrendingUp,
    },
  ];

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="HR & Payroll"
      pageName="Dashboard"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "Dashboard" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
      onRefresh={load}
    >
      <div className="space-y-6 max-w-8xl mx-auto">
        {/* Page Title */}
        <div>
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            HR Dashboard
          </h1>
        </div>

        {/* Stat Cards */}
        <HRStats
          summary={data}
          formatCurrency={formatCurrency}
        />

        {/* Quick Actions */}
        {/* <div>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.map((action, idx) => (
              <Card
                key={idx}
                className="border-border/40 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => router.push(action.href)}
              >
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors">
                    <action.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-foreground">{action.title}</div>
                    <div className="text-xs text-muted-foreground">{action.description}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div> */}

        <DepartmentDistribution
          loading={loading}
          departments={data?.departmentDistribution ?? []}
        />

          <WorkforceOverview
            loading={loading}
            attendance={data?.todayAttendance ?? {}}
            hires={data?.recentHires ?? []}
        />

        {/* <DepartmentDistribution
          loading={loading}
          departments={data?.departmentDistribution ?? []}
      /> exchacnge both later ketaa*/}
      </div>
    </DashboardLayout>
  );
}
