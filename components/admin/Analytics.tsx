'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { adminSidebarConfig } from '@/config/sidebar/admin';
import { Loader2, RefreshCw, Maximize2 } from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { DailyBrickBarChart, generate365DailyData } from '@/components/charts/DailyBrickBarChart';
import { TradingLineChart } from '@/components/charts/TradingLineChart';

// Type Definitions
interface AnalyticsData {
  finance: {
    revenue: Array<{ month: string; amount: number }>;
    expenses: Array<{ month: string; amount: number }>;
    cashFlow: Array<{ month: string; inflow: number; outflow: number }>;
  };
  sales: {
    orders: Array<any>;
    revenue: Array<{ month: string; amount: number }>;
    topProducts: Array<{ name: string; value: number }>;
  };
  inventory: {
    stockLevels: Array<{ month: string; level: number }>;
    movements: Array<any>;
    alerts: Array<{ type: string; count: number }>;
  };
  manufacturing: {
    shipments: Array<{ month: string; count: number }>;
    costs: Array<{ month: string; amount: number }>;
    status: Array<{ name: string; value: number }>;
  };
  users: {
    activity: Array<{ month: string; logins: number }>;
    byRole: Array<{ role: string; count: number }>;
    dailyActivity?: Array<any>;
  };
}

export default function AdminAnalytics() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [expandedGraph, setExpandedGraph] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<{ [key: string]: boolean }>({});

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/admin');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/auth/admin');
    }
  }, [status, session, router]);

  // Mock data generators - memoized
  const getMockFinanceData = useCallback(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return {
      revenue: months.map((month) => ({
        month,
        amount: Math.floor(Math.random() * 100000) + 50000,
      })),
      expenses: months.map((month) => ({
        month,
        amount: Math.floor(Math.random() * 50000) + 30000,
      })),
      cashFlow: months.map((month) => ({
        month,
        inflow: Math.floor(Math.random() * 80000) + 40000,
        outflow: Math.floor(Math.random() * 60000) + 30000,
      })),
    };
  }, []);

  const getMockSalesData = useCallback(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    // 365-day granular daily order tracking using solid bars
    const dailyPoints = generate365DailyData(2026, { base: 28, variance: 16, seed: 101 });
    return {
      orders: dailyPoints.map((d) => ({
        ...d,
        month: d.label,
        count: d.value,
      })),
      revenue: months.map((month) => ({
        month,
        amount: Math.floor(Math.random() * 150000) + 80000,
      })),
      topProducts: [
        { name: 'Product A', value: 450 },
        { name: 'Product B', value: 380 },
        { name: 'Product C', value: 320 },
        { name: 'Product D', value: 280 },
      ],
    };
  }, []);

  const getMockInventoryData = useCallback(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    // 365-day daily stock movement tracking
    const dailyPoints = generate365DailyData(2026, { base: 140, variance: 75, seed: 202 });
    return {
      stockLevels: months.map((month) => ({
        month,
        level: Math.floor(Math.random() * 5000) + 3000,
      })),
      movements: dailyPoints.map((d) => ({
        ...d,
        month: d.label,
        inbound: d.value,
        outbound: Math.round(d.value * 0.8),
        count: d.value,
      })),
      alerts: [
        { type: 'Low Stock', count: 12 },
        { type: 'Reorder', count: 8 },
        { type: 'Expired', count: 3 },
      ],
    };
  }, []);

  const getMockManufacturingData = useCallback(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return {
      shipments: months.map((month) => ({
        month,
        count: Math.floor(Math.random() * 50) + 30,
      })),
      costs: months.map((month) => ({
        month,
        amount: Math.floor(Math.random() * 30000) + 20000,
      })),
      status: [
        { name: 'In Transit', value: 45 },
        { name: 'Delivered', value: 120 },
        { name: 'Pending', value: 22 },
        { name: 'Delayed', value: 8 },
      ],
    };
  }, []);

  const getMockUsersData = useCallback(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    // 365-day daily active user sessions
    const dailyUserPoints = generate365DailyData(2026, { base: 65, variance: 35, seed: 303 });
    return {
      activity: months.map((month) => ({
        month,
        logins: Math.floor(Math.random() * 500) + 300,
      })),
      byRole: [
        { role: 'Admin', count: 5 },
        { role: 'Finance', count: 12 },
        { role: 'Sales', count: 18 },
        { role: 'Inventory', count: 15 },
        { role: 'Manufacturing', count: 10 },
      ],
      dailyActivity: dailyUserPoints.map((d) => ({
        date: String(d.date),
        value: d.value,
        label: d.label || String(d.date),
        count: d.value,
      })),
    };
  }, []);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const data: AnalyticsData = {
        finance: getMockFinanceData(),
        sales: getMockSalesData(),
        inventory: getMockInventoryData(),
        manufacturing: getMockManufacturingData(),
        users: getMockUsersData(),
      };
      setAnalyticsData(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [
    getMockFinanceData,
    getMockSalesData,
    getMockInventoryData,
    getMockManufacturingData,
    getMockUsersData,
  ]);

  // Only fetch once when admin is confirmed
  useEffect(() => {
    if (session?.user?.role === 'admin' && !analyticsData) {
      fetchAnalytics();
    }
  }, [session?.user?.role, analyticsData, fetchAnalytics]);

  // Refresh individual graph
  const refreshGraph = useCallback(
    async (graphId: string) => {
      setRefreshing((prev) => ({ ...prev, [graphId]: true }));
      await new Promise((resolve) => setTimeout(resolve, 800));
      await fetchAnalytics();
      setRefreshing((prev) => ({ ...prev, [graphId]: false }));
    },
    [fetchAnalytics]
  );

  const COLORS = ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'];

  // Graph Card Component
  const GraphCard = ({
    title,
    children,
    onExpand,
    onRefresh,
    isRefreshing,
  }: {
    title: string;
    children: React.ReactNode;
    onExpand: () => void;
    onRefresh: () => void;
    isRefreshing: boolean;
  }) => (
    <Card className="chart-animate-in chart-shimmer-border h-full flex flex-col border-blue-800/20">
      <CardHeader className="shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-blue-800">
            {title}
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-7 w-7 p-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExpand}
              className="h-7 w-7 p-0"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 pt-0">{children}</CardContent>
    </Card>
  );

  // Loading State
  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted dark:bg-card">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-800 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground dark:text-muted-foreground">
            Loading analytics dashboard...
          </p>
        </div>
      </div>
    );
  }

  // No Data State
  if (!analyticsData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted dark:bg-card">
        <div className="text-center">
          <p className="text-muted-foreground dark:text-muted-foreground">
            No analytics data available
          </p>
        </div>
      </div>
    );
  }

  // Main Dashboard Render
  return (
   <div>
      <div className="space-y-8 pb-8">
        {/* Finance Analytics Section */}
        <section>
          <h2 className="text-2xl font-bold text-foreground dark:text-foreground mb-4">
            Finance Analytics
          </h2>
          <ResizablePanelGroup direction="horizontal" className="min-h-[400px] gap-4">
            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Revenue Trend"
                onExpand={() => setExpandedGraph('finance-revenue')}
                onRefresh={() => refreshGraph('finance-revenue')}
                isRefreshing={refreshing['finance-revenue']}
              >
                <div className="w-full h-full min-h-[300px]">
                  <TradingLineChart
                    data={analyticsData.finance.revenue}
                    xAxisKey="month"
                    valueKey="amount"
                    metricLabel="Revenue"
                    currencyPrefix="₹"
                    colorTheme="emerald"
                    title="FINANCE REVENUE"
                    height="100%"
                  />
                </div>
              </GraphCard>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Cash Flow"
                onExpand={() => setExpandedGraph('finance-cashflow')}
                onRefresh={() => refreshGraph('finance-cashflow')}
                isRefreshing={refreshing['finance-cashflow']}
              >
                <div className="w-full h-full min-h-[300px]">
                  <TradingLineChart
                    data={analyticsData.finance.cashFlow}
                    valueKey="inflow"
                    metricLabel="Cash Inflow"
                    title="Cash Flow Trend"
                    height="100%"
                  />
                </div>
              </GraphCard>
            </ResizablePanel>
          </ResizablePanelGroup>
        </section>

        {/* Sales Analytics Section */}
        <section>
          <h2 className="text-2xl font-bold text-foreground dark:text-foreground mb-4">
            Sales Analytics
          </h2>
          <ResizablePanelGroup direction="horizontal" className="min-h-[400px] gap-4">
            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Order Volume"
                onExpand={() => setExpandedGraph('sales-orders')}
                onRefresh={() => refreshGraph('sales-orders')}
                isRefreshing={refreshing['sales-orders']}
              >
                <div className="w-full h-full min-h-[300px]">
                  <DailyBrickBarChart
                    data={analyticsData.sales.orders}
                    valueKey="count"
                    metricLabel="Orders"
                    height="100%"
                  />
                </div>
              </GraphCard>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Top Products"
                onExpand={() => setExpandedGraph('sales-products')}
                onRefresh={() => refreshGraph('sales-products')}
                isRefreshing={refreshing['sales-products']}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData.sales.topProducts}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) => entry.name}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      isAnimationActive={true}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    >
                      {analyticsData.sales.topProducts.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </GraphCard>
            </ResizablePanel>
          </ResizablePanelGroup>
        </section>

        {/* Inventory Analytics Section */}
        <section>
          <h2 className="text-2xl font-bold text-foreground dark:text-foreground mb-4">
            Inventory Analytics
          </h2>
          <ResizablePanelGroup direction="horizontal" className="min-h-[400px] gap-4">
            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Stock Levels"
                onExpand={() => setExpandedGraph('inventory-stock')}
                onRefresh={() => refreshGraph('inventory-stock')}
                isRefreshing={refreshing['inventory-stock']}
              >
                <div className="w-full h-full min-h-[300px]">
                  <TradingLineChart
                    data={analyticsData.inventory.stockLevels}
                    valueKey="level"
                    metricLabel="Stock Level"
                    title="Stock Levels Trend"
                    height="100%"
                  />
                </div>
              </GraphCard>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Stock Movements"
                onExpand={() => setExpandedGraph('inventory-movements')}
                onRefresh={() => refreshGraph('inventory-movements')}
                isRefreshing={refreshing['inventory-movements']}
              >
                <div className="w-full h-full min-h-[300px]">
                  <DailyBrickBarChart
                    data={analyticsData.inventory.movements}
                    valueKey="count"
                    metricLabel="Movements"
                    height="100%"
                  />
                </div>
              </GraphCard>
            </ResizablePanel>
          </ResizablePanelGroup>
        </section>

        {/* Manufacturing Analytics Section */}
        <section>
          <h2 className="text-2xl font-bold text-foreground dark:text-foreground mb-4">
            Manufacturing Analytics
          </h2>
          <ResizablePanelGroup direction="horizontal" className="min-h-[400px] gap-4">
            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Shipments"
                onExpand={() => setExpandedGraph('manufacturing-shipments')}
                onRefresh={() => refreshGraph('manufacturing-shipments')}
                isRefreshing={refreshing['manufacturing-shipments']}
              >
                <div className="w-full h-full min-h-[300px]">
                  <TradingLineChart
                    data={analyticsData.manufacturing.shipments}
                    xAxisKey="month"
                    valueKey="count"
                    metricLabel="Shipments"
                    currencyPrefix=""
                    colorTheme="white"
                    title="MANUFACTURING SHIPMENTS"
                    height="100%"
                  />
                </div>
              </GraphCard>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Status Distribution"
                onExpand={() => setExpandedGraph('manufacturing-status')}
                onRefresh={() => refreshGraph('manufacturing-status')}
                isRefreshing={refreshing['manufacturing-status']}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData.manufacturing.status}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) => `${entry.name}: ${entry.value}`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      isAnimationActive={true}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    >
                      {analyticsData.manufacturing.status.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </GraphCard>
            </ResizablePanel>
          </ResizablePanelGroup>
        </section>

        {/* User Analytics Section */}
        <section>
          <h2 className="text-2xl font-bold text-foreground dark:text-foreground mb-4">
            User Analytics
          </h2>
          <ResizablePanelGroup direction="horizontal" className="min-h-[400px] gap-4">
            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="User Activity"
                onExpand={() => setExpandedGraph('users-activity')}
                onRefresh={() => refreshGraph('users-activity')}
                isRefreshing={refreshing['users-activity']}
              >
                <div className="w-full h-full min-h-[300px]">
                  <TradingLineChart
                    data={analyticsData.users.activity}
                    valueKey="logins"
                    metricLabel="Logins"
                    title="User Activity Trend"
                    height="100%"
                  />
                </div>
              </GraphCard>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={50} minSize={30}>
              <GraphCard
                title="Users by Role"
                onExpand={() => setExpandedGraph('users-role')}
                onRefresh={() => refreshGraph('users-role')}
                isRefreshing={refreshing['users-role']}
              >
                <div className="w-full h-full min-h-[300px]">
                  <DailyBrickBarChart
                    data={analyticsData.users.dailyActivity || analyticsData.users.byRole}
                    valueKey="count"
                    metricLabel="Active Users"
                    height="100%"
                  />
                </div>
              </GraphCard>
            </ResizablePanel>
          </ResizablePanelGroup>
        </section>
      </div>

      {/* Expanded Graph Dialog */}
      <Dialog open={!!expandedGraph} onOpenChange={() => setExpandedGraph(null)}>
        <DialogContent className="max-w-6xl h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-blue-800 text-xl">
              {expandedGraph && expandedGraph.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 h-[calc(80vh-8rem)]">
            {expandedGraph === 'finance-revenue' && (
              <div className="w-full h-full min-h-[450px]">
                <TradingLineChart
                  data={analyticsData.finance.revenue}
                  xAxisKey="month"
                  valueKey="amount"
                  metricLabel="Revenue"
                  currencyPrefix="₹"
                  colorTheme="emerald"
                  title="FINANCE REVENUE"
                  height="100%"
                />
              </div>
            )}

            {expandedGraph === 'finance-cashflow' && (
              <div className="w-full h-full min-h-[450px]">
                <TradingLineChart
                  data={analyticsData.finance.cashFlow}
                  valueKey="inflow"
                  metricLabel="Cash Inflow"
                  title="Cash Flow Trend"
                  height="100%"
                />
              </div>
            )}

            {expandedGraph === 'sales-orders' && (
              <div className="w-full h-full min-h-[450px]">
                <DailyBrickBarChart
                  data={analyticsData.sales.orders}
                  valueKey="count"
                  metricLabel="Orders"
                  height="100%"
                />
              </div>
            )}

            {expandedGraph === 'sales-products' && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analyticsData.sales.topProducts}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                    outerRadius={150}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analyticsData.sales.topProducts.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}

            {expandedGraph === 'inventory-stock' && (
              <div className="w-full h-full min-h-[450px]">
                <TradingLineChart
                  data={analyticsData.inventory.stockLevels}
                  valueKey="level"
                  metricLabel="Stock Level"
                  title="Stock Levels Trend"
                  height="100%"
                />
              </div>
            )}

            {expandedGraph === 'inventory-movements' && (
              <div className="w-full h-full min-h-[450px]">
                <DailyBrickBarChart
                  data={analyticsData.inventory.movements}
                  valueKey="count"
                  metricLabel="Movements"
                  height="100%"
                />
              </div>
            )}

            {expandedGraph === 'manufacturing-shipments' && (
              <div className="w-full h-full min-h-[450px]">
                <TradingLineChart
                  data={analyticsData.manufacturing.shipments}
                  xAxisKey="month"
                  valueKey="count"
                  metricLabel="Shipments"
                  currencyPrefix=""
                  colorTheme="white"
                  title="MANUFACTURING SHIPMENTS"
                  height="100%"
                />
              </div>
            )}

            {expandedGraph === 'manufacturing-status' && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analyticsData.manufacturing.status}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                    outerRadius={150}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {analyticsData.manufacturing.status.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}

            {expandedGraph === 'users-activity' && (
              <div className="w-full h-full min-h-[450px]">
                <TradingLineChart
                  data={analyticsData.users.activity}
                  valueKey="logins"
                  metricLabel="Logins"
                  title="User Activity Trend"
                  height="100%"
                />
              </div>
            )}

            {expandedGraph === 'users-role' && (
              <div className="w-full h-full min-h-[450px]">
                <DailyBrickBarChart
                  data={analyticsData.users.dailyActivity || analyticsData.users.byRole}
                  valueKey="count"
                  metricLabel="Active Users"
                  height="100%"
                />
              </div>
            )}

            {!expandedGraph && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a chart to expand
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
