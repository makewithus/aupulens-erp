"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  ClipboardList,
  DollarSign,
  Truck,
  Users,
  PlusCircle,
  Activity,
} from "lucide-react";
import { StatsRowSkeleton, FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { SalesVisualization } from "@/components/sales/SalesVisualization";
import { useToast } from "@/components/ui/toast";
import { StatCard } from "@/components/dashboard/summary/StatCard";
import { QuickActionCard } from "@/components/dashboard/summary/QuickActionCard";

interface SalesSummary {
  totalOrders: number;
  totalQuotations: number;
  totalRevenue: number;
  deliveriesPending: number;
  trends?: {
    revenue: number;
    orders: number;
    quotations: number;
  };
}

export default function SalesSummaryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchSummary = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/sales/summary");
      if (!res.ok) throw new Error("Failed to load summary");
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load sales summary");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/sales");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSummary();
    }
  }, [status, fetchSummary]);

  const formatTrend = (val?: number) => {
    if (val === undefined || val === null) return undefined;
    if (val === 0) return "No change";
    return val > 0 ? `+${val}% last 30d` : `${val}% last 30d`;
  };

  if (status === "loading" || status === "unauthenticated") {
    return <FullPageLoadingSkeleton />;
  }

  if (isLoading) {
    return (
      <DashboardLayout
        sidebarSections={salesSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Sales Dashboard"
        pageName="Overview"
        breadcrumbs={[
          { label: "Sales", href: "/sales/summary" },
          { label: "Overview" },
        ]}
        userName={session?.user?.name || "User"}
        userEmail={session?.user?.email || ""}
        userRole={session?.user?.role || "sales"}
        onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-96 bg-muted animate-pulse rounded" />
          </div>
          <StatsRowSkeleton count={4} />
          <div className="h-96 w-full bg-muted animate-pulse rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales Dashboard"
      pageName="Dashboard Overview"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Overview" },
      ]}
      profilePath="/sales/profile"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
      onRefresh={fetchSummary}
    >
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              Good{" "}
              {new Date().getHours() < 12
                ? "Morning"
                : new Date().getHours() < 18
                  ? "Afternoon"
                  : "Evening"}
              , {session?.user?.name?.split(" ")[0] || "Team"}
            </h1>
            <p className="text-muted-foreground mt-1">
              Here is your sales performance overview for{" "}
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              .
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              className="shadow-lg shadow-blue-500/20"
              onClick={fetchSummary}
            >
              <Activity className="w-4 h-4 mr-2" />
              Refresh Data
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20 animate-pulse">
            {error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Revenue (30d)"
            value={`₹${summary?.totalRevenue?.toLocaleString() ?? 0}`}
            icon={DollarSign}
            color="text-emerald-500 bg-emerald-500"
            trend={formatTrend(summary?.trends?.revenue)}
          />
          <StatCard
            title="Orders (30d)"
            value={summary?.totalOrders ?? 0}
            icon={Package}
            color="text-blue-500 bg-blue-500"
            trend={formatTrend(summary?.trends?.orders)}
          />
          <StatCard
            title="Quotations (30d)"
            value={summary?.totalQuotations ?? 0}
            icon={ClipboardList}
            color="text-amber-500 bg-amber-500"
            trend={formatTrend(summary?.trends?.quotations)}
          />
          <StatCard
            title="Deliveries Pending"
            value={summary?.deliveriesPending ?? 0}
            icon={Truck}
            color="text-purple-500 bg-purple-500"
            trend={undefined} // No trend for snapshot data
          />
        </div>

        <div className="space-y-6">
          {/* Quick Actions Row */}
          <div className="grid md:grid-cols-3 gap-6">
            <QuickActionCard
              title="Create Quotation"
              description="Draft a new proposal"
              icon={PlusCircle}
              href="/sales/quotations"
              color="bg-blue-500 text-blue-500"
            />
            <QuickActionCard
              title="New Customer"
              description="Register a new client"
              icon={Users}
              href="/sales/customers"
              color="bg-emerald-500 text-emerald-500"
            />
            <QuickActionCard
              title="Process Delivery"
              description="Manage logistics"
              icon={Truck}
              href="/sales/delivery-challans" // Assuming this page exists
              color="bg-purple-500 text-purple-500"
            />
          </div>

          {/* Main Chart Section */}
          <Card className="border-none shadow-md overflow-hidden">
            <div className="p-1">
              <SalesVisualization
                title="Sales Performance Overview"
                availableDataTypes={[
                  {
                    value: "orders_vs_quotations",
                    label: "Orders vs Quotations",
                  },
                  { value: "revenue_trend", label: "Revenue Trend" },
                  {
                    value: "product_performance",
                    label: "Product Performance",
                  },
                  {
                    value: "status_breakdown",
                    label: "Order Status Breakdown",
                  },
                ]}
                defaultDataType="orders_vs_quotations"
              />
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
