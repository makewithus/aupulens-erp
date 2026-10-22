"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  FileText,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Users,
  Layers,
  ArrowUpRight,
  BarChart3,
  GitBranch,
} from "lucide-react";
import { TradingLineChart } from "@/components/charts/TradingLineChart";
import { DailyBrickBarChart } from "@/components/charts/DailyBrickBarChart";
import { CanvasPieChart } from "@/components/inventory/CanvasCharts";
import { useThemeStore } from "@/store/themeStore";
import { BRAND_COLORS, BRAND_ACCENT_PALETTE } from "@/lib/constants/brandColors";
import { cn } from "@/lib/utils";

export default function SalesDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [isLoading, setIsLoading] = useState(false);

  // Sales-specific parameters & KPIs
  const salesKPIs = {
    netRevenue: 28450000,
    revenueGrowthMoM: 14.2,
    openPipelineValue: 42800000,
    openQuotesCount: 48,
    averageOrderValue: 185400,
    aovChange: 6.8,
    q2cConversionRate: 68.4,
    activeSubscriptionsARR: 12400000,
    activeTenants: 142,
  };

  const channelDistribution = [
    { name: "Direct Enterprise", value: 12500000 },
    { name: "Partner & VAR Network", value: 7800000 },
    { name: "Online & Self-Serve", value: 5400000 },
    { name: "Inbound Expansion", value: 2750000 },
  ];

  const recentOrders = [
    {
      id: "SO-2026-881",
      customer: "Reliance Petrochem Ltd",
      amount: 1450000,
      stage: "Accepted",
      date: "Today, 14:30",
      status: "In Production",
    },
    {
      id: "SO-2026-880",
      customer: "Tata Advanced Systems",
      amount: 2850000,
      stage: "Invoiced",
      date: "Today, 11:15",
      status: "Dispatched",
    },
    {
      id: "SO-2026-879",
      customer: "Larsen & Toubro Heavy",
      amount: 4120000,
      stage: "Paid",
      date: "Yesterday",
      status: "Completed",
    },
    {
      id: "SO-2026-878",
      customer: "Adani Solar Energy",
      amount: 980000,
      stage: "Sent",
      date: "20 Oct 2026",
      status: "Pending PO",
    },
    {
      id: "SO-2026-877",
      customer: "Mahindra Logistics Hub",
      amount: 1640000,
      stage: "Paid",
      date: "19 Oct 2026",
      status: "Completed",
    },
  ];

  const q2cPipelineStages = [
    { name: "Draft Quotations", count: 18, value: "₹8.4M", percent: 85, color: BRAND_COLORS.accent.blue },
    { name: "Sent & Negotiating", count: 24, value: "₹18.2M", percent: 68, color: BRAND_COLORS.accent.purple },
    { name: "Accepted Sales Orders", count: 32, value: "₹24.8M", percent: 75, color: BRAND_COLORS.accent.yellow },
    { name: "Invoiced & Dispatched", count: 41, value: "₹31.5M", percent: 92, color: BRAND_COLORS.accent.green },
  ];

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales Executive Dashboard"
      pageName="Sales Dashboard"
      breadcrumbs={[{ label: "Sales", href: "/sales/dashboard" }, { label: "Executive Dashboard" }]}
      userName={session?.user?.name || "Executive"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "sales"}
      onSignOut={() => signOut({ callbackUrl: "/auth/sales" })}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 min-w-0 max-w-full font-mono">
        {/* Header with KPI Title & Quick Action Buttons */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20">
                Revenue Intelligence
              </span>
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Quote-To-Cash (Q2C)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
              Sales Operational Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Live enterprise telemetry tracking sales bookings, pipeline conversion velocity, and customer billing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="text-xs font-mono h-9 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
            >
              <Link href="/sales/quotes">
                <Plus className="w-3.5 h-3.5" />
                New Quotation
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(
                "text-xs font-mono h-9 gap-1.5 border shadow-sm",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white border-slate-300 text-slate-800"
              )}
            >
              <Link href="/sales/orders">
                <ShoppingCart className="w-3.5 h-3.5 text-blue-400" />
                View Orders
              </Link>
            </Button>
          </div>
        </div>

        {/* ── 1. MODULE-SPECIFIC PARAMETERS: 4 CORE KPI STAT CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Net Sales Bookings */}
          <Card
            className={cn(
              "rounded-none border shadow-xs transition-colors p-5 relative overflow-hidden",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Net Sales Revenue (MTD)
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: BRAND_COLORS.accent.green }}
              />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2">
              ₹{(salesKPIs.netRevenue / 10000000).toFixed(2)} Cr
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="flex items-center gap-1 font-bold text-emerald-500">
                <TrendingUp className="w-3.5 h-3.5" />
                +{salesKPIs.revenueGrowthMoM}%
              </span>
              <span className="text-[11px] text-muted-foreground">vs previous month</span>
            </div>
          </Card>

          {/* Active Q2C Pipeline Value */}
          <Card
            className={cn(
              "rounded-none border shadow-xs transition-colors p-5 relative overflow-hidden",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Active Q2C Pipeline
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: BRAND_COLORS.accent.purple }}
              />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2 text-purple-500">
              ₹{(salesKPIs.openPipelineValue / 10000000).toFixed(2)} Cr
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="font-semibold text-muted-foreground">
                {salesKPIs.openQuotesCount} active quotations pending
              </span>
            </div>
          </Card>

          {/* Average Order Value (AOV) */}
          <Card
            className={cn(
              "rounded-none border shadow-xs transition-colors p-5 relative overflow-hidden",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Average Order Value (AOV)
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: BRAND_COLORS.accent.blue }}
              />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2">
              ₹{salesKPIs.averageOrderValue.toLocaleString("en-IN")}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="flex items-center gap-1 font-bold text-blue-400">
                <TrendingUp className="w-3.5 h-3.5" />
                +{salesKPIs.aovChange}%
              </span>
              <span className="text-[11px] text-muted-foreground">basket expansion</span>
            </div>
          </Card>

          {/* Quote-to-Cash Win Rate */}
          <Card
            className={cn(
              "rounded-none border shadow-xs transition-colors p-5 relative overflow-hidden",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Q2C Conversion Rate
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: BRAND_COLORS.accent.yellow }}
              />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2 text-yellow-500">
              {salesKPIs.q2cConversionRate}%
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="font-semibold text-emerald-500">Industry Leader</span>
              <span className="text-[11px] text-muted-foreground">top decile</span>
            </div>
          </Card>
        </div>

        {/* ── 2. INTERACTIVE TIMELINE & CHARTS SECTION ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-l-4 border-purple-500 pl-3">
            <div>
              <h2 className="text-base font-bold tracking-wide uppercase flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-500" />
                Sales Velocity &amp; Revenue Timeline
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Interactive historical timeline with mouse-wheel zoom, drag-to-pan, and timeframe filters.
              </p>
            </div>
          </div>

          <Card
            className={cn(
              "rounded-none border shadow-none overflow-hidden transition-colors",
              isDark ? "bg-[#0A0A0A] border-[#272727]" : "bg-white border-[#e5e5e5]"
            )}
          >
            <CardContent className="p-0">
              <TradingLineChart
                title="CONSOLIDATED SALES REVENUE (2-YEAR TIMELINE)"
                metricLabel="Gross Sales"
                currencyPrefix="₹"
                colorTheme="white"
                isDark={isDark}
                height={420}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── 3. TWO-COLUMN: CHANNEL DISTRIBUTION & DAILY ORDER UNITS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Sales Order Units (Segmented Bricks) */}
          <Card
            className={cn(
              "rounded-none border shadow-sm transition-colors",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <CardHeader className="pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Daily Order Throughput (Discrete Segmented Bricks)
                </CardTitle>
                <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Daily Units
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <DailyBrickBarChart
                metricLabel="Sales Order Units"
                valueKey="value"
                colorTheme="purple"
                isDark={isDark}
                yAxisFormatter={(v) => `${v} units`}
                tooltipValueFormatter={(v) => `${v.toLocaleString()} units`}
                height={280}
              />
            </CardContent>
          </Card>

          {/* Revenue by Channel / Product Line (Donut Chart) */}
          <Card
            className={cn(
              "rounded-none border shadow-sm transition-colors flex flex-col",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <CardHeader className="pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Revenue Breakdown by Channel
                </CardTitle>
                <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  Channel Share
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex-1 h-[280px]">
              <CanvasPieChart
                data={channelDistribution}
                nameKey="name"
                valueKey="value"
                colors={BRAND_ACCENT_PALETTE}
                isDark={isDark}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── 4. PIPELINE STAGE CONVERSION FUNNEL & RECENT ORDERS TABLE ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Q2C Pipeline Funnel */}
          <Card
            className={cn(
              "rounded-none border shadow-sm transition-colors p-5 lg:col-span-1",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                Q2C Pipeline Progression
              </h3>
              <GitBranch className="w-3.5 h-3.5 text-purple-400" />
            </div>

            <div className="space-y-4">
              {q2cPipelineStages.map((stg) => (
                <div key={stg.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-muted-foreground">{stg.name}</span>
                    <span className="font-bold">{stg.value}</span>
                  </div>
                  <div className="w-full h-2 bg-muted/40 rounded-none overflow-hidden">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${stg.percent}%`,
                        backgroundColor: stg.color,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{stg.count} Active Orders</span>
                    <span>{stg.percent}% conversion</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent High-Value Sales Orders Table */}
          <Card
            className={cn(
              "rounded-none border shadow-sm transition-colors p-5 lg:col-span-2 flex flex-col justify-between",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    Recent Enterprise Sales Orders
                  </h3>
                  <span className={cn(
                    "px-2 py-0.5 text-[10px] font-semibold border",
                    isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-300"
                  )}>
                    Live Feed
                  </span>
                </div>
                <Link
                  href="/sales/orders"
                  className={cn(
                    "text-xs flex items-center gap-1 font-semibold transition-colors self-start sm:self-auto",
                    isDark ? "text-[#A77DFF] hover:text-[#C4B5FD]" : "text-purple-700 hover:text-purple-900"
                  )}
                >
                  View All Orders <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[580px] text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground text-[10px] uppercase">
                      <th className="py-2.5 font-bold whitespace-nowrap pr-4">Order ID</th>
                      <th className="py-2.5 font-bold whitespace-nowrap pr-4">Enterprise Client</th>
                      <th className="py-2.5 font-bold whitespace-nowrap pr-4">Amount</th>
                      <th className="py-2.5 font-bold whitespace-nowrap pr-4">Stage</th>
                      <th className="py-2.5 font-bold whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {recentOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-muted/30 transition-colors">
                        <td className={cn("py-3 font-semibold whitespace-nowrap pr-4", isDark ? "text-[#A77DFF]" : "text-purple-700 font-bold")}>
                          {ord.id}
                        </td>
                        <td className="py-3 font-medium whitespace-nowrap pr-4 text-foreground">{ord.customer}</td>
                        <td className="py-3 font-bold whitespace-nowrap pr-4 text-foreground">₹{ord.amount.toLocaleString("en-IN")}</td>
                        <td className="py-3 whitespace-nowrap pr-4">
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[10px] border font-bold uppercase",
                              ord.stage === "Paid"
                                ? isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-300"
                                : ord.stage === "Invoiced"
                                ? isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "bg-blue-50 text-blue-700 border-blue-300"
                                : ord.stage === "Accepted"
                                ? isDark ? "bg-purple-500/10 text-purple-400 border-purple-500/30" : "bg-purple-50 text-purple-700 border-purple-300"
                                : isDark ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-amber-50 text-amber-800 border-amber-300"
                            )}
                          >
                            {ord.stage}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground whitespace-nowrap">{ord.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-4 border-t border-border/40 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs text-muted-foreground">
              <span>Showing 5 most recent commercial orders</span>
              <span className="font-semibold text-foreground">Next scheduled billing batch: 24h</span>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
