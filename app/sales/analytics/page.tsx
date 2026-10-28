"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3,
  Calendar,
  PieChart as PieChartIcon,
  RefreshCw,
  TrendingUp,
  ShoppingBag,
  Layers,
  ArrowRight,
  GitBranch,
  Activity,
  DollarSign,
  Truck,
  Users,
} from "lucide-react";
import { TradingLineChart } from "@/components/charts/TradingLineChart";
import { DailyBrickBarChart, plainNumberFmtY, plainNumberFmtTooltip } from "@/components/charts/DailyBrickBarChart";
import { CanvasPieChart, CanvasBarChart } from "@/components/inventory/CanvasCharts";
import { SalesVisualization } from "@/components/sales/SalesVisualization";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";
import { FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { useThemeStore } from "@/store/themeStore";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

interface SalesAnalyticsData {
  orders: Array<{ month: string; count: number }>;
  revenue: Array<{ month: string; amount: number }>;
  topProducts: Array<{ name: string; value: number }>;
  dailyOrders: Array<{ date: string; count: number; value: number }>;
}

export default function SalesAnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dateRange, setDateRange] = useState("90");
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [analytics, setAnalytics] = useState<SalesAnalyticsData | null>(null);

  const fetchSalesData = useCallback(async () => {
    try {
      const [sumRes, anaRes] = await Promise.all([
        cachedFetch("/api/sales/summary"),
        cachedFetch("/api/sales/analytics"),
      ]);

      if (sumRes.ok) {
        const sumJson = await sumRes.json();
        setSummary(sumJson);
      }

      if (anaRes.ok) {
        const anaJson = await anaRes.json();
        setAnalytics(anaJson);
      }
    } catch (err) {
      console.error("Error loading sales analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Safe post-hydration cache read for instant 0ms load
    const cachedSummary = getInstantCachedData<SalesSummary>("/api/sales/summary", { allowPreHydration: true });
    const cachedAnalytics = getInstantCachedData<SalesAnalyticsData>("/api/sales/analytics", { allowPreHydration: true });
    if (cachedSummary) setSummary(cachedSummary);
    if (cachedAnalytics) setAnalytics(cachedAnalytics);
    if (cachedSummary && cachedAnalytics) setIsLoading(false);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/sales");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSalesData();
      const handleRevalidated = (e: any) => {
        if (e?.detail?.url?.includes("/api/sales")) {
          fetchSalesData();
        }
      };
      window.addEventListener("aup:revalidated", handleRevalidated);
      return () => window.removeEventListener("aup:revalidated", handleRevalidated);
    }
  }, [status, fetchSalesData]);

  // Transform revenue into TradingLineChart format
  const revenueLineData = useMemo(() => {
    if (analytics?.revenue && analytics.revenue.length > 0) {
      return analytics.revenue.map((r) => ({
        date: r.month,
        value: r.amount,
      }));
    }
    return [];
  }, [analytics]);

  // Transform daily orders into DailyBrickBarChart format
  const dailyBrickData = useMemo(() => {
    if (analytics?.dailyOrders && analytics.dailyOrders.length > 0) {
      return analytics.dailyOrders.map((d) => ({
        date: d.date,
        value: d.count,
        secondaryValue: d.value,
      }));
    }
    return [];
  }, [analytics]);

  // Transform top products for CanvasPieChart
  const productDistribution = useMemo(() => {
    if (analytics?.topProducts && analytics.topProducts.length > 0) {
      return analytics.topProducts.map((p) => ({
        name: p.name,
        value: p.value,
      }));
    }
    return [];
  }, [analytics]);

  // Order volume monthly bars
  const monthlyOrdersBarData = useMemo(() => {
    if (analytics?.orders && analytics.orders.length > 0) {
      return analytics.orders.map((o) => ({
        label: o.month,
        value: o.count,
      }));
    }
    return [];
  }, [analytics]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val || 0);

  const formatTrend = (val?: number) => {
    if (val === undefined || val === null) return undefined;
    if (val === 0) return "Flat vs last 30d";
    return val > 0 ? `+${val}% MoM growth` : `${val}% MoM drop`;
  };

  const quotesCount = summary?.totalQuotations || 0;
  const ordersCount = summary?.totalOrders || 0;
  const convRate = quotesCount > 0 ? Math.min(100, Math.round((ordersCount / quotesCount) * 100)) : (ordersCount > 0 ? 100 : 0);
  const avgOrderVal = ordersCount > 0 && summary?.totalRevenue ? Math.round(summary.totalRevenue / ordersCount) : 0;

  if (status === "loading" || status === "unauthenticated") {
    return <FullPageLoadingSkeleton />;
  }

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Sales Analytics"
      breadcrumbs={[
        { label: "Sales", href: "/sales/dashboard" },
        { label: "Analytics & Telemetry" },
      ]}
      profilePath="/sales/profile"
      userName={session?.user?.name || "Sales Team"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={fetchSalesData}
    >
      <div className="space-y-6 font-mono min-w-0 max-w-full p-4 sm:p-6 lg:p-8">
        {/* ── HEADER TOOLBAR ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Sales Telemetry
              </span>
              <span className="px-2 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Real-Time Q2C Velocity
              </span>
              <span className="px-2 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Continuous Ledger
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-[56px] font-black tracking-tighter text-primary break-words leading-none">
              Sales Analytics
            </h1>
            <p className="text-xs text-muted-foreground">
              Real-time revenue trajectory, order throughput velocity, quote-to-cash conversions, and product allocation metrics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px] h-9 text-xs font-mono rounded-none border-border/40">
                <Calendar className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Range" />
              </SelectTrigger>
              <SelectContent className="font-mono text-xs rounded-none">
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
                <SelectItem value="180">Last 180 Days</SelectItem>
                <SelectItem value="365">Last 365 Days</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchSalesData}
              disabled={isLoading}
              className="h-9 font-mono text-xs uppercase tracking-wider rounded-none gap-2 border-border/40 hover:bg-muted"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>

            <Button
              asChild
              size="sm"
              className="h-9 font-mono text-xs uppercase tracking-wider rounded-none gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/sales/pipeline">
                <GitBranch className="w-3.5 h-3.5" />
                Q2C Pipeline
              </Link>
            </Button>
          </div>
        </div>

        {/* ── 1. KPI STATS GRID ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 chart-animate-in">
          <StatCard
            title="Total Revenue (30d)"
            isLoading={isLoading || !summary}
            value={summary ? formatCurrency(summary.totalRevenue) : null}
            visual={<UsersGraph />}
            subtitle={summary ? formatTrend(summary?.trends?.revenue) : undefined}
          />
          <StatCard
            title="Orders Processed"
            isLoading={isLoading || !summary}
            value={summary ? ordersCount : null}
            visual={<ActivePulse />}
            subtitle={summary ? formatTrend(summary?.trends?.orders) : undefined}
          />
          <StatCard
            title="Avg Order Value (AOV)"
            isLoading={isLoading || !summary}
            value={summary ? formatCurrency(avgOrderVal) : null}
            visual={<UsersGraph />}
            subtitle={summary ? "Per closed order" : undefined}
          />
          <StatCard
            title="Q2C Win Rate"
            isLoading={isLoading || !summary}
            value={summary ? `${convRate}%` : null}
            visual={<InactiveOrbit />}
            subtitle={summary ? `${quotesCount} quotes generated` : undefined}
          />
        </div>

        {/* ── 2. REVENUE VELOCITY TRADING LINE CANVAS ── */}
        <div className="chart-animate-in chart-delay-1 chart-shimmer-border">
          <Card className="border border-border/40 shadow-none rounded-none overflow-hidden bg-background">
            <CardHeader className="p-4 sm:p-5 border-b border-border/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold tracking-tight uppercase flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  Revenue Run-Rate Velocity & Trajectory
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  High-frequency trading-grade timeline with animated bezier curve and glowing frontier beacon dot.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                  Continuous Stream
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-4">
              <TradingLineChart
                data={revenueLineData}
                valueKey="value"
                dateKey="date"
                title="Revenue Velocity"
                metricLabel="Net Invoiced"
                currencyPrefix="₹"
                height={340}
                colorTheme="emerald"
                showToolbar={true}
                initialDays={Number(dateRange) || 90}
                isDark={isDark}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── 3. TWO COLUMN: DAILY BRICKS & PRODUCT ALLOCATION ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily Brick Bar Chart */}
          <div className="order-2 lg:col-span-2 chart-animate-in chart-delay-2 chart-shimmer-border">
            <Card className="border border-border/40 shadow-none rounded-none overflow-hidden bg-background h-full flex flex-col justify-between">
              <CardHeader className="p-4 sm:p-5 border-b border-border/40 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight uppercase flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Daily Order Throughput & Stack Velocity
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quantized daily transactional volume bricks with staggered column rise.
                  </p>
                </div>
                <span className="px-2 py-0.5 text-[10px] uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Daily Bricks
                </span>
              </CardHeader>
              <CardContent className="p-0 sm:p-4 flex-1">
                <DailyBrickBarChart
                  data={dailyBrickData}
                  dateKey="date"
                  valueKey="value"
                  height={320}
                  colorTheme="emerald"
                  metricLabel="Orders"
                  unit="number"
                  yAxisFormatter={plainNumberFmtY}
                  tooltipValueFormatter={plainNumberFmtTooltip}
                  showToolbar={true}
                  initialDays={Number(dateRange) || 90}
                  isDark={isDark}
                />
              </CardContent>
            </Card>
          </div>

          {/* Top Selling Products / Category Radial Pie */}
          <div className="order-1 lg:col-span-1 chart-animate-in chart-delay-3 chart-shimmer-border">
            <Card className="border border-border/40 shadow-none rounded-none overflow-hidden bg-background h-full flex flex-col justify-between">
              <CardHeader className="p-4 sm:p-5 border-b border-border/40 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight uppercase flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-blue-400" />
                    Top Products Distribution
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Radial sweep donut allocation by quantity sold.
                  </p>
                </div>
                <span className="px-2 py-0.5 text-[10px] uppercase font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Volume Share
                </span>
              </CardHeader>
              <CardContent className="p-4 flex flex-col items-center justify-center flex-1">
                <CanvasPieChart
                  data={productDistribution}
                  nameKey="name"
                  valueKey="value"
                  title="TOP ITEMS"
                  showLegend={true}
                  isDark={isDark}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── 4. DEEP-DIVE INTERACTIVE SALES VISUALIZATION STUDIO ── */}
        <div className="chart-animate-in chart-delay-4 chart-shimmer-border">
          <Card className="border border-border/40 shadow-none rounded-none overflow-hidden bg-background">
            <CardHeader className="p-4 sm:p-5 border-b border-border/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold tracking-tight uppercase flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Multi-Dimensional Sales KPI Studio
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Interactive multi-channel switchboard: toggle orders, revenue trajectory, quote-to-order ratio, or status breakdown.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 text-xs font-mono gap-1 border-border/40"
              >
                <Link href="/sales/visualization">
                  Dedicated Studio
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-2 sm:p-4">
              <SalesVisualization
                title="Sales KPI Telemetry"
                availableDataTypes={[
                  { value: "orders_trend", label: "Orders Trend" },
                  { value: "revenue_trend", label: "Revenue Trend" },
                  { value: "quotation_to_order", label: "Quotation → Order Conversion" },
                  { value: "status_breakdown", label: "Order Status Breakdown" },
                ]}
                defaultDataType="orders_trend"
              />
            </CardContent>
          </Card>
        </div>

        {/* ── 5. QUICK ACTIONS & DIRECT NAVIGATION FOOTER ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Link href="/sales/quotes">
            <Card className="p-4 border border-border/40 rounded-none bg-background hover:border-primary/40 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase text-foreground">Quotations Manager</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Prepare & dispatch customer bids</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>
          </Link>

          <Link href="/sales/sales-orders">
            <Card className="p-4 border border-border/40 rounded-none bg-background hover:border-primary/40 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase text-foreground">Active Sales Orders</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Track fulfillment & delivery status</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>
          </Link>

          <Link href="/sales/summary">
            <Card className="p-4 border border-border/40 rounded-none bg-background hover:border-primary/40 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase text-foreground">Executive Summary</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">High-level sales operational dashboard</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
