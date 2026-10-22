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

export default function InventoryDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [isLoading, setIsLoading] = useState(false);

  // Module-specific parameters for Inventory
  const inventoryStats = {
    totalValuation: 184200000, // ₹18.42 Cr
    valuationChange: 4.2,
    activeSKUs: 14820,
    skuStockRate: 96.4,
    warehouseCapacity: 84.6,
    lowStockCount: 28,
    outOfStockCount: 6,
    stockTurnoverRatio: 4.8,
    inboundToday: 420,
    outboundToday: 680,
  };

  const valuationByCategory = [
    { name: "Raw Materials", value: 72000000 },
    { name: "Finished Goods", value: 58000000 },
    { name: "Work In Progress (WIP)", value: 41000000 },
    { name: "Packaging Supplies", value: 13200000 },
  ];

  const warehouseCapacities = [
    { name: "Gurgaon Central DC", used: 94, capacity: "12,000 pallets", status: "Near Limit", color: BRAND_COLORS.accent.red },
    { name: "Mumbai Hub B-4", used: 88, capacity: "18,500 pallets", status: "Optimal", color: BRAND_COLORS.accent.yellow },
    { name: "Bangalore Logistics Park", used: 74, capacity: "15,000 pallets", status: "Healthy", color: BRAND_COLORS.accent.blue },
    { name: "Chennai Port Depot", used: 62, capacity: "8,000 pallets", status: "Available", color: BRAND_COLORS.accent.green },
  ];

  const criticalStockAlerts = [
    {
      sku: "SKU-RAW-902",
      name: "High-Tensile Aluminum Ingot (Grade 6061)",
      category: "Raw Material",
      onHand: 140,
      safetyStock: 500,
      unit: "KG",
      leadDays: "3 Days",
      severity: "CRITICAL",
    },
    {
      sku: "SKU-PKG-412",
      name: "Anti-Static Polymer Enclosure 240V",
      category: "Packaging",
      onHand: 65,
      safetyStock: 250,
      unit: "Units",
      leadDays: "2 Days",
      severity: "HIGH",
    },
    {
      sku: "SKU-CMP-108",
      name: "Precision Micro-Actuator Stepper Motor",
      category: "Component",
      onHand: 18,
      safetyStock: 120,
      unit: "Units",
      leadDays: "7 Days",
      severity: "CRITICAL",
    },
    {
      sku: "SKU-FIN-784",
      name: "Opto-Sensor Core Module Mk III",
      category: "Finished Good",
      onHand: 42,
      safetyStock: 100,
      unit: "Units",
      leadDays: "4 Days",
      severity: "MEDIUM",
    },
    {
      sku: "SKU-RAW-304",
      name: "Silicone Thermal Conductive Paste",
      category: "Chemical Raw",
      onHand: 8,
      safetyStock: 40,
      unit: "Liters",
      leadDays: "5 Days",
      severity: "HIGH",
    },
  ];

  const recentMovements = [
    {
      id: "GRN-2026-1402",
      type: "Inbound Receipt",
      partner: "Vedanta Metals Consortium",
      warehouse: "Gurgaon Central DC",
      units: "1,250 KG",
      time: "24 mins ago",
      status: "Verified",
    },
    {
      id: "DO-2026-9844",
      type: "Outbound Dispatch",
      partner: "Adani Solar Logistics",
      warehouse: "Mumbai Hub B-4",
      units: "480 Units",
      time: "1 hour ago",
      status: "In Transit",
    },
    {
      id: "TRA-2026-0518",
      type: "Inter-Warehouse Transfer",
      partner: "Internal Transit (Chennai -> BLR)",
      warehouse: "Bangalore Park",
      units: "320 Units",
      time: "3 hours ago",
      status: "Completed",
    },
    {
      id: "GRN-2026-1401",
      type: "Inbound Receipt",
      partner: "Murata Electronics Ltd",
      warehouse: "Bangalore Park",
      units: "2,400 Units",
      time: "5 hours ago",
      status: "Inspected",
    },
  ];

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
                {formatCurrency(inventoryStats.totalValuation)}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-500 font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>+{inventoryStats.valuationChange}% vs last fiscal period</span>
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
                {inventoryStats.activeSKUs.toLocaleString()}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>{inventoryStats.skuStockRate}% in-stock fulfillment rate</span>
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
                <span>Warehouse Capacity</span>
                <span className="p-1.5 bg-yellow-500/10 text-yellow-500 rounded border border-yellow-500/20">
                  <Warehouse className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {inventoryStats.warehouseCapacity}%
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-yellow-500 font-semibold">
                <span>Across 4 regional logistics hubs</span>
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
                {inventoryStats.lowStockCount} SKUs
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-red-400 font-semibold">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>{inventoryStats.outOfStockCount} zero-stock items pending PO</span>
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
                <DailyBrickBarChart height={340} />
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
                <CanvasPieChart
                  data={valuationByCategory}
                  title="Stock Portfolio"
                  colors={BRAND_ACCENT_PALETTE}
                />
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
                {warehouseCapacities.map((wh, idx) => (
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
                ))}
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
                  <Link href="/inventory/alerts">All Alerts ({inventoryStats.lowStockCount})</Link>
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
                      {criticalStockAlerts.map((item, i) => (
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
                      ))}
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
                  {recentMovements.map((move, i) => (
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
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
