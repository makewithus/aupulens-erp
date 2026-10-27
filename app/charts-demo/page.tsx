"use client";

import { useState } from "react";
import { DailyBrickBarChart } from "@/components/charts/DailyBrickBarChart";
import { TradingLineChart } from "@/components/charts/TradingLineChart";
import { CanvasBarChart, CanvasComposedChart } from "@/components/inventory/CanvasCharts";
import { TopModulesShowcase } from "@/components/charts/TopModulesBarChart";
import { SubsystemTransactionVolumeChart } from "@/components/crm/SubsystemTransactionVolumeChart";
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
import { BarChart3, LineChart as LineChartIcon, Layers, Sparkles, Moon, Sun, Activity } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "min-h-screen font-mono p-4 md:p-8 transition-colors duration-200",
        isDark ? "bg-[#0A0A0A] text-[#F2F2F2]" : "bg-[#f8fafc] text-[#0f172a]"
      )}
    >
      {/* Top Banner Header */}
      <header className="max-w-7xl mx-auto mb-8 border-b border-[#272727]/60 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-[#A77DFF]/15 text-[#A77DFF] border border-[#A77DFF]/30">
              Aupulens Brand Color System
            </span>
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-[#8AE06C]/15 text-[#8AE06C] border border-[#8AE06C]/30">
              High-Contrast Readability
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Aupulens ERP — Complete Charts Showcase
          </h1>
          <p className="text-xs text-[#757575] mt-1 max-w-3xl">
            Inspecting interactive line charts, clean solid bar charts, and branded architecture visualizations with 100% readability in both light &amp; dark mode.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className={cn(
              "text-xs font-mono h-9 gap-1.5 border shadow-sm transition-colors",
              isDark
                ? "bg-[#161616] border-[#272727] text-[#F2F2F2] hover:bg-[#272727]"
                : "bg-white border-[#e5e5e5] text-slate-800 hover:bg-slate-100"
            )}
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-[#F1DF38]" /> : <Moon className="w-3.5 h-3.5 text-[#A77DFF]" />}
            {isDark ? "Light Mode" : "Dark Mode"}
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setDraggableChartType("bar");
              setShowDraggable(true);
            }}
            className="text-xs font-mono h-9 gap-1.5 bg-[#A77DFF] hover:bg-[#9260ff] text-white shadow-sm"
          >
            <Layers className="w-3.5 h-3.5" />
            Open Draggable Modal
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-12">
        {/* ========================================================================= */}
        {/* 1. ENTERPRISE INTERACTIVE LINE CHART SHOWCASE                             */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-l-4 border-[#A77DFF] pl-3">
            <div>
              <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
                <LineChartIcon className="w-4 h-4 text-[#A77DFF]" />
                1. Enterprise Interactive Line Chart
              </h2>
              <p className="text-[11px] text-[#757575]">
                Features: <b>Mouse-wheel zoom in/out</b>, <b>drag-to-pan</b>, timeframe buttons (<b>7D, 14D, 30D, 90D, 180D, 1Y, ALL</b>), <b>custom days input</b>, double-click to reset, and real-time hover crosshairs.
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#A77DFF] bg-[#A77DFF]/10 px-2 py-1 border border-[#A77DFF]/20">
              730-Day Historical Range
            </span>
          </div>

          <Card className={cn(
            "rounded-none border shadow-none overflow-hidden transition-colors",
            isDark ? "bg-[#0A0A0A] border-[#272727]" : "bg-white border-[#e5e5e5]"
          )}>
            <CardContent className="p-0">
              <TradingLineChart
                title="CONSOLIDATED REVENUE & CASHFLOW (2-YEAR TIMELINE)"
                metricLabel="Net Revenue"
                currencyPrefix="₹"
                colorTheme="white"
                isDark={isDark}
                height={460}
              />
            </CardContent>
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 2. 365-DAY DISCRETE SEGMENTED BRICK BAR CHART SHOWCASE                    */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-l-4 border-[#A77DFF] pl-3">
            <div>
              <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#A77DFF]" />
                2. 365-Day Daily Segmented Brick Bar Chart
              </h2>
              <p className="text-[11px] text-[#757575]">
                Tracks each of the 365 days individually. Features <b>mouse-wheel zoom in/out</b>, <b>drag-to-pan</b>, discrete horizontal brick slices, hover tooltips showing date and value, and ERP theme markers.
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#A77DFF] bg-[#A77DFF]/10 px-2 py-1 border border-[#A77DFF]/20">
              365 Individual Daily Bricks
            </span>
          </div>

          <Card className={cn(
            "rounded-none border shadow-none p-4 transition-colors",
            isDark ? "bg-[#0A0A0A] border-[#272727]" : "bg-white border-[#e5e5e5]"
          )}>
            <DailyBrickBarChart
              metricLabel="Daily Throughput Units"
              valueKey="value"
              colorTheme="purple"
              isDark={isDark}
              yAxisFormatter={(v) => `${v.toLocaleString()} units`}
              tooltipValueFormatter={(v) => `${v.toLocaleString()} units`}
              height={300}
            />
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 3. BRAND ARCHITECTURE & WORKFLOW VOLUME (IMAGES 4 & 5 SHOWCASE)           */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-l-4 border-[#A77DFF] pl-3">
            <div>
              <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#A77DFF]" />
                3. Brand Enterprise Subsystems &amp; Workflow Metrics (Images 4 &amp; 5)
              </h2>
              <p className="text-[11px] text-[#757575]">
                Branded Purple Module Visualizations (Image 4 Top 10 Source/Target Modules) &amp; Subsystem Workflows Donut (Image 5).
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#A77DFF] bg-[#A77DFF]/10 px-2 py-1 border border-[#A77DFF]/20">
              Exact Brand Specification
            </span>
          </div>

          {/* Image 4: Top 10 Source Modules & Top 10 Target Modules */}
          <TopModulesShowcase />

          {/* Image 5: Subsystem Transaction Volume Donut */}
          <div className="grid grid-cols-1 gap-6">
            <SubsystemTransactionVolumeChart />
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. INVENTORY CANVAS CHARTS (SEGMENTED BRICKS + COMPOSED)                  */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="border-l-4 border-[#6CADF5] pl-3">
            <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#6CADF5]" />
              4. Inventory Canvas Charts (Vertical &amp; Horizontal Segmented Bricks)
            </h2>
            <p className="text-[11px] text-[#757575]">
              Used on <code>/inventory/analytics</code> for warehouse utilization, top stock items, and composed stock levels.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Warehouse Utilization - Vertical Segmented Brick Bar */}
            <Card className={cn(
              "rounded-none border shadow-sm transition-colors",
              isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-[#e5e5e5] text-slate-900"
            )}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#757575]">
                  Warehouse Utilization (%) — Vertical Segmented Brick Bar
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <CanvasBarChart
                  data={warehouseUtilizationData}
                  xAxisKey="warehouse"
                  series={[{ key: "utilization", name: "Utilization %", color: "#A77DFF" }]}
                  layout="vertical"
                  isDark={isDark}
                />
              </CardContent>
            </Card>

            {/* Top Items by Quantity - Horizontal Segmented Brick Bar */}
            <Card className={cn(
              "rounded-none border shadow-sm transition-colors",
              isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-[#e5e5e5] text-slate-900"
            )}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#757575]">
                  Top Stock Items — Horizontal Segmented Brick Bar
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <CanvasBarChart
                  data={topItemsData}
                  xAxisKey="name"
                  series={[
                    { key: "quantity", name: "Quantity", color: "#A77DFF" },
                    { key: "value", name: "Value (₹K)", color: "#8AE06C" },
                  ]}
                  layout="horizontal"
                  isDark={isDark}
                />
              </CardContent>
            </Card>
          </div>

          {/* Stock Levels by Warehouse - Composed Segmented Bricks + Line */}
          <Card className={cn(
            "rounded-none border shadow-sm transition-colors",
            isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-[#e5e5e5] text-slate-900"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#757575]">
                Stock Levels by Warehouse — Composed Brick Stack + Trend Line
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <CanvasComposedChart
                data={stockByWarehouseData}
                xAxisKey="warehouse"
                barSeries={[
                  { key: "totalItems", name: "Total Items", color: "#A77DFF" },
                  { key: "totalQuantity", name: "Total Quantity", color: "#6CADF5" },
                ]}
                lineSeries={{ key: "totalValue", name: "Value (₹K)", color: "#F1DF38" }}
                isDark={isDark}
              />
            </CardContent>
          </Card>
        </section>

        {/* ========================================================================= */}
        {/* 5. CRM REPORTS CHARTS SHOWCASE                                            */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="border-l-4 border-[#A77DFF] pl-3">
            <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#A77DFF]" />
              5. CRM Intelligence &amp; Analytics Reports Charts
            </h2>
            <p className="text-[11px] text-[#757575]">
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
            <div className={cn(
              "border p-6 flex flex-col justify-center items-center rounded-none shadow-sm transition-colors",
              isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-[#e5e5e5] text-slate-900"
            )}>
              <div className="w-full mb-3 text-left">
                <h3 className="text-lg font-bold uppercase">Customer Churn Risk Distribution</h3>
                <p className="text-[10px] text-[#757575] mt-0.5">Account health risk cohorts breakdown</p>
              </div>
              <ChurnRiskChart />
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 6. FINANCE DATA VISUALIZATION COMPONENT                                   */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="border-l-4 border-[#8AE06C] pl-3">
            <h2 className="text-lg font-bold tracking-wide uppercase flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#8AE06C]" />
              6. Finance Multi-Mode Visualization (Switch Between Brick Bar, Line, Pie)
            </h2>
            <p className="text-[11px] text-[#757575]">
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
          dataKeys={[{ key: "value", name: "Movement Volume", color: "#7c3aed" }]}
        />
      )}
    </div>
  );
}
