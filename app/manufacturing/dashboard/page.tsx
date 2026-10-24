"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Factory,
  Package,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Activity,
  Layers,
  Wrench,
  Gauge,
  TrendingUp,
  Cpu,
} from "lucide-react";
import { DailyBrickBarChart } from "@/components/charts/DailyBrickBarChart";
import { CanvasPieChart } from "@/components/inventory/CanvasCharts";
import { useThemeStore } from "@/store/themeStore";
import { BRAND_COLORS, BRAND_ACCENT_PALETTE } from "@/lib/constants/brandColors";
import { cn } from "@/lib/utils";
import { cachedFetch } from "@/lib/api/cachedFetch";

export default function ManufacturingDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    oee: 0,
    availability: 0,
    performance: 0,
    qualityRate: 0,
    activeWorkOrders: 0,
    demandPlanning: 0,
    qcPending: 0,
    reworkScrap: 0,
    finishedThisMonth: 0,
    totalBoms: 0,
    activeWorkCenters: 0,
    totalWorkCenters: 0,
  });
  const [productionStagesData, setProductionStagesData] = useState<any[]>([]);
  const [workCenterLines, setWorkCenterLines] = useState<any[]>([]);
  const [activeWorkOrdersList, setActiveWorkOrdersList] = useState<any[]>([]);
  const [dailyOutputData, setDailyOutputData] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadSummary() {
      try {
        const raw = await cachedFetch("/api/manufacturing/summary");
        const res = raw.ok ? await raw.json() : null;
        if (res?.success && isMounted) {
          if (res.data?.manufacturingStats) {
            setStats(res.data.manufacturingStats);
          }
          if (Array.isArray(res.data?.productionStagesData)) {
            setProductionStagesData(res.data.productionStagesData);
          }
          if (Array.isArray(res.data?.workCenterLines)) {
            setWorkCenterLines(res.data.workCenterLines);
          }
          if (Array.isArray(res.data?.recentOrders)) {
            setActiveWorkOrdersList(res.data.recentOrders);
          }
          if (Array.isArray(res.data?.dailyOutput)) {
            setDailyOutputData(res.data.dailyOutput);
          }
        }
      } catch (err) {
        console.error("Failed to load manufacturing summary:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadSummary();
    return () => { isMounted = false; };
  }, []);

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing Operational Dashboard"
      pageName="Manufacturing Dashboard"
      breadcrumbs={[{ label: "Manufacturing", href: "/manufacturing/dashboard" }, { label: "Operational Dashboard" }]}
      userName={session?.user?.name || "Production Manager"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "manufacturing"}
      onSignOut={() => signOut({ callbackUrl: "/auth/manufacturing" })}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 min-w-0 max-w-full font-mono">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Shop Floor Telemetry
              </span>
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                OEE Benchmark 87.1%
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
              Manufacturing Operations Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Real-time shop floor execution, overall equipment effectiveness (OEE), line utilization, and work order throughput.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="text-xs font-mono h-9 gap-1.5 bg-[#A77DFF] hover:bg-[#966be8] text-[#0A0A0A] font-bold shadow-sm"
            >
              <Link href="/manufacturing/manufacturing">
                <Plus className="w-3.5 h-3.5" />
                New Production Order
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(
                "text-xs font-mono h-9 gap-1.5 border-border/70",
                isDark ? "bg-[#161616] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white text-zinc-800 hover:bg-zinc-100"
              )}
            >
              <Link href="/manufacturing/bom">
                <FileText className="w-3.5 h-3.5" />
                Configure BoM
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(
                "text-xs font-mono h-9 gap-1.5 border-border/70",
                isDark ? "bg-[#161616] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white text-zinc-800 hover:bg-zinc-100"
              )}
            >
              <Link href="/manufacturing/reports">
                <Activity className="w-3.5 h-3.5" />
                Production Reports
              </Link>
            </Button>
          </div>
        </div>

        {/* Top 4 KPI Cards: OEE, Active Orders, First-Pass Yield, Active BOMs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: OEE */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Overall Equipment (OEE)</span>
                <span className="p-1.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">
                  <Gauge className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {stats.oee}%
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-purple-400 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{stats.oee > 0 ? "Targeting world-class benchmark" : "No telemetry recorded yet"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Active Work Orders */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Active Work Orders</span>
                <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                  <Factory className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {stats.activeWorkOrders} in progress
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
                <span>{stats.demandPlanning} in demand queue</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Quality First-Pass Yield */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Quality Pass Rate</span>
                <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-emerald-400">
                {stats.qualityRate}%
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-semibold">
                <span>{stats.reworkScrap} units requiring rework</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Work Centers & BOMs */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Work Centers Active</span>
                <span className="p-1.5 bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20">
                  <Cpu className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {stats.activeWorkCenters} / {stats.totalWorkCenters} Lines
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-yellow-500 font-semibold">
                <span>{stats.totalBoms} active engineering BOMs</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 2: Visual Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Daily Output Throughput (DailyBrickBarChart) */}
          <div className="lg:col-span-8">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#A77DFF] animate-pulse" />
                    <CardTitle className="text-base font-bold">
                      Daily Assembly & Production Throughput (Units Finished)
                    </CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Segmented day-by-day manufacturing execution tracking machine-line finished goods output.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#A77DFF]" />
                    <span className="text-muted-foreground">Finished Units</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#8AE06C]" />
                    <span className="text-muted-foreground">Peak Production</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <DailyBrickBarChart
                  height={340}
                  colorTheme="purple"
                  metricLabel="Completed Units"
                  data={dailyOutputData}
                  valueKey="count"
                  yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                />
              </CardContent>
            </Card>
          </div>

          {/* Orders by Production Stage Donut (CanvasPieChart) */}
          <div className="lg:col-span-4">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full flex flex-col justify-between",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60">
                <CardTitle className="text-base font-bold">
                  Work Orders by Stage
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time pipeline distribution from material reservation to finished goods.
                </p>
              </CardHeader>
              <CardContent className="p-5 flex-1 flex flex-col justify-center items-center">
                {productionStagesData.some((d) => d.value > 0) ? (
                  <CanvasPieChart
                    data={productionStagesData}
                    title="WIP Orders"
                    colors={BRAND_ACCENT_PALETTE}
                  />
                ) : (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    No active production orders across stages yet
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section 3: Machine Line Utilization & Active MO Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Work Center Machine Lines */}
          <div className="lg:col-span-5">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60">
                <CardTitle className="text-base font-bold">
                  Work Center Line Telemetry
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time operational status and load percentage across manufacturing cells.
                </p>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                {workCenterLines.length > 0 ? (
                  workCenterLines.map((line, idx) => (
                    <div key={idx} className="space-y-1.5 border-b border-border/30 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <span className="font-semibold text-foreground block">{line.name}</span>
                          <span className="text-[11px] text-muted-foreground">Product: {line.product}</span>
                        </div>
                        <div className="text-right">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold inline-block mb-1"
                            style={{
                              backgroundColor: `${line.color}20`,
                              color: line.color,
                              border: `1px solid ${line.color}40`,
                            }}
                          >
                            {line.status} ({line.load}%)
                          </span>
                          <div className="text-[10px] text-muted-foreground">{line.operator}</div>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-border/40 overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{ width: `${line.load}%`, backgroundColor: line.color }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-xs text-muted-foreground font-mono">
                    No active work centers configured for this organization.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Active Work Orders Queue Table */}
          <div className="lg:col-span-7">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Factory className="w-4 h-4 text-[#A77DFF]" /> Active Manufacturing Orders Queue
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Live schedule of production jobs assigned to assembly work centers.
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="text-xs font-mono h-8 border-border/60 self-start sm:self-auto"
                >
                  <Link href="/manufacturing/manufacturing">View All Orders</Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono min-w-[580px] whitespace-nowrap">
                    <thead className="border-b border-border/60 text-muted-foreground bg-muted/20 whitespace-nowrap">
                      <tr>
                        <th className="p-3 pl-5">Order / Product</th>
                        <th className="p-3">Work Center</th>
                        <th className="p-3">Quantity</th>
                        <th className="p-3">Progress</th>
                        <th className="p-3 pr-5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {activeWorkOrdersList.length > 0 ? (
                        activeWorkOrdersList.map((mo, i) => (
                          <tr key={i} className="hover:bg-muted/10 transition-colors">
                            <td className="p-3 pl-5">
                              <div className="font-bold text-foreground">{mo.id}</div>
                              <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                                {mo.product}
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">{mo.workCenter}</td>
                            <td className="p-3 font-semibold text-foreground">
                              {mo.completedQty} / {mo.targetQty}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-border/40 overflow-hidden">
                                  <div
                                    className="h-full bg-[#A77DFF]"
                                    style={{ width: `${mo.progress}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground">{mo.progress}%</span>
                              </div>
                            </td>
                            <td className="p-3 pr-5 text-right">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-mono text-[10px]",
                                  mo.status === "In Production"
                                    ? "border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10"
                                    : mo.status === "Finished"
                                    ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                    : mo.status === "QC Pending"
                                    ? "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10"
                                    : "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/10"
                                )}
                              >
                                {mo.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-muted-foreground font-mono">
                            No manufacturing orders found for this organization.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
