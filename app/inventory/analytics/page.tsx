'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, TrendingUp, Package, Warehouse } from 'lucide-react';
import { AnalyticsPageSkeleton } from '@/components/ui/loading-skeletons';
import {
  BarChart,
  Bar,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

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
    if (status === 'unauthenticated') {
      router.push('/auth/inventory');
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'inventory' && session?.user?.role !== 'admin') {
        router.push('/auth/inventory');
      }
    }
  }, [status, router, session]);

  const fetchAllData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const [warehouseRes, stockRes, batchRes, orderRes] = await Promise.all([
        fetch('/api/inventory/warehouse'),
        fetch('/api/inventory/stock'),
        fetch('/api/inventory/batch'),
        fetch('/api/inventory/orders'),
      ]);

      if (warehouseRes.ok) {
        const data = await warehouseRes.json();
        setWarehouses(data.warehouses);
      }
      if (stockRes.ok) {
        const data = await stockRes.json();
        setStockItems(data.items);
      }
      if (batchRes.ok) {
        const data = await batchRes.json();
        setBatches(data.batches);
      }
      if (orderRes.ok) {
        const data = await orderRes.json();
        setOrders(data.orders);
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
  const filteredStockItems = selectedWarehouse === 'all' 
    ? stockItems 
    : stockItems.filter(item => item.warehouse === selectedWarehouse);
  
  const filteredBatches = selectedWarehouse === 'all'
    ? batches
    : batches.filter(batch => batch.warehouse === selectedWarehouse);
  
  const filteredOrders = selectedWarehouse === 'all'
    ? orders
    : orders.filter(order => order.warehouse === selectedWarehouse);

  // Warehouse Utilization Radar Chart Data
  const warehouseUtilizationData = warehouses.map(wh => ({
    warehouse: wh.name,
    utilization: ((wh.currentUtilization / wh.capacity) * 100).toFixed(1),
    capacity: wh.capacity,
    used: wh.currentUtilization,
    available: wh.capacity - wh.currentUtilization,
  }));

  // Stock Levels by Warehouse (Composed Chart)
  const stockByWarehouseData = warehouses.map(wh => {
    const whStock = stockItems.filter(item => item.warehouse === wh.name);
    return {
      warehouse: wh.name,
      totalItems: whStock.length,
      totalQuantity: whStock.reduce((sum, item) => sum + item.quantity, 0),
      totalValue: whStock.reduce((sum, item) => sum + item.totalValue, 0) / 1000, // In thousands
    };
  });

  // Stock by Category (Pie Chart)
  const categoryData = filteredStockItems.reduce((acc, item) => {
    const existing = acc.find(c => c.name === item.category);
    if (existing) {
      existing.value += item.quantity;
      existing.count += 1;
    } else {
      acc.push({ name: item.category, value: item.quantity, count: 1 });
    }
    return acc;
  }, [] as { name: string; value: number; count: number }[]);

  // Inventory Value Distribution (Pie Chart)
  const valueDistributionData = filteredStockItems.reduce((acc, item) => {
    const existing = acc.find(c => c.name === item.category);
    if (existing) {
      existing.value += item.totalValue;
    } else {
      acc.push({ name: item.category, value: item.totalValue });
    }
    return acc;
  }, [] as { name: string; value: number }[]);

  // Order Status Distribution
  const orderStatusData = [
    { status: 'Pending', count: filteredOrders.filter(o => o.status === 'pending').length },
    { status: 'Processing', count: filteredOrders.filter(o => o.status === 'processing').length },
    { status: 'Fulfilled', count: filteredOrders.filter(o => o.status === 'fulfilled').length },
    { status: 'Shipped', count: filteredOrders.filter(o => o.status === 'shipped').length },
    { status: 'Delivered', count: filteredOrders.filter(o => o.status === 'delivered').length },
  ].filter(d => d.count > 0);

  // Batch Status Distribution
  const batchStatusData = [
    { status: 'Active', count: filteredBatches.filter(b => b.status === 'active').length },
    { status: 'Quarantine', count: filteredBatches.filter(b => b.status === 'quarantine').length },
    { status: 'Released', count: filteredBatches.filter(b => b.status === 'released').length },
  ].filter(d => d.count > 0);

  // Order Trends (Last 7 days - Area Chart)
  const orderTrendsData = Array.from({ length: 7 }, (_, i) => {
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

  // Top Items by Quantity (Bar Chart)
  const topItemsData = [...filteredStockItems]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)
    .map(item => ({
      name: item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name,
      quantity: item.quantity,
      value: item.totalValue / 1000, // In thousands
    }));

  // Warehouse Performance (Composed Chart)
  const warehousePerformanceData = warehouses.map(wh => {
    const whOrders = orders.filter(o => o.warehouse === wh.name);
    const whBatches = batches.filter(b => b.warehouse === wh.name);
    
    return {
      warehouse: wh.name,
      orders: whOrders.length,
      batches: whBatches.length,
      utilization: ((wh.currentUtilization / wh.capacity) * 100).toFixed(0),
    };
  });

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
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
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Comprehensive data visualization and insights across all warehouses
            </p>
          </div>
          <div className="flex gap-3">
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Warehouses</SelectItem>
                {warehouses.map(wh => (
                  <SelectItem key={wh._id} value={wh.name}>
                    {wh.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Warehouses</CardTitle>
              <Warehouse className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{warehouses.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {warehouses.filter(w => w.status === 'active').length} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Stock Items</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredStockItems.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {filteredStockItems.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} units
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <BarChart3 className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredOrders.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {filteredOrders.filter(o => o.status === 'pending').length} pending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₹{(filteredStockItems.reduce((sum, item) => sum + item.totalValue, 0) / 1000).toFixed(1)}K
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {filteredStockItems.length} items
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Warehouse Utilization Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Warehouse Utilization Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={warehouseUtilizationData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="warehouse" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar name="Utilization %" dataKey="utilization" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                <Tooltip />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Stock Levels by Warehouse - Composed Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Stock Levels by Warehouse</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={stockByWarehouseData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="warehouse" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="totalItems" fill="#3b82f6" name="Total Items" />
                <Bar yAxisId="left" dataKey="totalQuantity" fill="#10b981" name="Total Quantity" />
                <Line yAxisId="right" type="monotone" dataKey="totalValue" stroke="#f59e0b" name="Value (₹K)" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock by Category - Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Stock Distribution by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: { name?: string; percent?: number }) => {
                      if (!entry.name || entry.percent === undefined) return '';
                      return `${entry.name}: ${(entry.percent * 100).toFixed(0)}%`;
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Inventory Value Distribution - Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Inventory Value Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={valueDistributionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: { name?: string; value?: number }) => {
                      if (!entry.name || entry.value === undefined) return '';
                      return `${entry.name}: ₹${(entry.value / 1000).toFixed(1)}K`;
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {valueDistributionData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `₹${(value / 1000).toFixed(2)}K`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Order Trends - Area Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Order Trends (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={orderTrendsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="orders" stackId="1" stroke="#3b82f6" fill="#3b82f6" name="Order Count" />
                <Area type="monotone" dataKey="quantity" stackId="2" stroke="#10b981" fill="#10b981" name="Total Quantity" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Items by Quantity - Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Items by Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={topItemsData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantity" fill="#3b82f6" name="Quantity" />
                <Bar dataKey="value" fill="#10b981" name="Value (₹K)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Order Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={orderStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" name="Orders">
                    {orderStatusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Batch Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Batch Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={batchStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" name="Batches">
                    {batchStatusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Warehouse Performance - Composed Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Warehouse Performance Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={warehousePerformanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="warehouse" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="orders" fill="#3b82f6" name="Orders" />
                <Bar yAxisId="left" dataKey="batches" fill="#10b981" name="Batches" />
                <Line yAxisId="right" type="monotone" dataKey="utilization" stroke="#f59e0b" name="Utilization %" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
