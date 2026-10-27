"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";
import {
  CanvasBarChart,
  CanvasPieChart,
  CanvasComposedChart,
} from "@/components/inventory/CanvasCharts";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  Users,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Calendar,
  Layers,
  Filter,
  CheckCircle2,
  Clock,
  Briefcase,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  RefreshCw,
} from "lucide-react";

function AnalyticsPageSkeleton() {
  return (
    <div className="w-full space-y-6 min-w-0 max-w-full pb-10 animate-pulse font-sans">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
        <div className="space-y-2 flex-1">
          <div className="h-5 w-48 bg-muted/40 rounded-md" />
          <div className="h-10 w-96 bg-muted/60 rounded-lg" />
          <div className="h-4 w-72 bg-muted/30 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-muted/40 rounded-lg" />
          <div className="h-9 w-28 bg-muted/40 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-border/60 bg-muted/20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 h-96 rounded-xl border border-border/60 bg-muted/20" />
        <div className="lg:col-span-7 h-96 rounded-xl border border-border/60 bg-muted/20" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 h-96 rounded-xl border border-border/60 bg-muted/20" />
        <div className="lg:col-span-4 h-96 rounded-xl border border-border/60 bg-muted/20" />
        <div className="lg:col-span-4 h-96 rounded-xl border border-border/60 bg-muted/20" />
      </div>
    </div>
  );
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val || 0);
}

export default function CrmAnalyticsPage() {
  const [timeRange, setTimeRange] = useState<string>("30d");
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (fresh: boolean = false) => {
    try {
      if (fresh) setIsRefreshing(true);
      const url = `/api/crm/analytics?range=${timeRange}${fresh ? "&fresh=true" : ""}`;
      const res = await cachedFetch(url, {
        cache: fresh ? "no-store" : "default",
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (fresh) toast.success("Live CRM database synchronized");
      }
    } catch (e) {
      console.error("Failed to fetch fresh CRM analytics:", e);
      if (fresh) toast.error("Failed to sync live CRM data");
    } finally {
      setIsLoading(false);
      if (fresh) setIsRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    const cached = getInstantCachedData<any>(`/api/crm/analytics?range=${timeRange}`, { allowPreHydration: true });
    if (cached) {
      setData(cached);
      setIsLoading(false);
    }
    loadData(false);
    const handleRevalidated = (e: any) => {
      if (e?.detail?.url?.includes("/api/crm")) {
        loadData(false);
      }
    };
    window.addEventListener("aup:revalidated", handleRevalidated);
    return () => window.removeEventListener("aup:revalidated", handleRevalidated);
  }, [loadData, timeRange]);

  const summary = data?.summary || {
    totalPipelineValue: 0,
    activeDeals: 0,
    wonDeals: 0,
    lostDeals: 0,
    winRate: 0,
    avgSalesCycleDays: 0,
    avgDealSize: 0,
    projectedArr: 0,
    totalAccounts: 0,
    totalLeads: 0,
  };
  const funnel = data?.funnel || [];
  const monthlyVelocity = data?.monthlyVelocity || [];
  const leadSources = data?.leadSources || [];
  const stageAgingDays = data?.stageAgingDays || [];
  const repLeaderboard = data?.repLeaderboard || [];
  const churnRetention = data?.churnRetention || {
    netRevenueRetention: 0,
    grossRenewalRate: 0,
    atRiskRevenue: 0,
    healthyAccounts: 0,
    warningAccounts: 0,
    highRiskAccounts: 0,
    criticalRiskAccounts: 0,
  };

  // Composed Chart Data: New Pipeline (Bar) vs Closed Won (Line/Bar)
  const velocityChartData = useMemo(() => {
    return monthlyVelocity.map((v: any) => ({
      name: v.month,
      "New Pipeline": Math.round(v.newPipeline / 100000), // in Lakhs
      "Closed Won": Math.round(v.closedWon / 100000),
      Target: Math.round(v.target / 100000),
    }));
  }, [monthlyVelocity]);

  // Stage Aging Chart Data
  const stageAgingChartData = useMemo(() => {
    return stageAgingDays.map((s: any) => ({
      name: s.stage,
      "Actual Days": s.days,
      "Benchmark Days": s.target,
    }));
  }, [stageAgingDays]);

  const worstBottleneck = useMemo(() => {
    if (!stageAgingDays || stageAgingDays.length === 0) return null;
    const diffs = stageAgingDays.map((s: any) => ({
      stage: s.stage,
      days: s.days || 0,
      target: s.target || 0,
      delta: (s.days || 0) - (s.target || 0),
    }));
    diffs.sort((a: any, b: any) => b.delta - a.delta);
    return diffs[0];
  }, [stageAgingDays]);

  const exportCsv = () => {
    const headers = ["Metric", "Value"];
    const rows = [
      ["Total Pipeline Value", formatCurrency(summary.totalPipelineValue)],
      ["Active Deals", summary.activeDeals],
      ["Closed Won Deals", summary.wonDeals],
      ["Win Rate (%)", `${summary.winRate}%`],
      ["Avg Sales Cycle (Days)", summary.avgSalesCycleDays],
      ["Projected ARR", formatCurrency(summary.projectedArr)],
      ["Net Revenue Retention (%)", `${churnRetention.netRevenueRetention}%`],
      ["At-Risk Value", formatCurrency(churnRetention.atRiskRevenue)],
    ];
    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `CRM_Analytics_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CRM Analytics exported to CSV successfully");
  };

  if (isLoading && !data) {
    return <AnalyticsPageSkeleton />;
  }

  return (
    <div className="w-full space-y-6 min-w-0 max-w-full pb-10 font-sans">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/25 rounded-md flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> CRM Visual Telemetry
            </span>
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-md">
              NRR {churnRetention.netRevenueRetention}%
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-foreground break-words leading-tight">
            CRM Analytics & Pipeline Visualizations
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Multi-dimensional deal conversion funnels, velocity telemetry, lead attribution, and revenue predictability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center bg-muted/30 border border-border/60 rounded-lg p-1 text-xs font-mono">
            {(["30d", "90d", "1y"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1 rounded-md transition-all font-semibold uppercase ${
                  timeRange === r
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <Button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-mono text-xs shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Syncing..." : "Live Sync"}
          </Button>

          <Button
            onClick={exportCsv}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-border/60 font-mono text-xs shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>

          <Button asChild size="sm" className="h-9 gap-1.5 font-bold shadow-sm">
            <Link href="/crm/dashboard">
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              Executive Dashboard
            </Link>
          </Button>
        </div>
      </div>

      {/* Top 5 Metric Cards - Responsive grid avoiding squished column overlap */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all min-w-0">
          <StatCard
            title="Total Open Pipeline"
            value={formatCurrency(summary.totalPipelineValue)}
            visual={<UsersGraph className="opacity-15" />}
            subtitle={`Across ${summary.activeDeals.toLocaleString("en-IN")} active opportunities`}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all min-w-0">
          <StatCard
            title="Win Ratio"
            value={`${summary.winRate}%`}
            visual={<ActivePulse className="opacity-15" />}
            subtitle={`${summary.wonDeals} Won / ${summary.lostDeals} Lost`}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all min-w-0">
          <StatCard
            title="Sales Cycle Speed"
            value={`${summary.avgSalesCycleDays} Days`}
            visual={<InactiveOrbit className="opacity-15" />}
            subtitle={`${Math.abs(30 - (summary.avgSalesCycleDays || 0))} days ${(summary.avgSalesCycleDays || 0) <= 30 ? "faster" : "slower"} than 30d SLA`}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all min-w-0">
          <StatCard
            title="Projected ARR"
            value={formatCurrency(summary.projectedArr)}
            visual={<UsersGraph className="opacity-15" />}
            subtitle="Annual Recurring Run-rate"
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all min-w-0">
          <StatCard
            title="Net Retention (NRR)"
            value={`${churnRetention.netRevenueRetention}%`}
            visual={<ActivePulse className="opacity-15" />}
            subtitle="Expansion outpacing churn"
          />
        </div>
      </div>

      {/* Row 1: Lead Conversion Funnel & Pipeline Velocity Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Lead-to-Customer Conversion Funnel (lg:col-span-5) */}
        <Card className="lg:col-span-5 chart-animate-in chart-delay-1 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all flex flex-col justify-between min-w-0">
          <CardHeader className="p-6 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Lead Conversion Funnel
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  End-to-end customer journey progression through deal gates.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                Live Funnel
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-3 flex-1 flex flex-col justify-center">
            {funnel.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs font-mono">
                <Layers className="w-8 h-8 opacity-30 mb-2" />
                <span>No pipeline deal stages recorded yet</span>
              </div>
            ) : (
              funnel.map((item: any, idx: number) => {
                const maxCount = Math.max(...funnel.map((f: any) => f.count || 0), 1);
                const pct = Math.max(8, Math.round((item.count / maxCount) * 100));
                const colors = [
                  "from-blue-600 to-indigo-600",
                  "from-indigo-600 to-purple-600",
                  "from-purple-600 to-violet-600",
                  "from-violet-600 to-emerald-600",
                  "from-emerald-600 to-teal-500",
                  "from-teal-500 to-green-500",
                  "from-green-500 to-emerald-400",
                  "from-emerald-400 to-teal-400",
                ];
                const gradient = colors[idx % colors.length];

                return (
                  <div key={item.stage} className="space-y-1 font-mono text-xs min-w-0">
                    <div className="flex items-center justify-between text-muted-foreground gap-2">
                      <span className="font-semibold text-foreground truncate flex items-center gap-1.5 min-w-0">
                        <span className="w-4 h-4 rounded-full bg-muted/60 text-[10px] flex items-center justify-center font-bold text-muted-foreground shrink-0">
                          {idx + 1}
                        </span>
                        <span className="truncate">{item.stage}</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-foreground text-xs sm:text-sm tabular-nums">
                          {item.count.toLocaleString("en-IN")}
                        </span>
                        {idx > 0 && (
                          <span className="text-[10px] text-red-400 bg-red-500/10 px-1 py-0.5 rounded">
                            -{item.dropRate}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-muted/30 rounded-full overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full bg-linear-to-r ${gradient} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Monthly Revenue Velocity & Momentum (lg:col-span-7) */}
        <Card className="lg:col-span-7 chart-animate-in chart-delay-2 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all flex flex-col justify-between min-w-0">
          <CardHeader className="p-6 pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Monthly Pipeline Velocity & Closed Won (in ₹ Lakhs)
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comparison of new pipeline added vs booked revenue against target.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] text-blue-400 bg-blue-500/10 border-blue-500/20 shrink-0 self-start sm:self-auto">
                Historical Run-Rate
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-4 flex-1 flex flex-col justify-center">
            <div className="h-[320px] w-full min-h-[280px]">
              {velocityChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-xs font-mono">
                  <TrendingUp className="w-8 h-8 opacity-30 mb-2" />
                  <span>No monthly deal velocity history recorded</span>
                </div>
              ) : (
                <CanvasComposedChart
                  data={velocityChartData}
                  xAxisKey="name"
                  barSeries={[{ key: "New Pipeline", color: "#3b82f6", name: "Pipeline Added" }]}
                  lineSeries={{ key: "Closed Won", color: "#10b981", name: "Closed Won" }}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Lead Channel Attribution, Deal Stage Aging, Rep Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Lead Channel Attribution (lg:col-span-4) - showLegend={false} to prevent legend overlapping with custom list */}
        <Card className="lg:col-span-4 chart-animate-in chart-delay-3 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all flex flex-col justify-between min-w-0">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  Lead Attribution & Channels
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Volume by customer touchpoint.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">
                {leadSources.length} Channels
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-2 flex-1 flex flex-col justify-between">
            {leadSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs font-mono">
                <Target className="w-8 h-8 opacity-30 mb-2" />
                <span>No lead channel attribution data recorded</span>
              </div>
            ) : (
              <>
                {/* Non-overlapping Donut Wheel */}
                <div className="h-[190px] w-full flex items-center justify-center relative">
                  <CanvasPieChart
                    data={leadSources.map((s: any) => ({
                      name: s.name,
                      value: s.value,
                      color: s.color,
                    }))}
                    showLegend={false}
                    title="LEADS"
                  />
                </div>

                {/* Bounded, Scrollable Channel List Preventing Card Blowout */}
                <div className="mt-3 space-y-1.5 font-mono text-xs max-h-[170px] overflow-y-auto pr-1.5 youtube-scrollbar">
                  {leadSources.map((s: any) => (
                    <div key={s.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-foreground font-medium truncate">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-muted-foreground tabular-nums">{s.count.toLocaleString("en-IN")}</span>
                        <span className="font-bold text-foreground w-9 text-right tabular-nums">{s.value}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Stage Aging & Deal Bottlenecks (lg:col-span-4) */}
        <Card className="lg:col-span-4 chart-animate-in chart-delay-4 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all flex flex-col justify-between min-w-0">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Stage Duration & Bottleneck Radar
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Average days deals spend in each pipeline stage.
                </p>
              </div>
              <div className="flex items-center gap-2.5 text-xs font-mono shrink-0">
                <span className="flex items-center gap-1.5 text-purple-400">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#8b5cf6]" /> Actual
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#64748b]" /> Target
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-2 flex-1 flex flex-col justify-between">
            {stageAgingDays.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs font-mono">
                <Clock className="w-8 h-8 opacity-30 mb-2" />
                <span>No stage aging records found</span>
              </div>
            ) : (
              <>
                <div className="h-[210px] w-full">
                  <CanvasBarChart
                    data={stageAgingChartData}
                    xAxisKey="name"
                    series={[
                      { key: "Actual Days", color: "#8b5cf6", name: "Actual Days" },
                      { key: "Benchmark Days", color: "#64748b", name: "Benchmark Days" },
                    ]}
                  />
                </div>
                <div className="mt-3 p-3 rounded-lg border border-border/40 bg-muted/10 font-mono text-xs space-y-1.5">
                  <div className="text-foreground font-semibold flex items-center justify-between">
                    <span>Cycle Bottleneck Notice</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${worstBottleneck && worstBottleneck.delta > 0 ? "text-amber-400 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>
                      {worstBottleneck ? `${worstBottleneck.stage}` : "No Bottlenecks"}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {worstBottleneck && worstBottleneck.delta > 0
                      ? `${worstBottleneck.stage} stage currently averages ${worstBottleneck.days} days vs target of ${worstBottleneck.target} days (+${worstBottleneck.delta}d latency).`
                      : "All pipeline stages are operating within target cycle time SLAs."}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sales Rep Quota Leaderboard (lg:col-span-4) - Bounded height with clean scrolling */}
        <Card className="lg:col-span-4 chart-animate-in chart-delay-5 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all flex flex-col justify-between min-w-0">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Account Executive Leaderboard
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Quota pacing and closed bookings for current quarter.
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-mono bg-primary/10 text-primary border-primary/20">
                Top Performers
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-3 flex-1 flex flex-col justify-start">
            <div className="space-y-2.5 font-mono text-xs max-h-[310px] overflow-y-auto pr-1.5 youtube-scrollbar">
              {repLeaderboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs font-mono">
                  <Users className="w-8 h-8 opacity-30 mb-2" />
                  <span>No active sales rep quota tracking found</span>
                </div>
              ) : (
                repLeaderboard.map((rep: any) => {
                  const isOverQuota = rep.attainment >= 100;
                  return (
                    <div
                      key={rep.name}
                      className="p-3 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/20 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-foreground text-sm flex items-center gap-1.5 truncate">
                            <span className="truncate">{rep.name}</span>
                            {isOverQuota && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{rep.role}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              isOverQuota
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                                : "bg-blue-500/10 text-blue-400 border border-blue-500/25"
                            }`}
                          >
                            {rep.attainment}% Quota
                          </span>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {rep.activeDeals} deals in pipe
                          </div>
                        </div>
                      </div>

                      <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isOverQuota ? "bg-emerald-500" : "bg-blue-500"
                          }`}
                          style={{ width: `${Math.min(100, rep.attainment)}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5 font-mono">
                        <span>Booked: {formatCurrency(rep.closed)}</span>
                        <span>Target: {formatCurrency(rep.quota)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Account Health & Churn Risk Heatmap */}
      <Card className="bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all min-w-0">
        <CardHeader className="p-6 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Customer Resilience & Churn Risk Heatmap
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Segmented client health tracking contract renewal safety and expansion eligibility.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <span className="text-emerald-400 font-semibold px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
                Gross Renewal Rate: {churnRetention.grossRenewalRate}%
              </span>
              <span className="text-red-400 font-semibold px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded">
                At-Risk: {formatCurrency(churnRetention.atRiskRevenue)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
            <div className="p-4 rounded-lg border border-emerald-500/25 bg-emerald-500/5 space-y-2 min-h-[110px] flex flex-col justify-between">
              <div className="flex justify-between items-center">
                <span className="font-bold text-emerald-400">Healthy Cohort</span>
                <span className="text-xs bg-emerald-500/15 px-2 py-0.5 rounded text-emerald-400 font-bold">
                  {churnRetention.healthyAccounts} Accounts
                </span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Active daily telemetry, high feature utilization, contract renewal secure.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-blue-500/25 bg-blue-500/5 space-y-2 min-h-[110px] flex flex-col justify-between">
              <div className="flex justify-between items-center">
                <span className="font-bold text-blue-400">Warning / Stable</span>
                <span className="text-xs bg-blue-500/15 px-2 py-0.5 rounded text-blue-400 font-bold">
                  {churnRetention.warningAccounts} Accounts
                </span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Steady utilization with periodic inactivity; proactive CS outreach advised.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-amber-500/25 bg-amber-500/5 space-y-2 min-h-[110px] flex flex-col justify-between">
              <div className="flex justify-between items-center">
                <span className="font-bold text-amber-400">High Churn Risk</span>
                <span className="text-xs bg-amber-500/15 px-2 py-0.5 rounded text-amber-400 font-bold">
                  {churnRetention.highRiskAccounts} Accounts
                </span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Low login frequency or pending SLA tickets; renewal negotiation required.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-red-500/25 bg-red-500/5 space-y-2 min-h-[110px] flex flex-col justify-between">
              <div className="flex justify-between items-center">
                <span className="font-bold text-red-400">Critical Churn Risk</span>
                <span className="text-xs bg-red-500/15 px-2 py-0.5 rounded text-red-400 font-bold">
                  {churnRetention.criticalRiskAccounts} {churnRetention.criticalRiskAccounts === 1 ? "Account" : "Accounts"}
                </span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {churnRetention.criticalRiskAccounts > 0
                  ? `Immediate executive escalation required for ${churnRetention.criticalRiskAccounts} at-risk client account${churnRetention.criticalRiskAccounts > 1 ? "s" : ""}.`
                  : "All client accounts currently maintain stable health thresholds."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
