"use client";

import { useState } from "react";
import { DailyBrickBarChart, generate365DailyData } from "@/components/charts/DailyBrickBarChart";
import { TradingLineChart } from "@/components/charts/TradingLineChart";
import { CanvasBarChart, CanvasComposedChart, CanvasPieChart } from "@/components/inventory/CanvasCharts";
import { PipelineTrendChart } from "@/components/crm/PipelineTrendChart";
import { RevenueTrendChart } from "@/components/crm/RevenueTrendChart";
import { CampaignROIChart } from "@/components/crm/CampaignROIChart";
import { UpcomingRenewalsChart } from "@/components/crm/UpcomingRenewalsChart";
import { SupportPerformanceChart } from "@/components/crm/SupportPerformanceChart";
import { ChurnRiskChart } from "@/components/crm/ChurnRiskChart";
import { FinanceVisualization } from "@/components/finance/FinanceVisualization";
import { DraggableVisualization } from "@/components/finance/DraggableVisualization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, LineChart as LineChartIcon, PieChart, Layers, ExternalLink, Sparkles, Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

export default function ChartsDemoPage() {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme !== "light";
  const [showDraggable, setShowDraggable] = useState(false);
  const [draggableChartType, setDraggableChartType] = useState<"bar" | "line">("bar");

  // Demo inventory canvas data
  const warehouseUtilizationData = [
    { warehouse: "Mumbai Central Hub", utilization: 76, capacity: 15000, used: 11400 },
    { warehouse: "Bhiwandi Ctr", utilization: 79, capacity: 25000, used: 19800 },
    { warehouse: "Pune Depot", utilization: 61, capacity: 8000, used: 4900 },
    { warehouse: "Ahmedabad Park", utilization: 68, capacity: 12000, used: 8200 },
    { warehouse: "Bengaluru South", utilization: 78, capacity: 18000, used: 14200 },
  ];

  const stockByWarehouseData = [
    { warehouse: "Mumbai Central", totalItems: 240, totalQuantity: 14200, totalValue: 4800 },
    { warehouse: "Bhiwandi Ctr", totalItems: 380, totalQuantity: 28900, totalValue: 9200 },
    { warehouse: "Pune Depot", totalItems: 160, totalQuantity: 9400, totalValue: 3100 },
    { warehouse: "Ahmedabad Park", totalItems: 190, totalQuantity: 11200, totalValue: 3900 },
    { warehouse: "Bengaluru South", totalItems: 290, totalQuantity: 19800, totalValue: 6700 },
  ];

  const topItemsData = [
    { name: "Ball Bearing 6205", quantity: 3450, value: 1449 },
    { name: "Industrial Film Roll", quantity: 1820, value: 1547 },
    { name: "Gear Lubricant ISO 220", quantity: 950, value: 1140 },
    { name: "Control Valve Solenoid", quantity: 780, value: 2652 },
    { name: "Ergonomic Task Chair", quantity: 640, value: 4160 },
    { name: "Pallet Rack Unit", quantity: 420, value: 4116 },
    { name: "Induction Motor 7.5HP", quantity: 210, value: 5985 },
    { name: "Solar Inverter 5kW", quantity: 180, value: 7560 },
  ];

  return (
    <div className={`min-h-screen font-mono p-4 md:p-8 transition-colors ${isDark ? "bg-[#09090b] text-[#f4f4f5]" : "bg-[#f8fafc] text-[#0f172a]"}`}>
      {/* Top Banner Header */}
      <header className="max-w-7xl mx-auto mb-8 border-b border-border/60 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Styling Verification Suite
            </span>
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-primary/10 text-primary border border-primary/20">
              Interactive Live Testing
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Aupulens ERP — Complete Charts Showcase
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            Inspect all daily 365-day discrete segmented brick bar charts and Binance/TradingView interactive line charts across all ERP modules with temporary high-fidelity demonstration seed data.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="text-xs font-mono h-9 gap-1.5"
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
            {isDark ? "Light Mode" : "Dark Mode"}
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setDraggableChartType("bar");
              setShowDraggable(true);
            }}
            className="text-xs font-mono h-9 gap-1.5 bg-primary hover:bg-primary/90"
          >
            <Layers className="w-3.5 h-3.5" />
            Open Draggable Modal
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-10">
        {/* ========================================================================= */}
        {/* 1. ENTERPRISE INTERACTIVE LINE CHART SHOWCASE                             */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-l-4 border-white pl-3">
            <div>
              <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
                <LineChartIcon className="w-4 h-4 text-white" />
                1. Enterprise Interactive Line Chart
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Features: <b>Mouse-wheel zoom in/out</b>, <b>drag-to-pan</b>, timeframe buttons (<b>7D, 14D, 30D, 90D, 180D, 1Y, ALL</b>), <b>custom days input</b>, double-click to reset, and real-time hover crosshairs.
              </p>
            </div>
            <span className="text-[10px] font-mono text-white bg-white/10 px-2 py-1 border border-white/20">
              730-Day Historical Range
            </span>
          </div>

          <Card className="rounded-none border-border/40 shadow-none overflow-hidden">
            <CardContent className="p-0">
              <TradingLineChart
                title="CONSOLIDATED REVENUE & CASHFLOW (2-YEAR TIMELINE)"
                metricLabel="Net Revenue"
                currencyPrefix="₹"
                colorTheme="white"
                height={460}
              />
            </CardContent>
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 2. 365-DAY DISCRETE SEGMENTED BRICK BAR CHART SHOWCASE                    */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-l-4 border-slate-300 pl-3">
            <div>
              <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-white" />
                2. 365-Day Daily Segmented Brick Bar Chart
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Tracks each of the 365 days individually. Features <b>mouse-wheel zoom in/out</b>, <b>drag-to-pan</b>, discrete horizontal brick slices, hover tooltips showing date and value, and ERP theme markers.
              </p>
            </div>
            <span className="text-[10px] font-mono text-white bg-white/10 px-2 py-1 border border-white/20">
              365 Individual Daily Bricks
            </span>
          </div>

          <Card className="rounded-none border-border/40 shadow-none p-4">
            <DailyBrickBarChart
              metricLabel="Daily Throughput Units"
              valueKey="value"
              colorTheme="white"
              yAxisFormatter={(v) => `${v} units`}
              tooltipValueFormatter={(v) => `${v.toLocaleString()} units`}
              height={280}
            />
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 3. INVENTORY CANVAS CHARTS (SEGMENTED BRICKS + COMPOSED)                  */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="border-l-4 border-blue-500 pl-3">
            <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              3. Inventory Canvas Charts (Vertical & Horizontal Segmented Bricks)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Used on <code>/inventory/analytics</code> for warehouse utilization, top items, and composed stock levels.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Warehouse Utilization - Vertical Segmented Brick Bar */}
            <Card className="rounded-none border-border/40 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Warehouse Utilization (%) — Vertical Segmented Brick Bar
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <CanvasBarChart
                  data={warehouseUtilizationData}
                  xAxisKey="warehouse"
                  series={[{ key: "utilization", name: "Utilization %", color: "#3b82f6" }]}
                  layout="vertical"
                  isDark={isDark}
                />
              </CardContent>
            </Card>

            {/* Top Items by Quantity - Horizontal Segmented Brick Bar */}
            <Card className="rounded-none border-border/40 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Top Stock Items — Horizontal Segmented Brick Bar
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <CanvasBarChart
                  data={topItemsData}
                  xAxisKey="name"
                  series={[
                    { key: "quantity", name: "Quantity", color: "#3b82f6" },
                    { key: "value", name: "Value (₹K)", color: "#10b981" },
                  ]}
                  layout="horizontal"
                  isDark={isDark}
                />
              </CardContent>
            </Card>
          </div>

          {/* Stock Levels by Warehouse - Composed Segmented Bricks + Line */}
          <Card className="rounded-none border-border/40 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stock Levels by Warehouse — Composed Brick Stack + Trend Line
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <CanvasComposedChart
                data={stockByWarehouseData}
                xAxisKey="warehouse"
                barSeries={[
                  { key: "totalItems", name: "Total Items", color: "#3b82f6" },
                  { key: "totalQuantity", name: "Total Quantity", color: "#10b981" },
                ]}
                lineSeries={{ key: "totalValue", name: "Value (₹K)", color: "#f59e0b" }}
                isDark={isDark}
              />
            </CardContent>
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 4. CRM REPORTS CHARTS SHOWCASE                                            */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="border-l-4 border-violet-500 pl-3">
            <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              4. CRM Intelligence & Analytics Reports Charts
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Used on <code>/crm/reports</code>: Sales Pipeline Trend, Cumulative Revenue, Campaign ROI, Renewals, Support, Churn.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PipelineTrendChart />
            <RevenueTrendChart />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CampaignROIChart />
            <UpcomingRenewalsChart />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SupportPerformanceChart />
            <div className="border border-border/40 p-6 flex flex-col justify-center items-center">
              <div className="w-full mb-3 text-left">
                <h3 className="text-lg font-normal uppercase">Customer Churn Risk Distribution</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Account health risk cohorts breakdown</p>
              </div>
              <ChurnRiskChart />
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 5. FINANCE DATA VISUALIZATION COMPONENT                                   */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="border-l-4 border-emerald-500 pl-3">
            <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              5. Finance Multi-Mode Visualization (Switch Between Brick Bar, Line, Pie)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Select any data source and switch between Bar Chart (Discrete Bricks), Line Chart (Binance Style), or Pie Chart.
            </p>
          </div>

          <FinanceVisualization
            availableDataTypes={[
              { value: "revenue-expenses", label: "Revenue vs Expenses" },
              { value: "cashflow", label: "Cash Flow Inflow/Outflow" },
              { value: "category-breakdown", label: "Expense Breakdown by Category" },
              { value: "receivables-payables", label: "Receivables vs Payables" },
            ]}
            defaultDataType="revenue-expenses"
            defaultChartType="bar"
            title="Finance Operational Analytics"
          />
        </section>
      </main>

      {/* Floating Draggable Visualization Modal */}
      {showDraggable && (
        <DraggableVisualization
          isOpen={showDraggable}
          onClose={() => setShowDraggable(false)}
          data={[]}
          title="Draggable Chart Inspection Modal"
          chartType={draggableChartType}
          xAxisKey="date"
          dataKeys={[{ key: "value", name: "Movement Volume", color: "#3b82f6" }]}
        />
      )}
    </div>
  );
}
