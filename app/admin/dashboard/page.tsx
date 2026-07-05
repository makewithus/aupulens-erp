"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import {
  Users,
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  TrendingDown,
  Factory,
  CheckCircle,
  XCircle,
  FileText,
  Wallet,
  ShoppingBag,
  Activity,
} from "lucide-react";
import { StatsRowSkeleton, FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
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

interface DashboardSummary {
  finance: {
    totalRevenue: number;
    revenueCurrentMonth: number;
    revenueChange: number;
    totalExpenses: number;
    expensesCurrentMonth: number;
    netIncome: number;
    totalTransactions: number;
    draftInvoices: number;
  };
  sales: {
    totalOrders: number;
    ordersCurrentMonth: number;
    ordersChange: number;
    totalCustomers: number;
    newCustomersThisMonth: number;
  };
  inventory: {
    totalProducts: number;
    publishedProducts: number;
    draftProducts: number;
    totalStockTransfers: number;
  };
  manufacturing: {
    totalManufacturingOrders: number;
  };
  users: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
  };
  chartData: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/admin");
    } else if (status === "authenticated") {
      if (
        session?.user?.role !== "admin" &&
        session?.user?.role !== "master-admin"
      ) {
        router.push("/auth/admin");
      } else {
        fetchDashboardData();
      }
    }
  }, [status, session, router]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard");
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getChangeIndicator = (change: number) => {
    if (change > 0) {
      return {
        icon: TrendingUp,
        color: "text-emerald-600",
        bg: "bg-emerald-500/10",
      };
    } else if (change < 0) {
      return {
        icon: TrendingDown,
        color: "text-rose-600",
        bg: "bg-rose-500/10",
      };
    }
    return {
      icon: Activity,
      color: "text-muted-foreground",
      bg: "bg-muted",
    };
  };

  if (status === "loading") {
    return <FullPageLoadingSkeleton />;
  }

  if (status === "unauthenticated") {
    return null;
  }

  if (isLoading) {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin"
        pageName="System Overview"
        userName={session?.user?.name || "Admin"}
        userEmail={session?.user?.email}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
        onRefresh={fetchDashboardData}
        profilePath="/admin/profile"
      >
        <div className="space-y-6">
          <StatsRowSkeleton count={6} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="none-4xl border-2 h-[400px]" />
            <Card className="none-4xl border-2 h-[400px]" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!summary) {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin"
        pageName="System Overview"
        userName={session?.user?.name || ""}
        userEmail={session?.user?.email || ""}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
        onRefresh={fetchDashboardData}
        profilePath="/admin/profile"
      >
        <div className="h-[60vh] flex flex-col items-center justify-center opacity-20">
          <Activity className="h-24 w-24 mb-4" />
          <p className="text-xl font-black uppercase tracking-widest">
            No Data Available
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const revenueIndicator = getChangeIndicator(summary.finance.revenueChange);
  const ordersIndicator = getChangeIndicator(summary.sales.ordersChange);

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin"
      pageName="System Overview"
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Overview" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={fetchDashboardData}
      profilePath="/admin/profile"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">
            System Overview
          </h1>
          <p className="text-sm font-bold text-muted-foreground uppercase opacity-60 tracking-wider">
            Real-time metrics across all ERP modules
          </p>
        </div>

        {/* Main Stats Grid - 6 cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Revenue */}
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-emerald-500/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <DollarSign className="h-6 w-6 text-emerald-600 group-hover:text-white" />
                </div>
                <div
                  className={`flex items-center gap-1 px-2 py-1 none-lg ${revenueIndicator.bg} ${revenueIndicator.color} text-[10px] font-black`}
                >
                  <revenueIndicator.icon className="h-3 w-3" />
                  {Math.abs(summary.finance.revenueChange).toFixed(1)}%
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Total Revenue
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-emerald-600">
                {formatCurrency(summary.finance.totalRevenue)}
              </h3>
              <p className="text-xs font-bold text-muted-foreground mt-2">
                {formatCurrency(summary.finance.revenueCurrentMonth)} this month
              </p>
              {summary.finance.totalRevenue === 0 && (
                <div className="mt-3 p-2 none-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-[9px] font-bold text-amber-600 uppercase">
                    {summary.finance.draftInvoices > 0
                      ? `⚠️ ${summary.finance.draftInvoices} draft invoices need posting`
                      : summary.sales.totalOrders > 0
                        ? `⚠️ ${summary.sales.totalOrders} orders pending invoicing`
                        : "⚠️ No revenue data"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Orders */}
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-blue-500/5 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
                  <ShoppingCart className="h-6 w-6 text-blue-600 group-hover:text-white" />
                </div>
                <div
                  className={`flex items-center gap-1 px-2 py-1 none-lg ${ordersIndicator.bg} ${ordersIndicator.color} text-[10px] font-black`}
                >
                  <ordersIndicator.icon className="h-3 w-3" />
                  {Math.abs(summary.sales.ordersChange).toFixed(1)}%
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Sales Orders
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-blue-600">
                {summary.sales.totalOrders}
              </h3>
              <p className="text-xs font-bold text-muted-foreground mt-2">
                {summary.sales.ordersCurrentMonth} this month
              </p>
            </CardContent>
          </Card>

          {/* Customers */}
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-purple-500/5 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-all">
                  <ShoppingBag className="h-6 w-6 text-purple-600 group-hover:text-white" />
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Total Customers
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-purple-600">
                {summary.sales.totalCustomers}
              </h3>
              <p className="text-xs font-bold text-muted-foreground mt-2">
                +{summary.sales.newCustomersThisMonth} new this month
              </p>
            </CardContent>
          </Card>

          {/* Products */}
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-amber-500/5 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <Package className="h-6 w-6 text-amber-600 group-hover:text-white" />
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Product Catalog
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-amber-600">
                {summary.inventory.totalProducts}
              </h3>
              <p className="text-xs font-bold text-muted-foreground mt-2">
                {summary.inventory.publishedProducts} published ·{" "}
                {summary.inventory.draftProducts} draft
              </p>
            </CardContent>
          </Card>

          {/* Manufacturing */}
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-indigo-500/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                  <Factory className="h-6 w-6 text-indigo-600 group-hover:text-white" />
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                Manufacturing Orders
              </p>
              <h3 className="text-3xl font-black tracking-tighter text-indigo-600">
                {summary.manufacturing.totalManufacturingOrders}
              </h3>
              <p className="text-xs font-bold text-muted-foreground mt-2">
                Production & Assembly
              </p>
            </CardContent>
          </Card>

          {/* Users */}
          <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 none-xl bg-primary/5 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                  <Users className="h-6 w-6 text-primary group-hover:text-white" />
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                System Users
              </p>
              <h3 className="text-3xl font-black tracking-tighter">
                {summary.users.totalUsers}
              </h3>
              <p className="text-xs font-bold text-muted-foreground mt-2">
                {summary.users.activeUsers} active ·{" "}
                {summary.users.inactiveUsers} inactive
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Net Profit/Loss Card - Prominent */}
        <Card className="none-4xl border-2 shadow-xl overflow-hidden">
          <div
            className={`p-6 border-b-2 flex items-center gap-3 ${
              summary.finance.netIncome >= 0
                ? "bg-emerald-500/5"
                : "bg-rose-500/5"
            }`}
          >
            <Wallet
              className={`h-5 w-5 ${
                summary.finance.netIncome >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}
            />
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight">
                Net Profit / Loss
              </h3>
              <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                Revenue - Expenses
              </p>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <p
                className={`text-5xl font-black tracking-tighter ${
                  summary.finance.netIncome >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {formatCurrency(summary.finance.netIncome)}
              </p>
              <p className="text-xs font-bold text-muted-foreground mt-2 uppercase">
                {summary.finance.netIncome >= 0 ? "PROFIT" : "LOSS"} this period
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 none-xl bg-emerald-500/5 border-2 border-emerald-500/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">
                  Revenue
                </p>
                <p className="text-xl font-black text-emerald-600">
                  {formatCurrency(summary.finance.totalRevenue)}
                </p>
              </div>
              <div className="p-4 none-xl bg-rose-500/5 border-2 border-rose-500/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-1">
                  Expenses
                </p>
                <p className="text-xl font-black text-rose-600">
                  {formatCurrency(summary.finance.totalExpenses)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profit/Loss Pie Chart */}
          <Card className="none-4xl border-2 shadow-xl overflow-hidden">
            <div className="p-6 border-b-2 bg-muted/30 flex items-center gap-3">
              <Activity className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">
                  Financial Breakdown
                </h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                  Revenue vs Expenses
                </p>
              </div>
            </div>
            <CardContent className="p-6">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      {
                        name: "Revenue",
                        value: summary.finance.totalRevenue,
                        color: "hsl(142, 76%, 36%)",
                      },
                      {
                        name: "Expenses",
                        value: summary.finance.totalExpenses,
                        color: "hsl(0, 84%, 60%)",
                      },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: { name?: string; value?: number }) =>
                      `${entry.name}: ${formatCurrency(entry.value ?? 0)}`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[
                      {
                        name: "Revenue",
                        value: summary.finance.totalRevenue,
                        color: "hsl(142, 76%, 36%)",
                      },
                      {
                        name: "Expenses",
                        value: summary.finance.totalExpenses,
                        color: "hsl(0, 84%, 60%)",
                      },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "2px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--background))",
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: "11px",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Revenue Trend Chart */}
          <Card className="none-4xl border-2 shadow-xl overflow-hidden">
            <div className="p-6 border-b-2 bg-muted/30 flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">
                  Revenue Trend
                </h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                  Last 6 months performance
                </p>
              </div>
            </div>
            <CardContent className="p-6">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={summary.chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    fontWeight="bold"
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    fontWeight="bold"
                    tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "2px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--background))",
                    }}
                    formatter={(value: number) => [
                      formatCurrency(value),
                      "Revenue",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: "11px",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(142, 76%, 36%)"
                    strokeWidth={3}
                    dot={{ fill: "hsl(142, 76%, 36%)", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Orders Bar Chart */}
          <Card className="none-4xl border-2 shadow-xl overflow-hidden">
            <div className="p-6 border-b-2 bg-muted/30 flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">
                  Orders Volume
                </h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                  Monthly order count
                </p>
              </div>
            </div>
            <CardContent className="p-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={summary.chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    fontWeight="bold"
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    fontWeight="bold"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "2px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--background))",
                    }}
                    formatter={(value: number) => [value, "Orders"]}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: "11px",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                    }}
                  />
                  <Bar
                    dataKey="orders"
                    fill="hsl(217, 91%, 60%)"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="none-3xl border-2 p-6 hover:border-primary/20 transition-all group">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 none-xl bg-muted flex items-center justify-center group-hover:bg-primary/5">
                <Wallet className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                  Net Income
                </p>
                <p className="text-2xl font-black tracking-tight my-1">
                  {formatCurrency(summary.finance.netIncome)}
                </p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-40">
                  Revenue - Expenses
                </p>
              </div>
            </div>
          </Card>

          <Card className="none-3xl border-2 p-6 hover:border-primary/20 transition-all group">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 none-xl bg-muted flex items-center justify-center group-hover:bg-primary/5">
                <FileText className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                  Transactions
                </p>
                <p className="text-2xl font-black tracking-tight my-1">
                  {summary.finance.totalTransactions}
                </p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-40">
                  Payment Records
                </p>
              </div>
            </div>
          </Card>

          <Card className="none-3xl border-2 p-6 hover:border-primary/20 transition-all group">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 none-xl bg-muted flex items-center justify-center group-hover:bg-primary/5">
                <Activity className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                  Stock Transfers
                </p>
                <p className="text-2xl font-black tracking-tight my-1">
                  {summary.inventory.totalStockTransfers}
                </p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-40">
                  Receipts & Deliveries
                </p>
              </div>
            </div>
          </Card>

          <Card className="none-3xl border-2 p-6 hover:border-primary/20 transition-all group">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 none-xl bg-muted flex items-center justify-center group-hover:bg-primary/5">
                <DollarSign className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                  Total Expenses
                </p>
                <p className="text-2xl font-black tracking-tight my-1">
                  {formatCurrency(summary.finance.totalExpenses)}
                </p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-40">
                  {formatCurrency(summary.finance.expensesCurrentMonth)} this
                  month
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
