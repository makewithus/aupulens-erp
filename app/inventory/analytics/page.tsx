'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnalyticsPageSkeleton } from '@/components/ui/loading-skeletons';
import {
  CanvasBarChart,
  CanvasPieChart,
  CanvasComposedChart,
} from '@/components/inventory/CanvasCharts';
import { DailyBrickBarChart } from '@/components/charts/DailyBrickBarChart';
import { TradingLineChart } from '@/components/charts/TradingLineChart';
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

const DEMO_WAREHOUSES: Warehouse[] = [
  { _id: 'wh-1', warehouseCode: 'MUM-01', name: 'Mumbai Central Hub', type: 'Distribution', capacity: 15000, currentUtilization: 11400, status: 'active' },
  { _id: 'wh-2', warehouseCode: 'BHW-02', name: 'Bhiwandi Fulfillment Ctr', type: 'Fulfillment', capacity: 25000, currentUtilization: 19800, status: 'active' },
  { _id: 'wh-3', warehouseCode: 'PUN-03', name: 'Pune Regional Depot', type: 'Depot', capacity: 8000, currentUtilization: 4900, status: 'active' },
  { _id: 'wh-4', warehouseCode: 'AMD-04', name: 'Ahmedabad Logistics Park', type: 'Logistics', capacity: 12000, currentUtilization: 8200, status: 'active' },
  { _id: 'wh-5', warehouseCode: 'BLR-05', name: 'Bengaluru South Facility', type: 'Distribution', capacity: 18000, currentUtilization: 14200, status: 'active' },
];

const DEMO_STOCK_ITEMS: StockItem[] = [
  { _id: 'stk-1', itemCode: 'PRD-BEARING', name: 'Ball Bearing 6205', category: 'Mechanical Components', quantity: 3450, warehouse: 'Mumbai Central Hub', unitCost: 420, totalValue: 1449000 },
  { _id: 'stk-2', itemCode: 'PRD-SOLAR5', name: 'Solar Inverter 5kW', category: 'Renewable & Power', quantity: 180, warehouse: 'Bhiwandi Fulfillment Ctr', unitCost: 42000, totalValue: 7560000 },
  { _id: 'stk-3', itemCode: 'PRD-PKG', name: 'Industrial Film Roll', category: 'Packaging Materials', quantity: 1820, warehouse: 'Pune Regional Depot', unitCost: 850, totalValue: 1547000 },
  { _id: 'stk-4', itemCode: 'PRD-RACK', name: 'Warehouse Pallet Rack', category: 'Storage Systems', quantity: 420, warehouse: 'Bhiwandi Fulfillment Ctr', unitCost: 9800, totalValue: 4116000 },
  { _id: 'stk-5', itemCode: 'PRD-CHAIR', name: 'Ergonomic Task Chair', category: 'Commercial Furniture', quantity: 640, warehouse: 'Ahmedabad Logistics Park', unitCost: 6500, totalValue: 4160000 },
  { _id: 'stk-6', itemCode: 'PRD-LUB', name: 'Gear Lubricant ISO 220', category: 'Chemicals & Consumables', quantity: 950, warehouse: 'Bengaluru South Facility', unitCost: 1200, totalValue: 1140000 },
  { _id: 'stk-7', itemCode: 'PRD-MOTOR', name: 'Induction Motor 7.5HP', category: 'Electrical Equipment', quantity: 210, warehouse: 'Mumbai Central Hub', unitCost: 28500, totalValue: 5985000 },
  { _id: 'stk-8', itemCode: 'PRD-VALVE', name: 'Control Solenoid Valve', category: 'Automation & Controls', quantity: 780, warehouse: 'Pune Regional Depot', unitCost: 3400, totalValue: 2652000 },
];

const DEMO_BATCHES: Batch[] = [
  { _id: 'b-1', batchNumber: 'BAT-2026-001', warehouse: 'Mumbai Central Hub', quantity: 1200, status: 'active', expiryDate: '2028-01-15' },
  { _id: 'b-2', batchNumber: 'BAT-2026-002', warehouse: 'Bhiwandi Fulfillment Ctr', quantity: 95, status: 'released', expiryDate: '2031-02-10' },
  { _id: 'b-3', batchNumber: 'BAT-2026-003', warehouse: 'Pune Regional Depot', quantity: 800, status: 'active', expiryDate: '2027-03-01' },
  { _id: 'b-4', batchNumber: 'BAT-2026-004', warehouse: 'Bengaluru South Facility', quantity: 240, status: 'quarantine', expiryDate: '2027-08-25' },
];

const DEMO_ORDERS: Order[] = [
  { _id: 'ord-1', orderNumber: 'SO-2026-101', status: 'delivered', warehouse: 'Mumbai Central Hub', items: [{ itemCode: 'PRD-BEARING', quantity: 50 }], totalQuantity: 50, orderDate: '2026-03-01' },
  { _id: 'ord-2', orderNumber: 'SO-2026-102', status: 'shipped', warehouse: 'Bhiwandi Fulfillment Ctr', items: [{ itemCode: 'PRD-SOLAR5', quantity: 4 }], totalQuantity: 4, orderDate: '2026-03-05' },
  { _id: 'ord-3', orderNumber: 'SO-2026-103', status: 'fulfilled', warehouse: 'Pune Regional Depot', items: [{ itemCode: 'PRD-PKG', quantity: 25 }], totalQuantity: 25, orderDate: '2026-03-08' },
  { _id: 'ord-4', orderNumber: 'SO-2026-104', status: 'processing', warehouse: 'Ahmedabad Logistics Park', items: [{ itemCode: 'PRD-CHAIR', quantity: 12 }], totalQuantity: 12, orderDate: '2026-03-11' },
  { _id: 'ord-5', orderNumber: 'SO-2026-105', status: 'pending', warehouse: 'Bengaluru South Facility', items: [{ itemCode: 'PRD-MOTOR', quantity: 6 }], totalQuantity: 6, orderDate: '2026-03-12' },
];

export default function InventoryAnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [dateRange, setDateRange] = useState('30');

  const [warehouses, setWarehouses] = useState<Warehouse[]>(DEMO_WAREHOUSES);
  const [stockItems, setStockItems] = useState<StockItem[]>(DEMO_STOCK_ITEMS);
  const [batches, setBatches] = useState<Batch[]>(DEMO_BATCHES);
  const [orders, setOrders] = useState<Order[]>(DEMO_ORDERS);

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
        if (data.warehouses && data.warehouses.length > 0) {
          setWarehouses(data.warehouses);
        }
      }
      if (stockRes.ok) {
        const data = await stockRes.json();
        if (data.items && data.items.length > 0) {
          setStockItems(data.items);
        }
      }
      if (batchRes.ok) {
        const data = await batchRes.json();
        if (data.batches && data.batches.length > 0) {
          setBatches(data.batches);
        }
      }
      if (orderRes.ok) {
        const data = await orderRes.json();
        if (data.orders && data.orders.length > 0) {
          setOrders(data.orders);
        }
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

  // Order Trends (90-day timeline for TradingLineChart zoom/pan/filtering)
  const orderTrendsData = useMemo(() => {
    return Array.from({ length: 90 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (89 - i));
      const dateStr = date.toISOString().split('T')[0];
      
      const dayOrders = filteredOrders.filter(o => {
        if (!o.orderDate) return false;
        try {
          const od = typeof o.orderDate === 'string' ? o.orderDate.split('T')[0] : new Date(o.orderDate).toISOString().split('T')[0];
          return od === dateStr;
        } catch {
          return false;
        }
      });
      
      // Calculate realistic quantity with organic wave pattern for demonstration
      const organicBaseline = Math.round(28 + 14 * Math.sin(i / 6.5) + ((i * 13) % 19));
      const realQty = dayOrders.reduce((sum, o) => sum + (o.totalQuantity || 0), 0);
      const quantity = realQty > 0 ? realQty : organicBaseline;

      return {
        date: dateStr,
        label: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' }),
        orders: dayOrders.length > 0 ? dayOrders.length : Math.max(1, Math.round(quantity / 8)),
        quantity: quantity,
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
      <div className="space-y-6 min-w-0 w-full max-w-full">
        {/* Header */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground dark:text-white break-words">Inventory Analytics</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger className="w-full sm:w-[200px] rounded-none">
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
              <SelectTrigger className="w-full sm:w-[150px] rounded-none">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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

        {/* Daily Inventory & Throughput Timeline (365 Days) */}
        <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
            <div>
              <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">
                Daily Throughput & Inventory Flow (365 Days)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Full 365-day timeline tracking each day individually with discrete segmented brick stacks
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 bg-[#d4d4d8] rounded-none"></span>
              <span className="text-[11px] font-mono text-muted-foreground">Daily Movements</span>
            </div>
          </CardHeader>
          <CardContent className="h-[320px] sm:h-[280px] px-3 sm:px-6">
            <DailyBrickBarChart
              metricLabel="Movements"
              valueKey="count"
              height="100%"
            />
          </CardContent>
        </Card>

        {/* Warehouse Utilization Canvas Bar Chart */}
        <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
          <CardHeader>
            <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Warehouse Utilization Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] min-w-0 px-3 sm:px-6">
            {warehouseUtilizationData.length > 0 ? (
              <CanvasBarChart
                data={warehouseUtilizationData}
                xAxisKey="warehouse"
                series={[{ key: "utilization", name: "Utilization %", color: "#3b82f6" }]}
                layout="vertical"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Utilization Data</div>
            )}
          </CardContent>
        </Card>

        {/* Stock Levels by Warehouse - Composed Canvas Chart */}
        <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
          <CardHeader>
            <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Stock Levels by Warehouse</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] min-w-0 px-3 sm:px-6">
            {stockByWarehouseData.length > 0 ? (
              <CanvasComposedChart
                data={stockByWarehouseData}
                xAxisKey="warehouse"
                barSeries={[
                  { key: "totalItems", name: "Total Items", color: "#3b82f6" },
                  { key: "totalQuantity", name: "Total Quantity", color: "#10b981" }
                ]}
                lineSeries={{ key: "totalValue", name: "Value (₹K)", color: "#f59e0b" }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Stock Levels Data</div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock by Category - Canvas Pie Chart */}
          <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
            <CardHeader>
              <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Stock Distribution by Category</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 px-3 sm:px-6">
              {categoryData.length > 0 ? (
                <CanvasPieChart
                  data={categoryData}
                  nameKey="name"
                  valueKey="value"
                  colors={COLORS}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Category Distribution Data</div>
              )}
            </CardContent>
          </Card>

          {/* Inventory Value Distribution - Canvas Pie Chart */}
          <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
            <CardHeader>
              <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Inventory Value Distribution</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 px-3 sm:px-6">
              {valueDistributionData.length > 0 ? (
                <CanvasPieChart
                  data={valueDistributionData}
                  nameKey="name"
                  valueKey="value"
                  colors={COLORS}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Value Distribution Data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Trends - Trading Line Chart with Zoom & Pan */}
        <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
          <CardHeader>
            <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Order Trends & Throughput Timeline</CardTitle>
          </CardHeader>
          <CardContent className="h-[480px] sm:h-[440px] min-h-0 min-w-0 p-0">
            <TradingLineChart
              key={dateRange}
              initialDays={Number(dateRange)}
              data={orderTrendsData}
              xAxisKey="date"
              valueKey="quantity"
              metricLabel="Order Quantity"
              title="ORDER VOLUME TREND"
              currencyPrefix=""
              height="100%"
            />
          </CardContent>
        </Card>

        {/* Top Items by Quantity - Horizontal Canvas Bar Chart */}
        <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
          <CardHeader>
            <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Top 10 Items by Quantity</CardTitle>
          </CardHeader>
          <CardContent className="h-[420px] min-w-0 px-3 sm:px-6">
            {topItemsData.length > 0 ? (
              <CanvasBarChart
                data={topItemsData}
                xAxisKey="name"
                series={[
                  { key: "quantity", name: "Quantity (units)", color: "#3b82f6" }
                ]}
                layout="horizontal"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Top Items Data</div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order Status Distribution - Canvas Bar Chart */}
          <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
            <CardHeader>
              <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Order Status Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px] min-w-0 px-3 sm:px-6">
              {orderStatusData.length > 0 ? (
                <CanvasBarChart
                  data={orderStatusData}
                  xAxisKey="status"
                  series={[{ key: "count", name: "Orders", color: "#3b82f6" }]}
                  layout="vertical"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Order Status Data</div>
              )}
            </CardContent>
          </Card>

          {/* Batch Status Distribution - Canvas Bar Chart */}
          <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
            <CardHeader>
              <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Batch Status Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px] min-w-0 px-3 sm:px-6">
              {batchStatusData.length > 0 ? (
                <CanvasBarChart
                  data={batchStatusData}
                  xAxisKey="status"
                  series={[{ key: "count", name: "Batches", color: "#10b981" }]}
                  layout="vertical"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No Batch Status Data</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Warehouse Performance - Composed Canvas Chart */}
        <Card className="relative min-w-0 rounded-none shadow-none border-border/60">
          <CardHeader>
            <CardTitle className="text-sm sm:text-base font-semibold font-mono uppercase tracking-wide leading-snug text-foreground">Warehouse Performance Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] min-w-0 px-3 sm:px-6">
            {warehousePerformanceData.length > 0 ? (
              <CanvasComposedChart
                data={warehousePerformanceData}
                xAxisKey="warehouse"
                barSeries={[
                  { key: "orders", name: "Orders", color: "#3b82f6" },
                  { key: "batches", name: "Batches", color: "#10b981" }
                ]}
                lineSeries={{ key: "utilization", name: "Utilization %", color: "#f59e0b" }}
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
