"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart3 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface VisualizationDataPoint {
  date?: string;
  name?: string;
  value?: number;
  orders?: number;
  quotations?: number;
  revenue?: number;
  deliveries?: number;
  [key: string]: string | number | undefined;
}

interface SalesVisualizationProps {
  availableDataTypes: Array<{ value: string; label: string }>;
  defaultDataType?: string;
  defaultChartType?: "bar" | "line" | "pie";
  title?: string;
  className?: string;
}

const COLORS = [
  "#10b981",
  "#64748b",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

export function SalesVisualization({
  availableDataTypes,
  defaultDataType,
  defaultChartType = "bar",
  title = "Sales Visualization",
  className = "",
}: SalesVisualizationProps) {
  const [visualizationData, setVisualizationData] = useState<
    VisualizationDataPoint[]
  >([]);
  const [isLoadingViz, setIsLoadingViz] = useState(false);
  const [selectedDataType, setSelectedDataType] = useState(
    defaultDataType || availableDataTypes[0]?.value || "",
  );
  const [selectedChartType, setSelectedChartType] = useState<
    "bar" | "line" | "pie"
  >(defaultChartType);
  const [dateRange, setDateRange] = useState("30");
  const [groupBy, setGroupBy] = useState("day");

  const fetchVisualizationData = useCallback(async () => {
    if (!selectedDataType) return;
    try {
      setIsLoadingViz(true);
      const res = await fetch(
        `/api/sales/visualization?type=${selectedDataType}&dateRange=${dateRange}&groupBy=${groupBy}`,
      );
      if (!res.ok) throw new Error("Failed to fetch visualization data");
      const result = await res.json();
      setVisualizationData(result.data || []);
    } catch (err) {
      console.error("Error fetching visualization:", err);
      setVisualizationData([]);
    } finally {
      setIsLoadingViz(false);
    }
  }, [selectedDataType, dateRange, groupBy]);

  useEffect(() => {
    fetchVisualizationData();
  }, [fetchVisualizationData]);

  const isPieChartData =
    selectedDataType.includes("breakdown") ||
    selectedDataType.includes("status");
  const isProductData = selectedDataType === "product_performance";
  const isTimeSeriesData = !isPieChartData && !isProductData;

  useEffect(() => {
    // Force Bar chart for product performance if switched to it
    if (isProductData && selectedChartType === "line") {
      setSelectedChartType("bar");
    }
  }, [selectedDataType, isProductData, selectedChartType]);

  return (
    <Card
      className={`border-2 border-slate-200 dark:border-slate-700 ${className}`}
    >
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Interactive charts for sales KPIs
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={selectedDataType} onValueChange={setSelectedDataType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select data" />
            </SelectTrigger>
            <SelectContent>
              {availableDataTypes.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedChartType}
            onValueChange={(v) => setSelectedChartType(v as any)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Chart type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar</SelectItem>
              {isTimeSeriesData && <SelectItem value="line">Line</SelectItem>}
              {isPieChartData && <SelectItem value="pie">Pie</SelectItem>}
            </SelectContent>
          </Select>

          {isTimeSeriesData && (
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
          )}

          {isTimeSeriesData && (
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoadingViz ? (
          <div className="flex justify-center items-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
          </div>
        ) : visualizationData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-gray-500 dark:text-gray-400">
            <BarChart3 className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No data available</p>
            <p className="text-sm">
              Try adjusting the filters or add some data
            </p>
          </div>
        ) : (
          <div
            className="w-full"
            style={{ height: "384px", minHeight: "384px" }}
          >
            <ResponsiveContainer
              width="100%"
              height={384}
              minWidth={300}
              minHeight={384}
              key={`${selectedDataType}-${selectedChartType}-${dateRange}`}
            >
              {selectedChartType === "pie" ? (
                <PieChart>
                  <Pie
                    data={visualizationData as any}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                  >
                    {(visualizationData as any).map((_: unknown, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              ) : selectedChartType === "line" ? (
                <LineChart data={visualizationData as any}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey={
                      selectedDataType === "product_performance"
                        ? "name"
                        : "date"
                    }
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {(selectedDataType === "revenue_trend" ||
                    selectedDataType === "product_performance") && (
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10b981"
                      name="Revenue"
                    />
                  )}
                  {(selectedDataType === "orders_trend" ||
                    selectedDataType === "orders_vs_quotations") && (
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="#3b82f6"
                      name="Orders"
                    />
                  )}
                  {(selectedDataType === "quotation_trend" ||
                    selectedDataType === "orders_vs_quotations") && (
                    <Line
                      type="monotone"
                      dataKey="quotations"
                      stroke="#f59e0b"
                      name="Quotations"
                    />
                  )}
                </LineChart>
              ) : (
                <BarChart data={visualizationData as any}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey={
                      selectedDataType === "product_performance"
                        ? "name"
                        : "date"
                    }
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {(selectedDataType === "revenue_trend" ||
                    selectedDataType === "product_performance") && (
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                  )}
                  {(selectedDataType === "orders_trend" ||
                    selectedDataType === "orders_vs_quotations") && (
                    <Bar dataKey="orders" fill="#3b82f6" name="Orders" />
                  )}
                  {(selectedDataType === "quotation_trend" ||
                    selectedDataType === "orders_vs_quotations") && (
                    <Bar
                      dataKey="quotations"
                      fill="#f59e0b"
                      name="Quotations"
                    />
                  )}
                  {selectedDataType === "product_performance" && (
                    <Bar dataKey="quantity" fill="#3b82f6" name="Quantity" />
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
