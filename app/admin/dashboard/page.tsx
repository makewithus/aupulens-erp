"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
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
import { BusinessHealthCard, BusinessHealthCardSkeleton } from "@/components/dashboard/BusinessHealthCard";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useEnabledModules } from "@/components/dashboard/hooks/useEnabledModules";

interface DashboardSummary {
  finance: {
    totalRevenue: number;
    revenueCurrentMonth: number;
    revenueChange: number;
    totalExpenses: number;
    expensesCurrentMonth: number;
    netIncome: number | null;
    profitAvailable: boolean;
    profitUnavailableReason: string | null;
    profitNote: string | null;
    totalPayments: number;
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
  // Keep server output and the browser's first render identical. Cached data is
  // applied in the hydration effect below, before the network request settles.
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [businessHealth, setBusinessHealth] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { enabledModules, loaded: enabledModulesLoaded } = useEnabledModules(session?.user?.role === "admin");
  const visibleModules = enabledModulesLoaded
    ? Array.from(new Set([...(enabledModules ?? []), "admin", "manufacturing", "crm", "sales", "inventory", "finance", "hr"]))
    : ["admin", "manufacturing", "crm", "sales", "inventory", "finance", "hr"];

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/admin");
    } else if (status === "authenticated") {
      if (
        session?.user?.role !== "admin" &&
        session?.user?.role !== "master-admin"
      ) {
        router.replace("/auth/admin");
      } else {
        // Always read the latest tenant-scoped DB snapshot when the dashboard
        // opens. The regular dashboard payload is cached for other callers.
        fetchDashboardData(true);
      }
    }
  }, [status, session, router]);

  const fetchDashboardData = async (forceRefresh = false) => {
    try {
      const url = forceRefresh ? "/api/admin/dashboard?fresh=true" : "/api/admin/dashboard";
      const res = await cachedFetch(url, { cache: forceRefresh ? "no-store" : "default" }, { force: forceRefresh });
      if (res.status === 401 || res.status === 403) {
        router.replace("/auth/admin");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setSummary(data.summary);
          setBusinessHealth(data.businessHealth ?? null);
        }
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

  // Confirmed authenticated admin? Until we know, show a NEUTRAL splash — never
  // the dashboard chrome. This kills the "flash of dashboard then redirect to
  // login" for broken/expired sessions: they see the splash, then login.
  const isAuthorizedAdmin =
    status === "authenticated" &&
    (session?.user?.role === "admin" || session?.user?.role === "master-admin");

  if (status === "loading") return <AuthSplash />;
  if (!isAuthorizedAdmin) return <AuthSplash message="Redirecting to sign in…" />;

  // Authenticated admin from here — only show skeleton on first cold load when no data exists yet.
  if (isLoading && !summary) {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin"
        pageName="System Overview"
        userName={session?.user?.name || "Admin"}
        userEmail={session?.user?.email}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: "/auth" })}
        onRefresh={() => fetchDashboardData(true)}
        profilePath="/admin/profile"
      >
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div className="space-y-1">
            <Skeleton className="h-[48px] w-[300px] md:h-[56px] md:w-[450px]" />
          </div>

          {/* AI Business Health Skeleton */}
          <BusinessHealthCardSkeleton />

          {/* Stats Cards Skeleton (6 items) */}
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-none">
                <CardContent className="p-8">
                  <div className="space-y-4">
                    <Skeleton className="h-3 w-[100px]" />
                    <Skeleton className="h-14 w-[160px]" />
                    <Skeleton className="h-4 w-[140px]" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Skeleton (3 items) */}
          <div className="grid grid-cols-1 gap-1 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-0 bg-transparent p-6 h-[380px] flex flex-col justify-between shadow-none">
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
        onSignOut={() => signOut({ callbackUrl: "/auth" })}
        onRefresh={() => fetchDashboardData(true)}
        profilePath="/admin/profile"
      >
        <div className="h-[60vh] flex flex-col items-center justify-center opacity-20">
          <Activity className="h-24 w-24 mb-4" />
          <p className="text-xl font-black uppercase tracking-widest">
            Dashboard could not be loaded. Use refresh to retry.
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
      userName={session?.user?.name || "Admin"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={() => fetchDashboardData(true)}
      profilePath="/admin/profile"
    >
      <div className="mx-auto w-full max-w-[1800px] min-w-0 space-y-4 sm:space-y-6">

        <div className="space-y-1">
          <h1 className="break-words text-3xl font-black tracking-tighter text-primary sm:text-4xl md:text-[56px]">
            System Overview
          </h1>
        </div>

        {businessHealth && <BusinessHealthCard data={businessHealth} />}

        <DashboardStats
          summary={summary}
          formatCurrency={formatCurrency}
          revenueIndicator={revenueIndicator}
          ordersIndicator={ordersIndicator}
          enabledModules={visibleModules}
        />

        <DashboardCharts
          summary={summary}
          formatCurrency={formatCurrency}
          enabledModules={visibleModules}
        />

        {visibleModules.includes("finance") && (
          <NetProfitCard
            summary={summary}
            formatCurrency={formatCurrency}
          />
        )}

        <DashboardMetrics
          summary={summary}
          formatCurrency={formatCurrency}
          enabledModules={visibleModules}
        />
      </div>
    </DashboardLayout>
  );
}
