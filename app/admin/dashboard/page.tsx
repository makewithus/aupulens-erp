"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import {
  TrendingUp,
  TrendingDown,
  Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/components/admin/DashboardStats";
import { DashboardMetrics } from "@/components/admin/DashboardMetrics";
import { NetProfitCard } from "@/components/admin/NetProfitCard";
import { DashboardCharts } from "@/components/admin/DashboardCharts";

interface DashboardSummary {
  finance: {
    totalRevenue: number;
    revenueCurrentMonth: number;
    revenueChange: number;
    totalExpenses: number;
    expensesCurrentMonth: number;
    netIncome: number;
    totalTransactions: number;
    draftInvoices: number;
  };
  sales: {
    totalOrders: number;
    ordersCurrentMonth: number;
    ordersChange: number;
    totalCustomers: number;
    newCustomersThisMonth: number;
  };
  inventory: {
    totalProducts: number;
    publishedProducts: number;
    draftProducts: number;
    totalStockTransfers: number;
  };
  manufacturing: {
    totalManufacturingOrders: number;
  };
  users: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
  };
  chartData: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/admin");
    } else if (status === "authenticated") {
      if (
        session?.user?.role !== "admin" &&
        session?.user?.role !== "master-admin"
      ) {
        router.push("/auth/admin");
      } else {
        fetchDashboardData();
      }
    }
  }, [status, session, router]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard");
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getChangeIndicator = (change: number) => {
    if (change > 0) {
      return {
        icon: TrendingUp,
        color: "text-emerald-600",
        bg: "bg-emerald-500/10",
      };
    } else if (change < 0) {
      return {
        icon: TrendingDown,
        color: "text-rose-600",
        bg: "bg-rose-500/10",
      };
    }
    return {
      icon: Activity,
      color: "text-muted-foreground",
      bg: "bg-muted",
    };
  };

  if (status === "unauthenticated") {
    return null;
  }

  if (status === "loading" || isLoading) {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin"
        pageName="System Overview"
        userName={session?.user?.name || "Admin"}
        userEmail={session?.user?.email}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
        onRefresh={fetchDashboardData}
        profilePath="/admin/profile"
      >
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div className="space-y-1">
            <Skeleton className="h-[48px] w-[300px] md:h-[56px] md:w-[450px]" />
          </div>

          {/* Stats Cards Skeleton (6 items) */}
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-none p-6">
                <Skeleton className="h-4 w-[100px] mb-4" />
                <Skeleton className="h-8 w-[160px] mb-2" />
                <Skeleton className="h-3.5 w-[140px]" />
              </Card>
            ))}
          </div>

          {/* Charts Skeleton (3 items) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border border-neutral-800 bg-neutral-900/60 p-6 h-[380px] flex flex-col justify-between shadow-none">
                <div>
                  <Skeleton className="h-4 w-[120px] mb-2" />
                  <Skeleton className="h-3 w-[150px] mb-6" />
                  <Skeleton className="h-10 w-[200px]" />
                </div>
                <div className="h-[150px] w-full flex items-end gap-2 pt-4">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="flex-1 h-[60%] last:h-[90%] odd:h-[40%] rounded-none" />
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* Net Profit Card Skeleton (Full Width) */}
          <Card className="p-8 border-0 shadow-none flex flex-col items-center justify-center h-[200px]">
            <Skeleton className="h-4 w-[150px] mb-4" />
            <Skeleton className="h-12 w-[240px] mb-3" />
            <Skeleton className="h-3.5 w-[180px]" />
          </Card>

          {/* Bottom Metrics Skeleton (4 items) */}
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-none p-6">
                <Skeleton className="h-4 w-[100px] mb-4" />
                <Skeleton className="h-8 w-[150px] mb-2" />
                <Skeleton className="h-3.5 w-[130px]" />
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!summary) {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin"
        pageName="System Overview"
        userName={session?.user?.name || ""}
        userEmail={session?.user?.email || ""}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
        onRefresh={fetchDashboardData}
        profilePath="/admin/profile"
      >
        <div className="h-[60vh] flex flex-col items-center justify-center opacity-20">
          <Activity className="h-24 w-24 mb-4" />
          <p className="text-xl font-black uppercase tracking-widest">
            No Data Available
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const revenueIndicator = getChangeIndicator(summary.finance.revenueChange);
  const ordersIndicator = getChangeIndicator(summary.sales.ordersChange);

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin"
      pageName="System Overview"
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Overview" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={fetchDashboardData}
      profilePath="/admin/profile"
    >
      <div className="space-y-6">

        <div className="space-y-1">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            System Overview
          </h1>
        </div>

        <DashboardStats
          summary={summary}
          formatCurrency={formatCurrency}
          revenueIndicator={revenueIndicator}
          ordersIndicator={ordersIndicator}
        />

        <DashboardCharts
          summary={summary}
          formatCurrency={formatCurrency}
        />

        <NetProfitCard
          summary={summary}
          formatCurrency={formatCurrency}
        />

        <DashboardMetrics
          summary={summary}
          formatCurrency={formatCurrency}
        />
      </div>
    </DashboardLayout>
  );
}
