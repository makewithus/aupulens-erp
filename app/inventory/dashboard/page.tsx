"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Warehouse,
  AlertTriangle,
  ArrowDownToLine,
  Truck,
  Layers,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Boxes,
  Plus,
  RefreshCw,
  ShieldAlert,
  ArrowLeftRight,
} from "lucide-react";
import { DailyBrickBarChart } from "@/components/charts/DailyBrickBarChart";
import { CanvasPieChart } from "@/components/inventory/CanvasCharts";
import { useThemeStore } from "@/store/themeStore";
import { BRAND_COLORS, BRAND_ACCENT_PALETTE } from "@/lib/constants/brandColors";
import { cn } from "@/lib/utils";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";

export default function InventoryDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const cachedSum = getInstantCachedData<any>("/api/inventory/summary");
  const cachedMoves = getInstantCachedData<any>("/api/inventory/stock-moves");
  const cachedWh = getInstantCachedData<any>("/api/inventory/warehouse");
  const cachedAlerts = getInstantCachedData<any>("/api/inventory/alerts");

  const [isLoading, setIsLoading] = useState<boolean>(() => !cachedSum);

  const initS = cachedSum?.summary;
  const initItems = initS?.totalItems?.current ?? 0;
  const initLow = initS?.lowStock?.current ?? 0;

  // Live Module Parameters for Inventory
  const [stats, setStats] = useState(() => ({
    totalValuation: initS?.totalValue?.current ?? 0,
    valuationChange: 0,
    activeSKUs: initItems,
    skuStockRate: initItems > 0 ? Math.max(0, 100 - Math.round((initLow / initItems) * 100)) : 0,
    warehouseCapacity: 0,
    lowStockCount: initLow,
    outOfStockCount: 0,
    stockTurnoverRatio: 0,
    inboundToday: initS?.operations?.receipts ?? 0,
    outboundToday: initS?.operations?.deliveries ?? 0,
  }));
  const inventoryStats = stats;

  const [valuationByCategory, setValuationByCategory] = useState<any[]>([]);
  const [warehouseCapacities, setWarehouseCapacities] = useState<any[]>(() => {
    const whList = cachedWh?.data || cachedWh?.warehouses || (Array.isArray(cachedWh) ? cachedWh : []);
    const palette = [BRAND_COLORS.accent.green, BRAND_COLORS.accent.blue, BRAND_COLORS.accent.yellow, BRAND_COLORS.accent.purple];
    return whList.map((wh: any, i: number) => ({
      name: wh.name || wh.warehouseCode || `Hub ${i + 1}`,
      used: wh.occupancyRate || wh.capacityPercentage || 0,
      capacity: wh.totalCapacity ? `${wh.totalCapacity} pallets` : "Configured",
      status: (wh.occupancyRate || 0) > 90 ? "Near Limit" : "Operational",
      color: palette[i % palette.length],
    }));
  });
  const [criticalStockAlerts, setCriticalStockAlerts] = useState<any[]>([]);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);
  const [stockMoves, setStockMoves] = useState<any[]>(() => cachedMoves?.items ?? []);

  useEffect(() => {
    let isMounted = true;
    async function fetchJson(url: string) {
      try {
        const r = await cachedFetch(url);
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    }

    async function loadInventoryData() {
      try {
        setIsLoading(true);
        const [summaryRes, movesRes, whRes, alertsRes] = await Promise.allSettled([
          fetchJson("/api/inventory/summary"),
          fetchJson("/api/inventory/stock-moves"),
          fetchJson("/api/inventory/warehouse"),
          fetchJson("/api/inventory/alerts"),
        ]);

        if (!isMounted) return;

        // 1. Summary
        if (summaryRes.status === "fulfilled" && summaryRes.value?.summary) {
          const s = summaryRes.value.summary;
          const totalItems = s.totalItems?.current || 0;
          const lowStock = s.lowStock?.current || 0;
          setStats((prev) => ({
            ...prev,
            totalValuation: s.totalValue?.current || 0,
            activeSKUs: totalItems,
            lowStockCount: lowStock,
            inboundToday: s.operations?.receipts || 0,
            outboundToday: s.operations?.deliveries || 0,
            skuStockRate: totalItems > 0 ? Math.max(0, 100 - Math.round((lowStock / totalItems) * 100)) : 0,
          }));
        }

        // 2. Stock Moves
        if (movesRes.status === "fulfilled" && movesRes.value?.items) {
          const moves = movesRes.value.items;
          setStockMoves(moves);
          setRecentMovements(
            moves.slice(0, 5).map((m: any) => ({
              id: m.reference || m._id?.slice(-8) || "SM-MOVE",
              type: m.moveType === "incoming" ? "Inbound Receipt" : m.moveType === "outgoing" ? "Outbound Dispatch" : "Internal Transfer",
              partner: m.partnerName || m.responsibleId?.name || "Warehouse Staff",
              warehouse: m.sourceLocation?.warehouseId?.name || m.destinationLocation?.warehouseId?.name || "Main Warehouse",
              units: `${Array.isArray(m.lines) ? m.lines.reduce((acc: number, l: any) => acc + (l.demand || l.quantity || 1), 0) : 1} Units`,
              time: m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "Recent",
              status: m.moveStatus || "Done",
            }))
          );
        }

        // 3. Warehouses
        if (whRes.status === "fulfilled") {
          const whList = whRes.value?.data || whRes.value?.warehouses || (Array.isArray(whRes.value) ? whRes.value : []);
          const palette = [BRAND_COLORS.accent.green, BRAND_COLORS.accent.blue, BRAND_COLORS.accent.yellow, BRAND_COLORS.accent.purple];
          setWarehouseCapacities(
            whList.map((wh: any, i: number) => ({
              name: wh.name || wh.warehouseCode || `Hub ${i + 1}`,
              used: wh.occupancyRate || wh.capacityPercentage || 0,
              capacity: wh.totalCapacity ? `${wh.totalCapacity} pallets` : "Configured",
              status: (wh.occupancyRate || 0) > 90 ? "Near Limit" : "Operational",
              color: palette[i % palette.length],
            }))
          );
        }

        // 4. Alerts
        if (alertsRes.status === "fulfilled") {
          const alertsList = alertsRes.value?.items || alertsRes.value?.data || (Array.isArray(alertsRes.value) ? alertsRes.value : []);
          setCriticalStockAlerts(
            alertsList.slice(0, 5).map((a: any) => ({
              sku: a.itemCode || a.sku || "SKU-ALERT",
              name: a.name || "Stock Item",
              category: a.category || "General",
              onHand: a.quantity ?? 0,
              safetyStock: a.reorderLevel ?? a.minStockLevel ?? 10,
              unit: a.unit || "Units",
              leadDays: a.leadTimeDays ? `${a.leadTimeDays} Days` : "3 Days",
              severity: (a.quantity ?? 0) === 0 ? "CRITICAL" : "HIGH",
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load inventory dashboard data:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadInventoryData();
    const handleRevalidated = (e: any) => {
      if (e?.detail?.url?.includes("/api/inventory")) {
        loadInventoryData();
      }
    };
    window.addEventListener("aup:revalidated", handleRevalidated);
    return () => {
      isMounted = false;
      window.removeEventListener("aup:revalidated", handleRevalidated);
    };
  }, []);

  const dailyThroughputData = useMemo(() => {
    if (!stockMoves || stockMoves.length === 0) {
      return [];
    }
    const countsByDate = new Map<string, number>();
    for (const move of stockMoves) {
      const d = move.scheduledDate || move.createdAt;
      if (!d) continue;
      const dateStr = new Date(d).toISOString().slice(0, 10);
      const totalUnits = Array.isArray(move.lines)
        ? move.lines.reduce((s: number, l: any) => s + (l.demand || l.quantity || 1), 0)
        : 1;
      countsByDate.set(dateStr, (countsByDate.get(dateStr) || 0) + totalUnits);
    }
    return Array.from(countsByDate.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  }, [stockMoves]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Executive Dashboard"
      pageName="Inventory Dashboard"
      breadcrumbs={[{ label: "Inventory", href: "/inventory/dashboard" }, { label: "Executive Dashboard" }]}
      userName={session?.user?.name || "Inventory Head"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-8 min-w-0 max-w-full font-mono">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Stock & Warehouse Telemetry
              </span>
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                Real-Time Valuation
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
              Inventory Operational Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Live enterprise parameters tracking valuation, warehouse capacity, replenishment velocity, and stockout prevention.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="text-xs font-mono h-9 gap-1.5 bg-[#8AE06C] hover:bg-[#78cf5a] text-[#0A0A0A] font-bold shadow-sm"
            >
              <Link href="/inventory/operations/receipts">
                <Plus className="w-3.5 h-3.5" />
                Inward Receipt (GRN)
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
              <Link href="/inventory/operations/deliveries">
                <Truck className="w-3.5 h-3.5" />
                Dispatch Delivery
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
              <Link href="/inventory/stock-moves">
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Stock Moves
              </Link>
            </Button>
          </div>
        </div>

        {/* 4 Primary Inventory KPI Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Inventory Valuation */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Total Inventory Valuation</span>
                <span className="p-1.5 bg-emerald-500/10 text-emerald-500 rounded border border-emerald-500/20">
                  <Package className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {formatCurrency(stats.totalValuation)}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-500 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{stats.totalValuation > 0 ? "Real-time ledger asset balance" : "No asset balance recorded"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Catalog SKUs */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Active SKU Catalog</span>
                <span className="p-1.5 bg-blue-500/10 text-blue-500 rounded border border-blue-500/20">
                  <Boxes className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {stats.activeSKUs.toLocaleString()}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>{stats.skuStockRate}% in-stock fulfillment rate</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Warehouse Capacity */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Warehouse Hubs</span>
                <span className="p-1.5 bg-yellow-500/10 text-yellow-500 rounded border border-yellow-500/20">
                  <Warehouse className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {warehouseCapacities.length} Registered
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-yellow-500 font-semibold">
                <span>{warehouseCapacities.length > 0 ? "Active facility network" : "No warehouses created"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Critical Stockout Risk */}
          <Card
            className={cn(
              "border border-border/60 shadow-sm",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
                <span>Low Stock / Critical Alerts</span>
                <span className="p-1.5 bg-red-500/10 text-red-500 rounded border border-red-500/20">
                  <AlertTriangle className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-red-500">
                {stats.lowStockCount} SKUs
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-red-400 font-semibold">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{stats.lowStockCount > 0 ? "Items requiring replenishment" : "Zero critical stockout risks"}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 2: Visual Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Daily Goods Movement Throughput (DailyBrickBarChart) */}
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
                    <span className="w-2 h-2 rounded-full bg-[#8AE06C] animate-pulse" />
                    <CardTitle className="text-base font-bold">
                      Daily Inbound vs Outbound Velocity (Units Moved)
                    </CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    High-density throughput bricks indicating daily warehouse goods intake vs fulfillment dispatches.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#8AE06C]" />
                    <span className="text-muted-foreground">Inbound (GRN)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#6CADF5]" />
                    <span className="text-muted-foreground">Outbound (Dispatch)</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <DailyBrickBarChart
                  height={340}
                  colorTheme="emerald"
                  metricLabel="Stock Units Moved"
                  data={dailyThroughputData}
                  valueKey="count"
                />
              </CardContent>
            </Card>
          </div>

          {/* Category Valuation Breakdown (CanvasPieChart) */}
          <div className="lg:col-span-4">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full flex flex-col justify-between",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60">
                <CardTitle className="text-base font-bold">
                  Valuation by Category
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Portfolio balance between raw material, WIP, and finished stock.
                </p>
              </CardHeader>
              <CardContent className="p-5 flex-1 flex flex-col justify-center items-center">
                {valuationByCategory.some((d) => d.value > 0) ? (
                  <CanvasPieChart
                    data={valuationByCategory}
                    title="Stock Portfolio"
                    colors={BRAND_ACCENT_PALETTE}
                  />
                ) : (
                  <div className="py-12 text-center text-xs text-muted-foreground font-mono">
                    No catalog item valuations recorded yet
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section 3: Warehouse Hub Capacity & Critical Reorders */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Warehouse Capacities */}
          <div className="lg:col-span-5">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60">
                <CardTitle className="text-base font-bold">
                  Regional Warehouse Utilization
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Live occupancy and pallet capacity limits across strategic nodes.
                </p>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {warehouseCapacities.length > 0 ? (
                  warehouseCapacities.map((wh, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-foreground">{wh.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{wh.capacity}</span>
                          <span
                            className="px-1.5 py-0.2 rounded text-[10px] font-bold"
                            style={{
                              backgroundColor: `${wh.color}20`,
                              color: wh.color,
                              border: `1px solid ${wh.color}40`,
                            }}
                          >
                            {wh.used}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-border/40 overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{ width: `${wh.used}%`, backgroundColor: wh.color }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-xs text-muted-foreground font-mono">
                    No warehouses configured for this organization.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Critical Stock Alerts Table */}
          <div className="lg:col-span-7">
            <Card
              className={cn(
                "border border-border/60 shadow-sm h-full",
                isDark ? "bg-[#161616]" : "bg-card"
              )}
            >
              <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-red-500 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Critical Stockout Risk Queue
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Items falling below calculated safety buffer thresholds.
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="text-xs font-mono h-8 border-border/60"
                >
                  <Link href="/inventory/alerts">All Alerts ({stats.lowStockCount})</Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs font-mono">
                    <thead className="border-b border-border/60 text-muted-foreground bg-muted/20">
                      <tr>
                        <th className="p-3 pl-5 whitespace-nowrap">SKU / Item</th>
                        <th className="p-3 whitespace-nowrap">Category</th>
                        <th className="p-3 whitespace-nowrap">On-Hand</th>
                        <th className="p-3 whitespace-nowrap">Min Buffer</th>
                        <th className="p-3 whitespace-nowrap">Lead Time</th>
                        <th className="p-3 pr-5 text-right whitespace-nowrap">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {criticalStockAlerts.length > 0 ? (
                        criticalStockAlerts.map((item, i) => (
                          <tr key={i} className="hover:bg-muted/10 transition-colors">
                            <td className="p-3 pl-5 whitespace-nowrap">
                              <div className="font-bold text-foreground">{item.sku}</div>
                              <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                {item.name}
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">{item.category}</td>
                            <td className={cn("p-3 font-bold whitespace-nowrap", isDark ? "text-red-400" : "text-rose-600")}>
                              {item.onHand} {item.unit}
                            </td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">
                              {item.safetyStock} {item.unit}
                            </td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">{item.leadDays}</td>
                            <td className="p-3 pr-5 text-right whitespace-nowrap">
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "h-7 text-[10px] font-mono",
                                  isDark
                                    ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                                    : "border-rose-300 text-rose-700 hover:bg-rose-50"
                                )}
                                onClick={() => router.push("/finance/purchase-orders")}
                              >
                                Reorder
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-muted-foreground font-mono">
                            No critical stockouts or low stock alerts detected.
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

        {/* Section 4: Recent Movements & Receipts */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardHeader className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold">
                Recent Receipts, Dispatches & Movements
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time chronological log of dock transactions and material transfers.
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="text-xs font-mono h-8 border-border/60 self-start sm:self-auto"
            >
              <Link href="/inventory/stock-moves">View Full Audit Log</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs font-mono">
                <thead className="border-b border-border/60 text-muted-foreground bg-muted/20">
                  <tr>
                    <th className="p-3 pl-5 whitespace-nowrap">Doc Reference</th>
                    <th className="p-3 whitespace-nowrap">Operation Type</th>
                    <th className="p-3 whitespace-nowrap">Partner / Origin</th>
                    <th className="p-3 whitespace-nowrap">Warehouse Hub</th>
                    <th className="p-3 whitespace-nowrap">Quantity</th>
                    <th className="p-3 whitespace-nowrap">Timestamp</th>
                    <th className="p-3 pr-5 text-right whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {recentMovements.length > 0 ? (
                    recentMovements.map((move, i) => (
                      <tr key={i} className="hover:bg-muted/10 transition-colors">
                        <td className="p-3 pl-5 font-bold text-foreground whitespace-nowrap">{move.id}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[10px] font-semibold border",
                              move.type.includes("Inbound")
                                ? isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-300"
                                : move.type.includes("Outbound")
                                ? isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "bg-blue-50 text-blue-700 border-blue-300"
                                : isDark ? "bg-purple-500/10 text-purple-400 border-purple-500/30" : "bg-purple-50 text-purple-700 border-purple-300"
                            )}
                          >
                            {move.type}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{move.partner}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{move.warehouse}</td>
                        <td className="p-3 font-semibold text-foreground whitespace-nowrap">{move.units}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{move.time}</td>
                        <td className="p-3 pr-5 text-right whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-mono text-[10px]",
                              isDark ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" : "border-emerald-300 text-emerald-700 bg-emerald-50"
                            )}
                          >
                            {move.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground font-mono">
                        No recent stock movements recorded for this organization.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
