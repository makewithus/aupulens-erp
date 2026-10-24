'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { adminSidebarConfig } from '@/config/sidebar/admin';
import { ChevronDown } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { AnalyticsPageSkeleton } from '@/components/ui/loading-skeletons';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { DailyBrickBarChart, generateZeroDailyData } from '@/components/charts/DailyBrickBarChart';
import { TradingLineChart } from '@/components/charts/TradingLineChart';

type Tab = 'overview' | 'finance' | 'sales' | 'inventory' | 'manufacturing';

interface ChartDataPoint {
  time: string;
  revenue?: number;
  orders?: number;
  expenses?: number;
  profit?: number;
  level?: number;
  stockLevel?: number;
  production?: number;
  shipments?: number;
  costs?: number;
}

interface AnalyticsData {
  finance: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    chartData: ChartDataPoint[];
  };
  sales: {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    chartData: ChartDataPoint[];
  };
  inventory: {
    totalItems: number;
    lowStock: number;
    outOfStock: number;
    chartData: ChartDataPoint[];
  };
  manufacturing: {
    totalProduction: number;
    totalShipments: number;
    activeClearances: number;
    chartData: ChartDataPoint[];
  };
}

export default function AdminAnalytics() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== 'light';
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  
  // Filter states
  const [dateRange, setDateRange] = useState('last-30-days');
  const [source, setSource] = useState('all-categories');
  const [destination, setDestination] = useState('all-resources');
  const [showBy, setShowBy] = useState('department');
  const [interval, setInterval] = useState('day');
  const [chartMode, setChartMode] = useState<'bar' | 'area'>('bar');

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch summary data for metrics
      const [financeSummaryRes, salesSummaryRes, inventorySummaryRes] = await Promise.all([
        fetch('/api/finance/summary').catch(() => null),
        fetch('/api/sales/summary').catch(() => null),
        fetch('/api/inventory/summary').catch(() => null),
      ]);

      const financeSummary = financeSummaryRes && financeSummaryRes.ok ? await financeSummaryRes.json() : null;
      const salesSummary = salesSummaryRes && salesSummaryRes.ok ? await salesSummaryRes.json() : null;
      const inventorySummary = inventorySummaryRes && inventorySummaryRes.ok ? await inventorySummaryRes.json() : null;

      // Fetch analytics data for charts (time-series data)
      const [financeAnalyticsRes, salesAnalyticsRes, inventoryAnalyticsRes, manufacturingAnalyticsRes] = await Promise.all([
        fetch('/api/finance/analytics').catch(() => null),
        fetch('/api/sales/analytics').catch(() => null),
        fetch('/api/inventory/analytics').catch(() => null),
        fetch('/api/manufacturing/analytics').catch(() => null),
      ]);

      const financeAnalytics = financeAnalyticsRes && financeAnalyticsRes.ok ? await financeAnalyticsRes.json() : null;
      const salesAnalytics = salesAnalyticsRes && salesAnalyticsRes.ok ? await salesAnalyticsRes.json() : null;
      const inventoryAnalytics = inventoryAnalyticsRes && inventoryAnalyticsRes.ok ? await inventoryAnalyticsRes.json() : null;
      const manufacturingAnalytics = manufacturingAnalyticsRes && manufacturingAnalyticsRes.ok ? await manufacturingAnalyticsRes.json() : null;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      // Transform finance data for charts - Real API data only
      let financeChartData: ChartDataPoint[] = [];
      if (financeAnalytics?.revenue && financeAnalytics.revenue.length > 0) {
        financeChartData = financeAnalytics.revenue.map((rev: any, idx: number) => ({
          time: rev.month,
          revenue: rev.amount,
          expenses: financeAnalytics?.expenses?.[idx]?.amount || 0,
          profit: rev.amount - (financeAnalytics?.expenses?.[idx]?.amount || 0),
        }));
      }

      // Transform sales data for charts - Real API data only
      let salesChartData: ChartDataPoint[] = [];
      if (salesAnalytics?.orders && salesAnalytics.orders.length > 0) {
        salesChartData = salesAnalytics.orders.map((order: any, idx: number) => ({
          time: order.month,
          orders: order.count,
          revenue: salesAnalytics?.revenue?.[idx]?.amount || 0,
        }));
      }

      // Transform inventory data for charts - Real API data only
      let inventoryChartData: ChartDataPoint[] = [];
      if (inventoryAnalytics?.stockLevels && inventoryAnalytics.stockLevels.length > 0) {
        inventoryChartData = inventoryAnalytics.stockLevels.map((stock: any) => ({
          time: stock.month,
          level: stock.level,
          stockLevel: stock.level,
        }));
      }

      // Transform manufacturing data - Real API data only
      let manufacturingChartData: ChartDataPoint[] = [];
      if (manufacturingAnalytics) {
        const shipmentsMap = new Map();
        if (Array.isArray(manufacturingAnalytics.shipmentsData)) {
          manufacturingAnalytics.shipmentsData.forEach((item: any) => {
            const month = monthNames[item._id.month - 1];
            shipmentsMap.set(month, item.count);
          });
        }
        
        const costsMap = new Map();
        if (Array.isArray(manufacturingAnalytics.costsData)) {
          manufacturingAnalytics.costsData.forEach((item: any) => {
            const month = monthNames[item._id.month - 1];
            costsMap.set(month, item.amount);
          });
        }
        
        const allMonths = new Set([...shipmentsMap.keys(), ...costsMap.keys()]);
        allMonths.forEach(month => {
          manufacturingChartData.push({
            time: month,
            production: shipmentsMap.get(month) || 0,
            shipments: shipmentsMap.get(month) || 0,
            costs: costsMap.get(month) || 0,
          });
        });
      }

      // Calculate totals with authentic tenant data
      const totalFinanceRevenue = financeChartData.reduce((sum, item) => sum + (item.revenue || 0), 0);
      const totalFinanceExpenses = financeChartData.reduce((sum, item) => sum + (item.expenses || 0), 0);
      const totalSalesOrders = salesChartData.reduce((sum, item) => sum + (item.orders || 0), 0);
      const totalSalesRevenue = salesChartData.reduce((sum, item) => sum + (item.revenue || 0), 0);

      // Process and structure the data strictly with authentic tenant values
      setAnalyticsData({
        finance: {
          totalRevenue: financeSummary?.summary?.revenue?.current || totalFinanceRevenue || 0,
          totalExpenses: financeSummary?.summary?.expenses?.current || totalFinanceExpenses || 0,
          netProfit: financeSummary?.summary?.netIncome?.current || (totalFinanceRevenue - totalFinanceExpenses) || 0,
          chartData: financeChartData,
        },
        sales: {
          totalOrders: salesSummary?.totalOrders || totalSalesOrders || 0,
          totalRevenue: salesSummary?.totalRevenue || totalSalesRevenue || 0,
          avgOrderValue: salesSummary?.totalRevenue && salesSummary?.totalOrders
            ? Math.round(salesSummary.totalRevenue / salesSummary.totalOrders)
            : totalSalesOrders > 0 ? Math.round(totalSalesRevenue / totalSalesOrders) : 0,
          chartData: salesChartData,
        },
        inventory: {
          totalItems: inventorySummary?.summary?.totalItems?.current || (inventoryChartData.length > 0 ? inventoryChartData[inventoryChartData.length - 1]?.stockLevel : 0) || 0,
          lowStock: inventorySummary?.summary?.lowStock?.current || 0,
          outOfStock: 0,
          chartData: inventoryChartData,
        },
        manufacturing: {
          totalProduction: manufacturingChartData.reduce((sum, item) => sum + (item.production || 0), 0) || 0,
          totalShipments: manufacturingChartData.reduce((sum, item) => sum + (item.shipments || 0), 0) || 0,
          activeClearances: 0,
          chartData: manufacturingChartData,
        },
      });

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/admin');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/auth/admin');
    } else if (status === 'authenticated') {
      const timeoutId = window.setTimeout(() => {
        void fetchAnalyticsData();
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [status, session, router, fetchAnalyticsData]);

  const tabs = [
    { id: 'overview' as Tab, name: 'Overview' },
    { id: 'finance' as Tab, name: 'Finance' },
    { id: 'sales' as Tab, name: 'Sales' },
    { id: 'inventory' as Tab, name: 'Inventory' },
    { id: 'manufacturing' as Tab, name: 'Manufacturing' },
  ];

  const getChartData = (): ChartDataPoint[] => {
    if (!analyticsData) return [];
    
    switch (activeTab) {
      case 'finance':
        return analyticsData.finance.chartData;
      case 'sales':
        return analyticsData.sales.chartData;
      case 'inventory':
        return analyticsData.inventory.chartData;
      case 'manufacturing':
        return analyticsData.manufacturing.chartData;
      case 'overview':
      default:
        return analyticsData.finance.chartData;
    }
  };

  const dailySeedData = useMemo(() => {
    const chartPoints = getChartData();
    if (!chartPoints || chartPoints.length === 0) {
      return generateZeroDailyData(30);
    }
    return chartPoints.map((p) => ({
      date: p.time,
      count: p.orders || p.production || (p.level ? 1 : 0),
      value: p.revenue || p.level || p.production || p.expenses || 0,
    }));
  }, [activeTab, analyticsData]);

  const getMetrics = () => {
    if (!analyticsData) return { primary: 0, secondary: 0, tertiary: 0 };
    
    switch (activeTab) {
      case 'finance':
        return {
          primary: analyticsData.finance.totalRevenue,
          secondary: analyticsData.finance.totalExpenses,
          tertiary: analyticsData.finance.netProfit,
          labels: ['Revenue', 'Expenses', 'Net Profit']
        };
      case 'sales':
        return {
          primary: analyticsData.sales.totalOrders,
          secondary: analyticsData.sales.totalRevenue,
          tertiary: analyticsData.sales.avgOrderValue,
          labels: ['Total Orders', 'Total Revenue', 'Avg Order Value']
        };
      case 'inventory':
        return {
          primary: analyticsData.inventory.totalItems,
          secondary: analyticsData.inventory.lowStock,
          tertiary: analyticsData.inventory.outOfStock,
          labels: ['Total Items', 'Low Stock', 'Out of Stock']
        };
      case 'manufacturing':
        return {
          primary: analyticsData.manufacturing.totalProduction,
          secondary: analyticsData.manufacturing.totalShipments,
          tertiary: analyticsData.manufacturing.activeClearances,
          labels: ['Production', 'Shipments', 'Active Clearances']
        };
      case 'overview':
      default:
        return {
          primary: analyticsData.finance.totalRevenue,
          secondary: analyticsData.sales.totalOrders,
          tertiary: analyticsData.inventory.totalItems,
          labels: ['Total Revenue', 'Total Orders', 'Total Items']
        };
    }
  };

  const formatValue = (value: number, isRevenue: boolean = false) => {
    if (isRevenue) {
      if (value >= 1000000) return `₹${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
      return `₹${value}`;
    }
    return value.toLocaleString('en-IN');
  };

  if (status === 'loading') {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin Dashboard"
        pageName="Analytics"
        userName="Admin"
        userEmail=""
        userRole="admin"
        onSignOut={() => signOut({ callbackUrl: '/auth/admin' })}
        profilePath="/admin/profile"
      >
        <AnalyticsPageSkeleton />
      </DashboardLayout>
    );
  }

  if (isLoading && !analyticsData) {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin Dashboard"
        pageName="Analytics"
        userName={session?.user?.name || 'Admin'}
        userEmail={session?.user?.email}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: '/auth/admin' })}
        profilePath="/admin/profile"
      >
        <AnalyticsPageSkeleton />
      </DashboardLayout>
    );
  }

  if (!analyticsData) {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin Dashboard"
        pageName="Analytics"
        userName={session?.user?.name || 'Admin'}
        userEmail={session?.user?.email}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: '/auth/admin' })}
        profilePath="/admin/profile"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground text-lg">Failed to load analytics data</p>
            <Button onClick={fetchAnalyticsData} className="mt-4">
              Retry
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const chartData = getChartData();
  const metrics = getMetrics();

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin Dashboard"
      pageName="Charts & Analytics"
      breadcrumbs={[
        { label: 'Dashboard', href: '/admin/dashboard' },
        { label: 'Analytics' }
      ]}
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/admin' })}
      profilePath="/admin/profile"
    >
      <div className="bg-background min-h-screen -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-4">Charts & Analytics</h1>

          {/* Tabs */}
          <div className="flex gap-8 border-b border-border/40">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 font-mono text-[11px] uppercase tracking-wider transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.name}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Filters Section */}
        <div className="bg-card border border-border/40 rounded-none p-6 mb-6">
          <div className="flex flex-wrap items-center gap-6 mb-6">
            {/* Date Range */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Date Range</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-40 rounded-none border-border/40 bg-transparent text-foreground text-sm">
                  <SelectValue placeholder="Pick a date" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last-7-days">Last 7 days</SelectItem>
                  <SelectItem value="last-30-days">Last 30 days</SelectItem>
                  <SelectItem value="last-90-days">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Source</label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-[180px] rounded-none border-border/40 bg-transparent text-foreground text-sm">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  <SelectItem value="all-categories">All Categories</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Destination */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Destination</label>
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger className="w-[180px] rounded-none border-border/40 bg-transparent text-foreground text-sm">
                  <SelectValue placeholder="All Resources" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  <SelectItem value="all-resources">All Resources</SelectItem>
                  <SelectItem value="transactions">Transactions</SelectItem>
                  <SelectItem value="orders">Orders</SelectItem>
                  <SelectItem value="items">Items</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Show by */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Show by</label>
              <Select value={showBy} onValueChange={setShowBy}>
                <SelectTrigger className="w-40 rounded-none border-border/40 bg-transparent text-foreground text-sm">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="type">Type</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Interval */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Interval</label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger className="w-[120px] rounded-none border-border/40 bg-transparent text-foreground text-sm">
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  <SelectItem value="hour">Hour</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 border border-border/40 p-0.5 bg-background">
              <button
                type="button"
                onClick={() => setChartMode('bar')}
                className={`px-3 py-1 text-xs font-mono transition-colors ${
                  chartMode === 'bar'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Daily Bar (365D)
              </button>
              <button
                type="button"
                onClick={() => setChartMode('area')}
                className={`px-3 py-1 text-xs font-mono transition-colors ${
                  chartMode === 'area'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Area Trend
              </button>
            </div>

            <Button
              variant="outline"
              className="ml-auto rounded-none border-border/40 text-foreground hover:bg-white/5 text-sm"
              onClick={fetchAnalyticsData}
            >
              Reset
            </Button>
          </div>

          {/* Metrics Info */}
          <div className="flex items-center gap-6 text-xs flex-wrap">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">Department:</span>
              <span className="text-foreground font-medium capitalize">{activeTab}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">{metrics.labels[0]}:</span>
              <span className="text-foreground font-medium">
                {formatValue(metrics.primary, activeTab === 'finance' || activeTab === 'overview')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">{metrics.labels[1]}:</span>
              <span className="text-foreground font-medium">
                {formatValue(metrics.secondary, activeTab === 'finance' && metrics.labels[1] === 'Total Revenue')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">{metrics.labels[2]}:</span>
              <span className="text-foreground font-medium">
                {formatValue(metrics.tertiary, activeTab === 'finance' || (activeTab === 'sales' && metrics.labels[2] === 'Avg Order Value'))}
              </span>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-3 text-xs text-muted-foreground">
            Data source: {activeTab === 'finance' ? 'Transactions, Ledger, Invoices' : 
                         activeTab === 'sales' ? 'Orders, Quotations, Delivery Challans' :
                         activeTab === 'inventory' ? 'Stock Items, Warehouses, Batches' :
                         activeTab === 'manufacturing' ? 'Shipments, Clearances, Freight' :
                         'All Departments'}
          </div>

          {/* Chart */}
          <div className="mt-6 bg-background rounded-none" style={{ height: '440px' }}>
            {chartMode === 'bar' ? (
              <DailyBrickBarChart
                data={dailySeedData}
                metricLabel={metrics.labels[0]}
                height="100%"
              />
            ) : (
              <TradingLineChart
                data={dailySeedData}
                metricLabel={metrics.labels[0]}
                title={`${activeTab.toUpperCase()} TRADING TREND`}
                height="100%"
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
