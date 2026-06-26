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
import { StatsRowSkeleton } from "@/components/ui/loading-skeletons";
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
          <StatsRowSkeleton count={6} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="none-4xl border-2 h-[400px]" />
            <Card className="none-4xl border-2 h-[400px]" />
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

        {/* <DashboardStats
          summary={summary}
          formatCurrency={formatCurrency}
          revenueIndicator={revenueIndicator}
          ordersIndicator={ordersIndicator}
        />

        <NetProfitCard
          summary={summary}
          formatCurrency={formatCurrency}
        />

        <DashboardCharts
          summary={summary}
          formatCurrency={formatCurrency}
        />

        <DashboardMetrics
          summary={summary}
          formatCurrency={formatCurrency}
        /> */}
      </div>
    </DashboardLayout>
  );
}
