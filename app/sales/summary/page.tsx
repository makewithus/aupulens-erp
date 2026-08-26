"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Truck,
  Users,
  PlusCircle,
  Activity,
  ArrowRight,
} from "lucide-react";
import { StatsRowSkeleton, FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { SalesVisualization } from "@/components/sales/SalesVisualization";
import { useToast } from "@/components/ui/toast";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";

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
      const res = await cachedFetch("/api/sales/summary");
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
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Good{" "}
              {new Date().getHours() < 12
                ? "Morning"
                : new Date().getHours() < 18
                  ? "Afternoon"
                  : "Evening"}
              , {session?.user?.name?.split(" ")[0] || "Team"}
            </h1>
            <p className="text-muted-foreground text-sm">
              Here is your sales performance overview for{" "}
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              .
            </p>
          </div>
          <Button
            onClick={fetchSummary}
            className="none-xl h-11 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[12px] uppercase tracking-wider rounded-none cursor-pointer"
          >
            <Activity className="w-4 h-4 mr-2" />
            Refresh Data
          </Button>
        </div>

        {error && (
          <div className="p-4 font-mono text-[11px] uppercase tracking-wider text-destructive bg-destructive/10 border border-destructive/20">
            {error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
          <StatCard
            title="Total Revenue (30d)"
            value={`₹${summary?.totalRevenue?.toLocaleString("en-IN") ?? 0}`}
            visual={<UsersGraph />}
            subtitle={formatTrend(summary?.trends?.revenue)}
          />
          <StatCard
            title="Orders (30d)"
            value={summary?.totalOrders ?? 0}
            visual={<ActivePulse />}
            subtitle={formatTrend(summary?.trends?.orders)}
          />
          <StatCard
            title="Quotations (30d)"
            value={summary?.totalQuotations ?? 0}
            visual={<UsersGraph />}
            subtitle={formatTrend(summary?.trends?.quotations)}
          />
          <StatCard
            title="Deliveries Pending"
            value={summary?.deliveriesPending ?? 0}
            visual={<InactiveOrbit />}
          />
        </div>

        <div className="space-y-1">
          {/* Quick Actions Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
            {[
              { title: "Create Quotation", description: "Draft a new proposal", icon: PlusCircle, href: "/sales/quotations" },
              { title: "New Customer", description: "Register a new client", icon: Users, href: "/sales/customers" },
              { title: "Process Delivery", description: "Manage logistics", icon: Truck, href: "/sales/delivery-challans" },
            ].map((action) => (
              <Link key={action.title} href={action.href}>
                <Card className="group overflow-hidden border border-border/40 shadow-none rounded-none bg-background p-6 h-full transition-all duration-300 hover:border-primary/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <action.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{action.title}</p>
                        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/50 mt-0.5">{action.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Main Chart Section */}
          <Card className="border border-border/40 shadow-none rounded-none overflow-hidden">
            <div className="p-1">
              <SalesVisualization
                title="Sales Performance Overview"
                availableDataTypes={[
                  { value: "orders_trend", label: "Orders Trend" },
                  { value: "revenue_trend", label: "Revenue Trend" },
                  {
                    value: "quotation_to_order",
                    label: "Orders vs Quotations",
                  },
                  {
                    value: "status_breakdown",
                    label: "Order Status Breakdown",
                  },
                ]}
                defaultDataType="orders_trend"
              />
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
