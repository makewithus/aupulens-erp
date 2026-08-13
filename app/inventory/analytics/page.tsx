'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, TrendingUp, Package, Warehouse } from 'lucide-react';
import { AnalyticsPageSkeleton } from '@/components/ui/loading-skeletons';
import {
  CanvasAreaChart,
  CanvasBarChart,
  CanvasPieChart,
  CanvasComposedChart,
} from '@/components/inventory/CanvasCharts';
import { StatCard } from '@/components/admin/StatCard';
import { ActivePulse } from '@/components/admin/graphics/ActivePulse';
import { UsersGraph } from '@/components/admin/graphics/UsersGraph';

interface Warehouse {
  _id: string;
  warehouseCode: string;
  name: string;
  type: string;
  capacity: number;
  currentUtilization: number;
  status: string;
}

interface StockItem {
  _id: string;
  itemCode: string;
  name: string;
  category: string;
  quantity: number;
  warehouse: string;
  unitCost: number;
  totalValue: number;
}

interface Batch {
  _id: string;
  batchNumber: string;
  warehouse: string;
  quantity: number;
  expiryDate?: string;
  status: string;
}

interface Order {
  _id: string;
  orderNumber: string;
  warehouse: string;
  status: string;
  items: { itemCode: string; quantity: number }[];
  totalQuantity: number;
  orderDate: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function InventoryAnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [dateRange, setDateRange] = useState('30');

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (status === "authenticated") {
      if (session?.user?.role !== 'inventory' && session?.user?.role !== 'admin') {
        router.push('/auth/inventory');
      }
    }
  }, [status, router, session]);

  const fetchAllData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const [warehouseRes, stockRes, batchRes, orderRes] = await Promise.all([
        cachedFetch('/api/inventory/warehouse'),
        cachedFetch('/api/inventory/stock'),
        cachedFetch('/api/inventory/batch'),
        cachedFetch('/api/inventory/orders'),
      ]);

      if (warehouseRes.ok) {
        const data = await warehouseRes.json();
        setWarehouses(data.warehouses || []);
      }
      if (stockRes.ok) {
        const data = await stockRes.json();
        setStockItems(data.items || []);
      }
      if (batchRes.ok) {
        const data = await batchRes.json();
        setBatches(data.batches || []);
      }
      if (orderRes.ok) {
        const data = await orderRes.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Error fetching analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAllData();
    }
  }, [status, fetchAllData]);

  // Filter data by selected warehouse
  const filteredStockItems = useMemo(() => {
    return selectedWarehouse === 'all' 
      ? (stockItems || []) 
      : (stockItems || []).filter(item => item?.warehouse === selectedWarehouse);
  }, [stockItems, selectedWarehouse]);
  
  const filteredBatches = useMemo(() => {
    return selectedWarehouse === 'all'
      ? (batches || [])
      : (batches || []).filter(batch => batch?.warehouse === selectedWarehouse);
  }, [batches, selectedWarehouse]);
  
  const filteredOrders = useMemo(() => {
    return selectedWarehouse === 'all'
      ? (orders || [])
      : (orders || []).filter(order => order?.warehouse === selectedWarehouse);
  }, [orders, selectedWarehouse]);

  // Warehouse Utilization Radar Chart Data -> Plotted as Canvas Bar
  const warehouseUtilizationData = useMemo(() => {
    return (warehouses || []).map(wh => ({
      warehouse: wh.name,
      utilization: wh.capacity ? Math.round((wh.currentUtilization / wh.capacity) * 100) : 0,
      capacity: wh.capacity || 0,
      used: wh.currentUtilization || 0,
      available: (wh.capacity || 0) - (wh.currentUtilization || 0),
    }));
  }, [warehouses]);

  // Stock Levels by Warehouse (Composed Chart)
  const stockByWarehouseData = useMemo(() => {
    return (warehouses || []).map(wh => {
      const whStock = (stockItems || []).filter(item => item?.warehouse === wh.name);
      return {
        warehouse: wh.name,
        totalItems: whStock.length,
        totalQuantity: whStock.reduce((sum, item) => sum + (item.quantity || 0), 0),
        totalValue: Math.round(whStock.reduce((sum, item) => sum + (item.totalValue || 0), 0) / 1000), // In thousands
      };
    });
  }, [warehouses, stockItems]);

  // Stock by Category (Pie Chart)
  const categoryData = useMemo(() => {
    return filteredStockItems.reduce((acc, item) => {
      const existing = acc.find(c => c.name === item.category);
      if (existing) {
        existing.value += item.quantity || 0;
        existing.count += 1;
      } else {
        acc.push({ name: item.category || 'Other', value: item.quantity || 0, count: 1 });
      }
      return acc;
    }, [] as { name: string; value: number; count: number }[]);
  }, [filteredStockItems]);

  // Inventory Value Distribution (Pie Chart)
  const valueDistributionData = useMemo(() => {
    return filteredStockItems.reduce((acc, item) => {
      const existing = acc.find(c => c.name === item.category);
      if (existing) {
        existing.value += Math.round(item.totalValue || 0);
      } else {
        acc.push({ name: item.category || 'Other', value: Math.round(item.totalValue || 0) });
      }
      return acc;
    }, [] as { name: string; value: number }[]);
  }, [filteredStockItems]);

  // Order Status Distribution
  const orderStatusData = useMemo(() => {
    return [
      { status: 'Pending', count: filteredOrders.filter(o => o.status === 'pending').length },
      { status: 'Processing', count: filteredOrders.filter(o => o.status === 'processing').length },
      { status: 'Fulfilled', count: filteredOrders.filter(o => o.status === 'fulfilled').length },
      { status: 'Shipped', count: filteredOrders.filter(o => o.status === 'shipped').length },
      { status: 'Delivered', count: filteredOrders.filter(o => o.status === 'delivered').length },
    ].filter(d => d.count > 0);
  }, [filteredOrders]);

  // Batch Status Distribution
  const batchStatusData = useMemo(() => {
    return [
      { status: 'Active', count: filteredBatches.filter(b => b.status === 'active').length },
      { status: 'Quarantine', count: filteredBatches.filter(b => b.status === 'quarantine').length },
      { status: 'Released', count: filteredBatches.filter(b => b.status === 'released').length },
    ].filter(d => d.count > 0);
  }, [filteredBatches]);

  // Order Trends (Last 7 days - Area Chart)
  const orderTrendsData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toISOString().split('T')[0];
      
      const dayOrders = filteredOrders.filter(o => 
        o.orderDate && o.orderDate.split('T')[0] === dateStr
      );
      
      return {
        date: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        orders: dayOrders.length,
        quantity: dayOrders.reduce((sum, o) => sum + (o.totalQuantity || 0), 0),
      };
    });
  }, [filteredOrders]);

  // Top Items by Quantity (Bar Chart)
  const topItemsData = useMemo(() => {
    return [...filteredStockItems]
      .sort((a, b) => (b.quantity || 0) - (a.quantity || 0))
      .slice(0, 10)
      .map(item => ({
        name: item.name,
        quantity: item.quantity || 0,
        value: Math.round((item.totalValue || 0) / 1000), // In thousands
      }));
  }, [filteredStockItems]);

  // Warehouse Performance (Composed Chart)
  const warehousePerformanceData = useMemo(() => {
    return (warehouses || []).map(wh => {
      const whOrders = (orders || []).filter(o => o?.warehouse === wh.name);
      const whBatches = (batches || []).filter(b => b?.warehouse === wh.name);
      
      return {
        warehouse: wh.name,
        orders: whOrders.length,
        batches: whBatches.length,
        utilization: wh.capacity ? Math.round((wh.currentUtilization / wh.capacity) * 100) : 0,
      };
    });
  }, [warehouses, orders, batches]);

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout
        sidebarSections={inventorySidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Inventory Dashboard"
        pageName="Analytics & Visualization"
        breadcrumbs={[
          { label: 'Dashboard', href: '/inventory/summary' },
          { label: 'Analytics' }
        ]}
        userName={session?.user?.name || ''}
        userEmail={session?.user?.email || ''}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: '/auth/inventory' })}
        profilePath="/inventory/profile"
      >
        <AnalyticsPageSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Analytics & Visualization"
      breadcrumbs={[
        { label: 'Dashboard', href: '/inventory/summary' },
        { label: 'Analytics' }
      ]}
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/inventory' })}
      onRefresh={fetchAllData}
      profilePath="/inventory/profile"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Inventory Analytics</h1>

          </div>
          <div className="flex gap-3">
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger className="w-[200px] rounded-none">
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all" className="rounded-none">All Warehouses</SelectItem>
                {warehouses.map(wh => (
                  <SelectItem key={wh._id} value={wh.name} className="rounded-none">
                    {wh.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px] rounded-none">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="7" className="rounded-none">Last 7 days</SelectItem>
                <SelectItem value="30" className="rounded-none">Last 30 days</SelectItem>
                <SelectItem value="90" className="rounded-none">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
          <StatCard
            title="Total Warehouses"
            value={warehouses.length}
            subtitle={`${warehouses.filter(w => w.status === 'active').length} active`}
            visual={<ActivePulse />}
          />

          <StatCard
            title="Total Stock Items"
            value={filteredStockItems.length}
            subtitle={`${filteredStockItems.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString()} units`}
            visual={<UsersGraph />}
          />

          <StatCard
            title="Total Orders"
            value={filteredOrders.length}
            subtitle={`${filteredOrders.filter(o => o.status === 'pending').length} pending`}
            visual={<ActivePulse />}
          />

          <StatCard
            title="Inventory Value"
            value={`₹${(filteredStockItems.reduce((sum, item) => sum + (item.totalValue || 0), 0) / 1000).toFixed(1)}K`}
            subtitle={`Across ${filteredStockItems.length} items`}
            visual={<UsersGraph />}
          />
        </div>

        {/* Warehouse Utilization Canvas Bar Chart */}
        <Card className="rounded-none shadow-none border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Warehouse Utilization Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {warehouseUtilizationData.length > 0 ? (
              <CanvasBarChart
                data={warehouseUtilizationData}
                xAxisKey="warehouse"
                series={[{ key: "utilization", name: "Utilization %", color: "#3b82f6" }]}
                layout="vertical"
                isDark={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Utilization Data</div>
            )}
          </CardContent>
        </Card>

        {/* Stock Levels by Warehouse - Composed Canvas Chart */}
        <Card className="rounded-none shadow-none border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Stock Levels by Warehouse</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {stockByWarehouseData.length > 0 ? (
              <CanvasComposedChart
                data={stockByWarehouseData}
                xAxisKey="warehouse"
                barSeries={[
                  { key: "totalItems", name: "Total Items", color: "#3b82f6" },
                  { key: "totalQuantity", name: "Total Quantity", color: "#10b981" }
                ]}
                lineSeries={{ key: "totalValue", name: "Value (₹K)", color: "#f59e0b" }}
                isDark={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Stock Levels Data</div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock by Category - Canvas Pie Chart */}
          <Card className="rounded-none shadow-none border-border/40">
            <CardHeader>
              <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Stock Distribution by Category</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              {categoryData.length > 0 ? (
                <CanvasPieChart
                  data={categoryData}
                  nameKey="name"
                  valueKey="value"
                  colors={COLORS}
                  isDark={true}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Category Distribution Data</div>
              )}
            </CardContent>
          </Card>

          {/* Inventory Value Distribution - Canvas Pie Chart */}
          <Card className="rounded-none shadow-none border-border/40">
            <CardHeader>
              <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Inventory Value Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              {valueDistributionData.length > 0 ? (
                <CanvasPieChart
                  data={valueDistributionData}
                  nameKey="name"
                  valueKey="value"
                  colors={COLORS}
                  isDark={true}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Value Distribution Data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Trends - Canvas Area Chart */}
        <Card className="rounded-none shadow-none border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Order Trends (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {orderTrendsData.length > 0 ? (
              <CanvasAreaChart
                data={orderTrendsData}
                xAxisKey="date"
                series={[
                  { key: "orders", name: "Order Count", color: "#3b82f6" },
                  { key: "quantity", name: "Total Quantity", color: "#10b981" }
                ]}
                isDark={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Order Trends Data</div>
            )}
          </CardContent>
        </Card>

        {/* Top Items by Quantity - Horizontal Canvas Bar Chart */}
        <Card className="rounded-none shadow-none border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Top 10 Items by Quantity</CardTitle>
          </CardHeader>
          <CardContent className="h-[380px]">
            {topItemsData.length > 0 ? (
              <CanvasBarChart
                data={topItemsData}
                xAxisKey="name"
                series={[
                  { key: "quantity", name: "Quantity", color: "#3b82f6" },
                  { key: "value", name: "Value (₹K)", color: "#10b981" }
                ]}
                layout="horizontal"
                isDark={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Top Items Data</div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order Status Distribution - Canvas Bar Chart */}
          <Card className="rounded-none shadow-none border-border/40">
            <CardHeader>
              <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Order Status Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              {orderStatusData.length > 0 ? (
                <CanvasBarChart
                  data={orderStatusData}
                  xAxisKey="status"
                  series={[{ key: "count", name: "Orders", color: "#3b82f6" }]}
                  layout="vertical"
                  isDark={true}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Order Status Data</div>
              )}
            </CardContent>
          </Card>

          {/* Batch Status Distribution - Canvas Bar Chart */}
          <Card className="rounded-none shadow-none border-border/40">
            <CardHeader>
              <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Batch Status Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              {batchStatusData.length > 0 ? (
                <CanvasBarChart
                  data={batchStatusData}
                  xAxisKey="status"
                  series={[{ key: "count", name: "Batches", color: "#10b981" }]}
                  layout="vertical"
                  isDark={true}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Batch Status Data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Warehouse Performance - Composed Canvas Chart */}
        <Card className="rounded-none shadow-none border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold font-mono uppercase tracking-wider text-foreground">Warehouse Performance Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {warehousePerformanceData.length > 0 ? (
              <CanvasComposedChart
                data={warehousePerformanceData}
                xAxisKey="warehouse"
                barSeries={[
                  { key: "orders", name: "Orders", color: "#3b82f6" },
                  { key: "batches", name: "Batches", color: "#10b981" }
                ]}
                lineSeries={{ key: "utilization", name: "Utilization %", color: "#f59e0b" }}
                isDark={true}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Warehouse Performance Data</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
