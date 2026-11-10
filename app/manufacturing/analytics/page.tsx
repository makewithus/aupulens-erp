"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
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
} from "@/components/inventory/CanvasCharts";
import { AnalyticsPageSkeleton } from "@/components/ui/loading-skeletons";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";
import { toast } from "sonner";
import { Factory, TrendingUp, Cpu, AlertTriangle, Truck, Layers, Download, Sparkles, ChevronRight, ShieldCheck, RefreshCw } from "lucide-react";

export default function ManufacturingAnalyticsPage() {
  const { data: session } = useSession();
  const [timeRange, setTimeRange] = useState<string>("30d");
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async (fresh: boolean = false) => {
    try {
      setLoadError(false);
      if (fresh) setIsRefreshing(true);
      const url = `/api/manufacturing/analytics?range=${timeRange}${fresh ? "&fresh=true" : ""}`;
      const res = await cachedFetch(url, {
        cache: fresh ? "no-store" : "default",
      });
      if (!res.ok) throw new Error("Manufacturing analytics request failed");
      const json = await res.json();
      setData(json);
      setLoadError(false);
      if (fresh) toast.success("Live manufacturing database synchronized");
    } catch (e) {
      console.error("Failed to load fresh manufacturing analytics:", e);
      setLoadError(true);
      if (fresh) toast.error("Failed to sync live manufacturing data");
    } finally {
      setIsLoading(false);
      if (fresh) setIsRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    const cached = getInstantCachedData<any>(`/api/manufacturing/analytics?range=${timeRange}`, { allowPreHydration: true });
    if (cached) {
      setData(cached);
      setIsLoading(false);
    }
    loadData(false);
    const handleRevalidated = (e: any) => {
      if (e?.detail?.url?.includes("/api/manufacturing")) {
        loadData(false);
      }
    };
    window.addEventListener("aup:revalidated", handleRevalidated);
    return () => window.removeEventListener("aup:revalidated", handleRevalidated);
  }, [loadData]);

  const kpis = data?.kpis || {
    overallOee: null,
    availability: null,
    performance: null,
    qualityRate: null,
    totalProductionOutput: 0,
    inProductionUnits: 0,
    onTimeDispatchRate: null,
    qcFirstPassYield: null,
    scheduleAttainment: null,
    onTimeCompletionRate: null,
    overallEfficiency: null,
    openOrders: 0,
    wipUnits: 0,
    totalBoms: 0,
    totalShipments: 0,
  };
  const meta = data?.meta || {};
  const fmtPct = (value: number | null | undefined) => (value == null ? "No data" : `${value}%`);
  const dailyOutput = data?.dailyOutput || [];
  const qcYieldDistribution = data?.qcYieldDistribution || [];
  const wipStages = data?.wipStages || [];
  const bomMaterialVariance = data?.bomMaterialVariance || [];
  const freightLogistics = data?.freightLogistics || [];

  // Composed Chart Data: Daily Actual Output (Bars) vs Target Output (Line)
  const outputChartData = useMemo(() => {
    return dailyOutput.map((d: any) => ({
      // "2026-11-10" -> "10 Nov": full ISO dates were truncated to "2…" on the axis.
      name: new Date(`${d.day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }),
      "Actual Output": d.actual,
      "Target Output": d.target,
    }));
  }, [dailyOutput]);

  const exportCsv = () => {
    const headers = ["Metric", "Value"];
    const rows = [
      ["Overall Production Efficiency (%)", fmtPct(kpis.overallEfficiency)],
      ["Schedule Attainment (%)", fmtPct(kpis.scheduleAttainment)],
      ["On-Time Completion (%)", fmtPct(kpis.onTimeCompletionRate)],
      ["Quality Yield (%)", fmtPct(kpis.qualityRate)],
      ["Total Output (Units)", kpis.totalProductionOutput],
      ["In-Production (Units)", kpis.inProductionUnits],
      ["Work in Progress (Units)", kpis.wipUnits],
      ["Open Orders", kpis.openOrders],
      ["First-Pass QC Yield (%)", fmtPct(kpis.qcFirstPassYield)],
      ["On-Time Dispatch (%)", fmtPct(kpis.onTimeDispatchRate)],
    ];
    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Manufacturing_Analytics_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Manufacturing analytics exported to CSV");
  };

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing Operations & Analytics"
      pageName="Manufacturing Analytics"
      breadcrumbs={[
        { label: "Manufacturing", href: "/manufacturing/dashboard" },
        { label: "Analytics & Visualizations" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={loadData}
      profilePath="/manufacturing/profile"
    >
      <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8 py-6 max-w-full font-sans">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-mono font-bold bg-primary/10 text-primary border border-border/50 rounded-md flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Industrial Telemetry
              </span>
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-md">
                Production Metrics
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground break-words leading-none">
              Manufacturing Analytics & Efficiency
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Production efficiency, throughput, QC pass yields, work in progress and material variance, from recorded orders and shipments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-muted/30 border border-border/60 rounded-lg p-1 text-xs font-mono">
              {(["7d", "30d", "90d"] as const).map((r) => (
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
              <Link href="/manufacturing/dashboard">
                <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                Operational Dashboard
              </Link>
            </Button>
          </div>
        </div>

        {isLoading && !data ? (
          <AnalyticsPageSkeleton />
        ) : loadError && !data ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">Manufacturing analytics could not be loaded. No figures are available until the data request succeeds.</p>
            <Button variant="outline" onClick={() => void loadData(true)}>Retry</Button>
          </div>
        ) : (
          <>
            {/* Top 5 Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
          <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
            <StatCard
              title="Production Efficiency"
              value={fmtPct(kpis.overallEfficiency)}
              visual={<ActivePulse />}
              subtitle={kpis.overallEfficiency != null
                ? "Plan × timeliness × QC"
                : kpis.scheduleAttainment == null
                  ? "No orders scheduled in this period"
                  : kpis.onTimeCompletionRate == null
                    ? "No scheduled orders finished in this period"
                    : "No QC inspections in this period"}
            />
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
            <StatCard
              title="Completed Output"
              value={kpis.totalProductionOutput.toLocaleString("en-IN")}
              visual={<UsersGraph />}
              subtitle={`Units finished, last ${timeRange}`}
            />
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
            <StatCard
              title="First-Pass QC Yield"
              value={fmtPct(kpis.qcFirstPassYield)}
              visual={<InactiveOrbit />}
              subtitle={kpis.qcFirstPassYield != null
                ? `${(meta.qcPassedUnits || 0).toLocaleString("en-IN")}/${(meta.qcInspectedUnits || 0).toLocaleString("en-IN")} units passed`
                : meta.qcPendingOrders ? `${meta.qcPendingOrders} orders awaiting QC` : "No QC inspections in this period"}
            />
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
            <StatCard
              title="Work in Progress"
              value={`${(kpis.wipUnits || 0).toLocaleString("en-IN")} units`}
              visual={<UsersGraph />}
              subtitle={`${kpis.openOrders || 0} open production orders`}
            />
          </div>
          <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
            <StatCard
              title="On-Time Dispatch"
              value={fmtPct(kpis.onTimeDispatchRate)}
              visual={<ActivePulse />}
              subtitle={kpis.onTimeDispatchRate != null
                ? `${meta.onTimeShipments || 0} of ${meta.dueShipments || 0} due on time`
                : `${kpis.totalShipments || 0} shipped, none due yet`}
            />
          </div>
        </div>

        {/* Row 1: OEE Breakdown & Production Throughput Composed Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* OEE 3-Pillar Component Card (lg:col-span-4) */}
          <Card className="lg:col-span-4 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
            <CardHeader className="p-6 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-primary" />
                    Production Efficiency Breakdown
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Schedule attainment × on-time completion × quality yield.
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    {kpis.overallEfficiency == null ? "No data yet" : `${kpis.overallEfficiency}% Overall`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-3 space-y-4 font-mono text-xs">
              {[
                {
                  label: "Schedule Attainment",
                  value: kpis.scheduleAttainment,
                  color: "bg-emerald-500",
                  text: "text-emerald-400",
                  note: kpis.scheduleAttainment == null
                    ? "No orders scheduled in this period"
                    : `${(meta.plannedFinishedUnits || 0).toLocaleString("en-IN")} of ${(meta.plannedUnits || 0).toLocaleString("en-IN")} planned units finished`,
                },
                {
                  label: "On-Time Completion",
                  value: kpis.onTimeCompletionRate,
                  color: "bg-primary",
                  text: "text-primary",
                  note: kpis.onTimeCompletionRate == null
                    ? "No scheduled orders finished in this period"
                    : `${meta.finishedOnTime || 0} of ${meta.finishedWithSchedule || 0} finished orders on schedule`,
                },
                {
                  label: "Quality Yield",
                  value: kpis.qualityRate,
                  color: "bg-primary",
                  text: "text-primary",
                  note: kpis.qualityRate == null
                    ? "No QC inspections in this period"
                    : `${(meta.qcPassedUnits || 0).toLocaleString("en-IN")} of ${(meta.qcInspectedUnits || 0).toLocaleString("en-IN")} inspected units passed`,
                },
              ].map((pillar) => (
                <div key={pillar.label} className="p-3 rounded-lg border border-border/40 bg-muted/15 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-foreground">{pillar.label}</span>
                    <span className={`${pillar.text} font-bold`}>{fmtPct(pillar.value)}</span>
                  </div>
                  <div className="w-full h-2 bg-muted/40 rounded-full overflow-hidden">
                    <div className={`h-full ${pillar.color} rounded-full`} style={{ width: `${Math.min(100, pillar.value || 0)}%` }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground">{pillar.note}</div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground font-sans">
                Machine-level OEE needs runtime and cycle-time readings, which production orders do not record.
              </p>
            </CardContent>
          </Card>

          {/* Daily Output vs Target Composed Chart (lg:col-span-8) */}
          <Card className="chart-animate-in chart-delay-1 lg:col-span-8 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
            <CardHeader className="p-6 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Daily Production Throughput vs Planned Target (Units)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {timeRange === "7d" ? "7" : timeRange === "90d" ? "90" : "30"}-day completed output against scheduled order quantities.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Actual Output
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-400" /> Planned Output
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-4">
              <div className="h-[280px] w-full">
                {outputChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No production orders in this period.</div>
                ) : <CanvasBarChart
                  data={outputChartData}
                  xAxisKey="name"
                  series={[
                    { key: "Actual Output", color: "#1e3a8a", name: "Actual Units" },
                    { key: "Target Output", color: "#94a3b8", name: "Planned Units" },
                  ]}
                />}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: QC Yield Donut, Work Center Utilization, Logistics Mode */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* QC Inspection Yield Distribution (lg:col-span-4) */}
          <Card className="chart-animate-in chart-delay-2 lg:col-span-4 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                QC Inspection Yield & Defect Categories
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Breakdown of quality assurance testing outcomes.
              </p>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="h-[220px] w-full flex items-center justify-center">
                <CanvasPieChart
                  data={qcYieldDistribution.map((item: any) => ({
                    name: item.name,
                    value: item.count,
                    color: item.color,
                  }))}
                />
              </div>
              <div className="mt-4 space-y-2 font-mono text-xs">
                {qcYieldDistribution.map((item: any) => (
                  <div key={item.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-foreground font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{item.count.toLocaleString("en-IN")} orders</span>
                      <span className="font-bold text-foreground">{item.value}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Work Center Load Capacity (lg:col-span-5) */}
          <Card className="chart-animate-in chart-delay-3 lg:col-span-5 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
            <CardHeader className="p-6 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Factory className="w-4 h-4 text-primary" />
                    Work in Progress by Stage
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Share of open production units at each stage.
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                  {wipStages.length} {wipStages.length === 1 ? "Stage" : "Stages"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-3 space-y-3 font-mono text-xs">
              {wipStages.length === 0 && <p className="text-muted-foreground">No open production orders right now.</p>}
              {wipStages.map((wc: any) => {
                const isHeavy = wc.load >= 90;
                return (
                  <div key={wc.name} className="p-3 rounded-lg border border-border/40 bg-muted/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-foreground flex items-center gap-2">
                        {wc.name}
                        {isHeavy && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 inline" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{wc.activeJobs} {wc.activeJobs === 1 ? "order" : "orders"} · {Number(wc.units).toLocaleString("en-IN")} units</span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            isHeavy
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                          }`}
                        >
                          {wc.load}% of WIP
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isHeavy ? "bg-amber-500" : "bg-primary"
                        }`}
                        style={{ width: `${wc.load}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Freight & Logistics Modes (lg:col-span-3) */}
          <Card className="chart-animate-in chart-delay-4 lg:col-span-3 bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                Dispatch & Freight Mode
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Logistics transport allocation.
              </p>
            </CardHeader>
            <CardContent className="p-6 pt-3 space-y-3 font-mono text-xs">
              {freightLogistics.length === 0 && <p className="text-muted-foreground">No shipment data is recorded for this period.</p>}
              {freightLogistics.map((f: any) => (
                <div key={f.mode} className="p-3 rounded-lg border border-border/40 bg-muted/10 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-foreground">{f.mode}</span>
                    <span className="text-foreground font-bold">{f.percentage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${f.percentage}%`, backgroundColor: f.color }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right">
                    {f.shipments} shipments fulfilled
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Row 3: BOM Material Variance & Consumption Audit */}
        <Card className="bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
          <CardHeader className="p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Bill of Materials (BOM) Material Consumption & Variance Audit
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Planned component quantities compared with consumption recorded on orders finished in this period.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                {bomMaterialVariance.length === 0
                  ? "No consumption recorded"
                  : `${bomMaterialVariance.filter((row: any) => row.status === "Over plan").length} of ${bomMaterialVariance.length} materials over plan`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-3">
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs text-left">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground bg-muted/20">
                    <th className="py-2.5 px-3 font-bold">Component Item</th>
                    <th className="py-2.5 px-3 font-bold text-right">Standard Planned</th>
                    <th className="py-2.5 px-3 font-bold text-right">Actual Issued</th>
                    <th className="py-2.5 px-3 font-bold text-center">Variance %</th>
                    <th className="py-2.5 px-3 font-bold text-right">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {bomMaterialVariance.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground font-sans">
                        No component consumption recorded on orders finished in this period.
                      </td>
                    </tr>
                  ) : (
                    bomMaterialVariance.map((row: any) => (
                      <tr key={row.item} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-3 font-semibold text-foreground">{row.item}</td>
                        <td className="py-3 px-3 text-right text-muted-foreground">
                          {row.planned.toLocaleString("en-IN")} {row.unit}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-foreground">
                          {row.actual.toLocaleString("en-IN")} {row.unit}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              row.variance.startsWith("+")
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {row.variance}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {row.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
