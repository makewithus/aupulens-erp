"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Factory,
  Package,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Truck,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { StatsRowSkeleton, FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";
import {
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
  type ProductionStatus,
} from "@/lib/constants/statuses";

interface ManufacturingSummary {
  demandForecast: number;
  inProduction: number;
  qcPending: number;
  rework: number;
  finished: number;
  totalBoms: number;
  totalProducts: number;
  totalOrders: number;
  totalShipments: number;
  oee: number;
  recentOrders: any[];
}

export default function ManufacturingDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [summary, setSummary] = useState<ManufacturingSummary | null>(() => {
    const cached = getInstantCachedData<any>("/api/manufacturing/summary");
    if (!cached) return null;
    const stats = cached.stats || {};
    const sum = cached.summary || {};
    return {
      demandForecast: sum.demandForecast ?? stats.demandForecast ?? 0,
      inProduction: sum.inProduction ?? stats.inProduction ?? 0,
      qcPending: sum.qcPending ?? stats.qcPending ?? 0,
      rework: sum.rework ?? stats.rework ?? 0,
      finished: sum.finished ?? stats.finished ?? 0,
      totalBoms: sum.totalBoms ?? stats.totalBoms ?? 0,
      totalProducts: sum.totalProducts ?? stats.totalProducts ?? 0,
      totalOrders: stats.totalOrders ?? 0,
      totalShipments: stats.totalShipments ?? 0,
      oee: stats.oee ?? 0,
      recentOrders: cached.recentOrders ?? [],
    };
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => !getInstantCachedData<any>("/api/manufacturing/summary"));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSummary = useCallback(async (fresh: boolean = false) => {
    try {
      if (fresh) setIsRefreshing(true);
      const res = await cachedFetch(`/api/manufacturing/summary${fresh ? "?fresh=true" : ""}`, {
        cache: fresh ? "no-store" : "default",
      });
      if (!res.ok) throw new Error("Failed to load manufacturing summary");
      const data = await res.json();

      const stats = data.stats || {};
      const sum = data.summary || {};
      const recent = data.recentOrders || [];

      setSummary({
        demandForecast: sum.demandForecast ?? stats.demandForecast ?? 0,
        inProduction: sum.inProduction ?? stats.inProduction ?? 0,
        qcPending: sum.qcPending ?? stats.qcPending ?? 0,
        rework: sum.rework ?? stats.rework ?? 0,
        finished: sum.finished ?? stats.finished ?? 0,
        totalBoms: sum.totalBoms ?? stats.totalBoms ?? 0,
        totalProducts: sum.totalProducts ?? stats.totalProducts ?? 0,
        totalOrders: stats.totalOrders ?? 0,
        totalShipments: stats.totalShipments ?? 0,
        oee: stats.oee ?? 0,
        recentOrders: recent ?? [],
      });
      if (fresh) toast.success("Live manufacturing data synchronized");
    } catch (err) {
      console.error("Error fetching manufacturing summary:", err);
      if (fresh) toast.error("Failed to sync live manufacturing data");
    } finally {
      if (fresh) setIsRefreshing(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary(false);
    const handleRevalidated = (e: any) => {
      if (e?.detail?.url?.includes("/api/manufacturing")) {
        fetchSummary(false);
      }
    };
    window.addEventListener("aup:revalidated", handleRevalidated);
    return () => window.removeEventListener("aup:revalidated", handleRevalidated);
  }, [fetchSummary]);

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing Operational Dashboard"
      pageName="Manufacturing Dashboard"
      breadcrumbs={[
        { label: "Manufacturing", href: "/manufacturing/dashboard" },
        { label: "Operational Dashboard" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/manufacturing" })}
      onRefresh={fetchSummary}
      profilePath="/manufacturing/profile"
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 min-w-0 max-w-full">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl md:text-[56px] font-black tracking-tighter text-primary break-words leading-none">
              Manufacturing Operations
            </h1>
            <p className="text-xs text-muted-foreground">
              Real-time shop floor execution, production order throughput, line utilization, and quality assurance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSummary(true)}
              disabled={isRefreshing}
              className="h-9 gap-1.5 border-border/60 hover:bg-muted/30"
              title="Query live MongoDB records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Live Sync"}</span>
            </Button>
            <Button asChild size="sm" className="h-9 gap-1.5 font-bold shadow-sm">
              <Link href="/manufacturing/manufacturing">
                <Plus className="w-3.5 h-3.5" />
                New Production Order
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 border-border/60">
              <Link href="/manufacturing/bom">
                <FileText className="w-3.5 h-3.5" />
                Configure BoM
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 shadow-xs font-semibold">
              <Link href="/manufacturing/analytics">
                <BarChart3 className="w-3.5 h-3.5" />
                Manufacturing Analytics
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 border-border/60">
              <Link href="/manufacturing/reports">
                <BarChart3 className="w-3.5 h-3.5" />
                Production Reports
              </Link>
            </Button>
          </div>
        </div>

        {/* Top Operational Status KPIs */}
        {isLoading || !summary ? (
          <StatsRowSkeleton count={5} />
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                title="Planning & Demand"
                value={summary.demandForecast}
                subtitle="Orders to Plan"
                visual={<UsersGraph />}
              />
              <StatCard
                title="In Production"
                value={summary.inProduction}
                subtitle="Reserved / Issued / In Work"
                visual={<ActivePulse />}
              />
              <StatCard
                title="QC Pending"
                value={summary.qcPending}
                subtitle="Awaiting Quality Check"
                visual={<UsersGraph />}
              />
              <StatCard
                title="Rework"
                value={summary.rework}
                subtitle="QC Failed / Rework Queue"
                visual={<InactiveOrbit />}
              />
              <StatCard
                title="Finished Goods"
                value={summary.finished}
                subtitle="Completed Orders"
                visual={<ActivePulse />}
              />
            </div>

            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4 pt-1">
              <StatCard
                title="Bill of Materials"
                value={summary.totalBoms}
                subtitle="Active BOM Recipes"
                visual={<UsersGraph />}
              />
              <StatCard
                title="Products Catalog"
                value={summary.totalProducts}
                subtitle="Finished & Sub-assemblies"
                visual={<UsersGraph />}
              />
              <StatCard
                title="Active Shipments"
                value={summary.totalShipments}
                subtitle="Freight & Dispatch Orders"
                visual={<ActivePulse />}
              />
              <StatCard
                title="OEE Benchmark"
                value={summary.oee > 0 ? `${summary.oee}%` : "0%"}
                subtitle="Shop Floor Telemetry"
                visual={<ActivePulse />}
              />
            </div>
          </div>
        )}

        {/* Operational Flow Cards */}
        <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
          {/* Quick Actions Card */}
          <Card className="md:col-span-1 border border-border/40 shadow-none rounded-none bg-background">
            <CardHeader className="p-6 border-b border-border/20">
              <CardTitle className="text-base font-bold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-2">
              <Link
                href="/manufacturing/manufacturing"
                className="block p-3 border border-border/30 rounded-none hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-none bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <Plus className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">New Production Order</div>
                      <div className="text-xs text-muted-foreground">
                        Schedule factory execution
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link
                href="/manufacturing/bom"
                className="block p-3 border border-border/30 rounded-none hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-none bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-purple-500" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">New Bill of Materials</div>
                      <div className="text-xs text-muted-foreground">
                        Configure multi-level component BoM
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link
                href="/manufacturing/products"
                className="block p-3 border border-border/30 rounded-none hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-none bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <Package className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">Products & Components</div>
                      <div className="text-xs text-muted-foreground">
                        Catalog items & raw materials
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              <Link
                href="/manufacturing/reports"
                className="block p-3 border border-border/30 rounded-none hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-none bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-amber-500" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">Analytics & Reports</div>
                      <div className="text-xs text-muted-foreground">
                        Production output & quality audit
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Orders Card */}
          <Card className="md:col-span-2 border border-border/40 shadow-none rounded-none bg-background">
            <CardHeader className="flex flex-row items-center justify-between p-6 border-b border-border/20">
              <div>
                <CardTitle className="text-base font-bold">Recent Manufacturing Orders</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Latest work orders queued or running across assembly lines.
                </p>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-xs font-mono">
                <Link href="/manufacturing/manufacturing">View All Orders</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              {!summary || summary.recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Factory className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-sm">No manufacturing orders recorded yet</p>
                  <Button asChild size="sm" className="mt-4 text-xs font-mono">
                    <Link href="/manufacturing/manufacturing">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Create First Order
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {summary.recentOrders.map((order) => {
                    const ps = (order.productionStatus || "demand_forecast") as ProductionStatus;
                    const colors = PRODUCTION_STATUS_COLORS[ps] || {
                      bg: "bg-muted/20",
                      text: "text-muted-foreground",
                    };
                    return (
                      <div
                        key={order._id || order.id}
                        className="flex items-center justify-between p-3 border border-border/30 hover:bg-muted/20 transition-colors rounded-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-muted/40 rounded-none flex items-center justify-center border border-border/30">
                            <Factory className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {order.id || order.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {order.product} · Qty: {order.quantity}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium ${colors.bg} ${colors.text} border border-border/30 rounded-none`}
                          >
                            {PRODUCTION_STATUS_LABELS[ps] || ps}
                          </span>
                          <div className="text-xs text-muted-foreground font-mono w-20 text-right">
                            {order.date}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
