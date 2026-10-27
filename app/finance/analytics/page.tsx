"use client";

import { useEffect, useState, useCallback } from "react";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Calendar,
  PieChart as PieChartIcon,
  RefreshCw,
  TrendingUp,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { TradingLineChart } from "@/components/charts/TradingLineChart";
import { DailyBrickBarChart } from "@/components/charts/DailyBrickBarChart";
import { CanvasPieChart } from "@/components/inventory/CanvasCharts";
import { useThemeStore } from "@/store/themeStore";
import { BRAND_ACCENT_PALETTE } from "@/lib/constants/brandColors";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function FinanceAnalyticsPage() {
  const { data: session } = useSession();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await cachedFetch("/api/finance/summary");
      if (res.ok) {
        const json = await res.json();
        if (json?.summary) {
          setData(json.summary);
        }
      }
    } catch (err) {
      console.error("Error fetching finance analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const cachedSummary = getInstantCachedData<any>("/api/finance/summary", { allowPreHydration: true });
    if (cachedSummary?.summary) {
      setData(cachedSummary.summary);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    const handleRevalidated = (e: any) => {
      if (e?.detail?.url?.includes("/api/finance")) {
        fetchAnalytics();
      }
    };
    window.addEventListener("aup:revalidated", handleRevalidated);
    return () => window.removeEventListener("aup:revalidated", handleRevalidated);
  }, [fetchAnalytics]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val || 0);

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      dashboardTitle="Finance"
      pageName="Financial Analytics"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Analytics & Visualizations" },
      ]}
      userName={session?.user?.name || "Finance Admin"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={fetchAnalytics}
      profilePath="/finance/profile"
    >
      <div className="space-y-6 font-mono min-w-0 max-w-full p-4 sm:p-6 lg:p-8">
        {/* Header Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Visual Analytics
              </span>
              <span className="px-2 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                2-Year Historical Run-Rate
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-[56px] font-black tracking-tighter text-primary break-words leading-none">
              Financial Analytics
            </h1>
            <p className="text-xs text-muted-foreground">
              Deep continuous ledger velocity, periodic brick distribution, and capital allocation visualizations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="text-xs font-mono h-9 gap-1.5 border-border/60"
            >
              <Link href="/finance/summary">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Dashboard
              </Link>
            </Button>
            <Button
              onClick={fetchAnalytics}
              variant="outline"
              size="sm"
              className="text-xs font-mono h-9 gap-1.5 border-border/60 px-3"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* 1. 2-Year Consolidated Financial Velocity & Cash Runway */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <h2 className="text-base sm:text-lg font-bold tracking-tight uppercase">
                  Consolidated Financial Velocity & Runway (2-Year Interactive Timeline)
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Interactive historical timeline with mouse-wheel zoom, drag-to-pan, and timeframe presets.
              </p>
            </div>
          </div>

          <Card
            className={cn(
              "chart-animate-in chart-delay-1 chart-shimmer-border rounded-none border shadow-none overflow-hidden transition-colors",
              isDark ? "bg-[#0A0A0A] border-[#272727]" : "bg-white border-[#e5e5e5]"
            )}
          >
            <CardContent className="p-0">
              <TradingLineChart
                title="CONSOLIDATED FINANCIAL RUN-RATE & CASH VELOCITY (2-YEAR TIMELINE)"
                metricLabel="Financial Inflow"
                currencyPrefix="₹"
                colorTheme="emerald"
                isDark={isDark}
                height={420}
                data={data?.revenueTimeline}
                valueKey="value"
                dateKey="date"
              />
            </CardContent>
          </Card>
        </div>

        {/* 2. Monthly Revenue Velocity & Operating Expense Allocation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Monthly Velocity (Discrete Segmented Bricks) */}
          <div className="lg:col-span-7 xl:col-span-8">
            <Card
              className={cn(
                "chart-animate-in chart-delay-2 chart-shimmer-border rounded-none border shadow-sm transition-colors h-full flex flex-col",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
              )}
            >
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-emerald-400" />
                      <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Monthly Revenue Velocity & Ledger Throughput
                      </CardTitle>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Solid bars visualizing periodic billing intake and cash realization.
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    Monthly Vol
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 flex-1">
                <DailyBrickBarChart
                  metricLabel="Monthly Net Revenue"
                  valueKey="value"
                  dateKey="date"
                  colorTheme="emerald"
                  isDark={isDark}
                  height={320}
                  data={data?.monthlyPerformance}
                  yAxisFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  tooltipValueFormatter={(v) => formatCurrency(v)}
                />
              </CardContent>
            </Card>
          </div>

          {/* Operating Expense Breakdown (Donut Chart) */}
          <div className="lg:col-span-5 xl:col-span-4">
            <Card
              className={cn(
                "chart-animate-in chart-delay-3 chart-shimmer-border rounded-none border shadow-sm transition-colors flex flex-col h-full",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
              )}
            >
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <PieChartIcon className="h-4 w-4 text-purple-400" />
                      <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Operating Expense Allocation
                      </CardTitle>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Capital allocation across posted accounts & overheads.
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                    OpEx Share
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col justify-center items-center min-h-[320px]">
                {data?.expenseBreakdown && data.expenseBreakdown.length > 0 ? (
                  <CanvasPieChart
                    data={data.expenseBreakdown}
                    nameKey="name"
                    valueKey="value"
                    colors={BRAND_ACCENT_PALETTE}
                    isDark={isDark}
                    pageSize={5}
                    title="TOTAL OPEX"
                  />
                ) : (
                  <div className="text-center py-12 text-xs text-muted-foreground">
                    No posted expense accounts found for current period
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
