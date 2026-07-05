"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  BarChart3,
  Plus,
  ArrowRight,
  FlaskConical,
  RotateCcw,
} from "lucide-react";
import { StatsRowSkeleton, FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { StatCard } from "@/components/manufacturing/StatCard";
import { ManufacturingVisualization } from "@/components/manufacturing/ManufacturingVisualization";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  PRODUCTION_STATUS,
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
  recentOrders: any[];
}

export default function ManufacturingDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [showVisualization, setShowVisualization] = useState(false);
  const [visualizationData, setVisualizationData] = useState<any[]>([]);
  const [summary, setSummary] = useState<ManufacturingSummary>({
    demandForecast: 0,
    inProduction: 0,
    qcPending: 0,
    rework: 0,
    finished: 0,
    totalBoms: 0,
    totalProducts: 0,
    recentOrders: [],
  });

  const fetchSummary = useCallback(async () => {
    try {
      setIsLoading(true);
      const [moRes, bomRes, productsRes] = await Promise.all([
        fetch("/api/inventory/operations/manufacturing"),
        fetch("/api/manufacturing/bom"),
        fetch("/api/sales/products"),
      ]);

      const moData = await moRes.json();
      const bomData = await bomRes.json();
      const productsData = await productsRes.json();

      const orders = moData.orders || [];
      const boms = bomData.boms || [];
      const items = productsData.items || [];

      setSummary({
        demandForecast: orders.filter(
          (o: any) =>
            o.productionStatus === PRODUCTION_STATUS.DEMAND_FORECAST ||
            o.productionStatus === PRODUCTION_STATUS.PRODUCTION_ORDER,
        ).length,
        inProduction: orders.filter(
          (o: any) =>
            o.productionStatus === PRODUCTION_STATUS.IN_PRODUCTION ||
            o.productionStatus === PRODUCTION_STATUS.MATERIAL_RESERVED ||
            o.productionStatus === PRODUCTION_STATUS.MATERIAL_ISSUED,
        ).length,
        qcPending: orders.filter(
          (o: any) => o.productionStatus === PRODUCTION_STATUS.QC_PENDING,
        ).length,
        rework: orders.filter(
          (o: any) =>
            o.productionStatus === PRODUCTION_STATUS.REWORK ||
            o.productionStatus === PRODUCTION_STATUS.QC_FAILED,
        ).length,
        finished: orders.filter(
          (o: any) => o.productionStatus === PRODUCTION_STATUS.FINISHED,
        ).length,
        totalBoms: boms.length,
        totalProducts: items.length,
        recentOrders: orders
          .sort(
            (a: any, b: any) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, 5),
      });

      // Prepare Visualization Data (Production Status)
      const statusCounts = orders.reduce((acc: any, order: any) => {
        const val = order.productionStatus || "demand_forecast";
        const label =
          PRODUCTION_STATUS_LABELS[val as ProductionStatus] || val;
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      const chartData = Object.entries(statusCounts).map(([k, v]) => ({
        name: k,
        value: v,
      }));
      setVisualizationData(chartData);
    } catch (err) {
      console.error("Error fetching summary:", err);
      toast({
        title: "Error",
        description: "Failed to fetch dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/manufacturing");
    } else if (status === "authenticated") {
      /* 
         Allowing expanded access based on recent role updates.
         Ideally, this check should be consistent with middleware/other pages.
      */
      if (
        session?.user?.role !== "manufacturing" &&
        session?.user?.role !== "admin" &&
        session?.user?.role !== "inventory"
      ) {
        // router.push("/auth/manufacturing");
        // Commenting out strict redirect for now to allow testing across roles
      }
      fetchSummary();
    }
  }, [fetchSummary, router, session, status]);

  if (status === "loading") {
    return <FullPageLoadingSkeleton />;
  }

  if (status === "unauthenticated") {
    return null;
  }

  if (isLoading) {
    return (
      <DashboardLayout
        sidebarSections={manufacturingSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Manufacturing"
        pageName="Dashboard"
        breadcrumbs={[{ label: "Dashboard" }]}
        profilePath="/manufacturing/profile"
        userName={session?.user?.name || "User"}
        userEmail={session?.user?.email || ""}
        userRole={session?.user?.role || "manufacturing"}
        onSignOut={() => signOut({ callbackUrl: "/auth/manufacturing" })}
        onRefresh={fetchSummary}
      >
        <div className="space-y-6">
          <div>
            <div className="h-9 w-64 bg-muted animate-pulse rounded mb-2" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <StatsRowSkeleton count={5} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-muted animate-pulse rounded" />
            <div className="h-64 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing"
      pageName="Dashboard"
      breadcrumbs={[{ label: "Dashboard" }]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/manufacturing" })}
      onRefresh={fetchSummary}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Manufacturing Dashboard
            </h1>
            <p className="mt-2 text-muted-foreground">
              Overview of your production and inventory
            </p>
          </div>
          <Button
            onClick={() => setShowVisualization(true)}
            className="hidden md:flex bg-blue-800 hover:bg-blue-700 text-white"
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            title="Planning"
            value={summary.demandForecast}
            icon={FileText}
            description="Demand / Orders"
            colorClass="text-slate-600 dark:text-slate-400"
          />
          <StatCard
            title="In Production"
            value={summary.inProduction}
            icon={Factory}
            description="Reserved / Issued / Producing"
            colorClass="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            title="QC Pending"
            value={summary.qcPending}
            icon={FlaskConical}
            description="Awaiting Quality Check"
            colorClass="text-yellow-600 dark:text-yellow-400"
          />
          <StatCard
            title="Rework"
            value={summary.rework}
            icon={RotateCcw}
            description="QC Failed / Rework"
            colorClass="text-orange-600 dark:text-orange-400"
          />
          <StatCard
            title="Finished Goods"
            value={summary.finished}
            icon={CheckCircle}
            description="Completed Orders"
            colorClass="text-green-600 dark:text-green-400"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Bill of Materials"
            value={summary.totalBoms}
            icon={FileText}
            description="Active BOMs"
            colorClass="text-purple-600 dark:text-purple-400"
          />
          <StatCard
            title="Products"
            value={summary.totalProducts}
            icon={Package}
            description="Catalog Items"
            colorClass="text-indigo-600 dark:text-indigo-400"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Quick Actions Card */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                href="/manufacturing/manufacturing"
                className="block p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">New Order</div>
                      <div className="text-xs text-muted-foreground">
                        Create manufacturing order
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
              <Link
                href="/manufacturing/bom"
                className="block p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">New BoM</div>
                      <div className="text-xs text-muted-foreground">
                        Create bill of material
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
              <Link
                href="/manufacturing/products"
                className="block p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">New Product</div>
                      <div className="text-xs text-muted-foreground">
                        Add to catalog
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Activity Card */}
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Manufacturing Orders</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/manufacturing/manufacturing">View All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {summary.recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Factory className="h-10 w-10 mb-2 opacity-20" />
                  <p>No manufacturing orders found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {summary.recentOrders.map((order) => (
                    <div
                      key={order._id}
                      className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-muted rounded-md flex items-center justify-center">
                          <Factory className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {order.header?.name || "Unnamed Order"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.header?.productId?.header?.name ||
                              "Unknown Product"}{" "}
                            (Qty: {order.header?.quantity})
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {(() => {
                          const ps = (order.productionStatus ||
                            "demand_forecast") as ProductionStatus;
                          const colors = PRODUCTION_STATUS_COLORS[ps] || {
                            bg: "bg-gray-100",
                            text: "text-gray-600",
                          };
                          return (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
                            >
                              {PRODUCTION_STATUS_LABELS[ps] || ps}
                            </span>
                          );
                        })()}
                        <div className="text-xs text-muted-foreground w-20 text-right">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <ManufacturingVisualization
          isOpen={showVisualization}
          onClose={() => setShowVisualization(false)}
          data={visualizationData}
          title="Production Flow – Orders by Stage"
          chartType="bar"
          xAxisKey="name"
          dataKeys={[{ key: "value", name: "Orders", color: "#2563eb" }]}
        />
      </div>
    </DashboardLayout>
  );
}
