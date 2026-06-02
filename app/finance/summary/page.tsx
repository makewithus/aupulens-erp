"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Receipt,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Calendar,
  FileText,
  ShoppingCart,
  Undo2,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import {
  StatsRowSkeleton,
  ChartSkeleton,
} from "@/components/ui/loading-skeletons";

interface FinanceSummary {
  revenue: { current: number; previous: number; change: number };
  expenses: { current: number; previous: number; change: number };
  netIncome: { current: number; previous: number; change: number };
  cashFlow: { current: number; previous: number; change: number };
  accountsReceivable: { total: number; overdue: number };
  accountsPayable: { total: number; overdue: number };
  matrices?: {
    workingCapital: number;
    currentRatio: number;
    quickRatio: number;
    profitMargin: number;
    avgCollectionPeriod: number;
    payablesTurnover: number;
  };
  recentTransactions?: {
    bills: Array<{
      _id: string;
      name: string;
      partner: string;
      amount: number;
      state: string;
      date: string;
    }>;
    invoices: Array<{
      _id: string;
      name: string;
      partner: string;
      amount: number;
      state: string;
      date: string;
    }>;
    expenses: Array<{
      _id: string;
      name: string;
      employee: string;
      amount: number;
      status: string;
      date: string;
    }>;
    returns: Array<{
      _id: string;
      name: string;
      partner: string;
      status: string;
      date: string;
    }>;
  };
}

export default function FinanceSummaryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/finance/summary");
      if (!res.ok) throw new Error("Failed to fetch summary");
      const data = await res.json();
      setSummary(data.summary);
      setError("");
    } catch (err) {
      console.error("Error fetching summary:", err);
      setError("Failed to load financial summary");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/finance");
    } else if (status === "authenticated") {
      fetchSummary();
    }
  }, [status, router, fetchSummary]);

  const formatCurrency = (amount?: number) => {
    const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getMetricVariant = (change: number, reverse: boolean = false) => {
    if (change === 0) return { color: "text-muted-foreground", icon: Activity };
    const positive = change > 0;
    const isGood = reverse ? !positive : positive;
    return {
      color: isGood ? "text-emerald-500" : "text-rose-500",
      bg: isGood ? "bg-emerald-500/10" : "bg-rose-500/10",
      icon: positive ? ArrowUpRight : ArrowDownRight,
    };
  };

  const widgets = useMemo(() => {
    if (!summary) return [];
    return [
      {
        title: "Total Revenue",
        value: formatCurrency(summary.revenue.current),
        change: summary.revenue.change,
        icon: DollarSign,
        color: "blue",
        reverse: false,
      },
      {
        title: "Total Expenses",
        value: formatCurrency(summary.expenses.current),
        change: summary.expenses.change,
        icon: CreditCard,
        color: "rose",
        reverse: true,
      },
      {
        title: "Net Income",
        value: formatCurrency(summary.netIncome.current),
        change: summary.netIncome.change,
        icon: Wallet,
        color: "emerald",
        reverse: false,
      },
      {
        title: "Cash Flow",
        value: formatCurrency(summary.cashFlow.current),
        change: summary.cashFlow.change,
        icon: Activity,
        color: "purple",
        reverse: false,
      },
    ];
  }, [summary]);

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      dashboardTitle="Finance"
      pageName="Dashboard"
      breadcrumbs={[{ label: "Finance" }, { label: "Summary" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={fetchSummary}
      profilePath="/finance/profile"
    >
      <div className="space-y-8 max-w-[1600px] mx-auto pb-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">
              Financial Summary
            </h1>
            <p className="text-sm font-bold text-muted-foreground uppercase opacity-60 tracking-wider">
              Real-time performance metrics and ledger overview
            </p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 none-xl border-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              {new Date().toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="none-3xl border-2 h-32" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="none-3xl border-2 h-[400px]" />
              <Card className="none-3xl border-2 h-[400px]" />
            </div>
          </div>
        ) : summary ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {widgets.map((w, i) => {
                const variant = getMetricVariant(w.change, w.reverse);
                return (
                  <Card
                    key={i}
                    className="none-3xl border-2 shadow-xl shadow-primary/5 hover:shadow-primary/10 transition-all group overflow-hidden"
                  >
                    <CardContent className="p-6 relative">
                      <div className="flex justify-between items-start mb-4">
                        <div
                          className={`h-12 w-12 none-2xl flex items-center justify-center bg-primary/5 group-hover:bg-primary group-hover:text-white transition-all`}
                        >
                          <w.icon className="h-6 w-6" />
                        </div>
                        <div
                          className={`flex items-center gap-1 px-2 py-1 none-lg ${variant.bg} ${variant.color} text-[10px] font-black`}
                        >
                          <variant.icon className="h-3 w-3" />
                          {Math.abs(w.change).toFixed(1)}%
                        </div>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                        {w.title}
                      </p>
                      <h3 className="text-3xl font-black tracking-tighter tabular-nums">
                        {w.value}
                      </h3>
                      <div className="absolute top-0 right-0 h-full w-2 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Recent Transactions Section */}
            {summary.recentTransactions && (
              <div className="space-y-6 mt-8">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-primary">
                  Recent Activity
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Recent Bills */}
                  <Card className="none-4xl border-2 overflow-hidden">
                    <div className="p-6 border-b-2 bg-rose-500/5 flex items-center gap-3">
                      <Receipt className="h-5 w-5 text-rose-600" />
                      <h3 className="text-sm font-black uppercase tracking-tight">
                        Recent Vendor Bills
                      </h3>
                    </div>
                    <CardContent className="p-0">
                      {summary.recentTransactions.bills.length > 0 ? (
                        <div className="divide-y-2">
                          {summary.recentTransactions.bills.map((bill) => (
                            <div
                              key={bill._id}
                              onClick={() => router.push("/finance/bills")}
                              className="p-4 hover:bg-primary/5 cursor-pointer transition-colors group"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-black text-sm">
                                    {bill.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground font-bold">
                                    {bill.partner}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-rose-600">
                                    {formatCurrency(bill.amount)}
                                  </p>
                                  <span
                                    className={cn(
                                      "text-[9px] font-black uppercase px-2 py-0.5 none-full",
                                      bill.state === "posted"
                                        ? "bg-emerald-500/10 text-emerald-600"
                                        : "bg-amber-500/10 text-amber-600",
                                    )}
                                  >
                                    {bill.state}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium">
                                {new Date(bill.date).toLocaleDateString(
                                  "en-IN",
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-muted-foreground opacity-40">
                          <Receipt className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-xs font-bold uppercase">
                            No recent bills
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Recent Invoices */}
                  <Card className="none-4xl border-2 overflow-hidden">
                    <div className="p-6 border-b-2 bg-blue-500/5 flex items-center gap-3">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <h3 className="text-sm font-black uppercase tracking-tight">
                        Recent Customer Invoices
                      </h3>
                    </div>
                    <CardContent className="p-0">
                      {summary.recentTransactions.invoices.length > 0 ? (
                        <div className="divide-y-2">
                          {summary.recentTransactions.invoices.map((inv) => (
                            <div
                              key={inv._id}
                              onClick={() => router.push("/finance/invoices")}
                              className="p-4 hover:bg-primary/5 cursor-pointer transition-colors group"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-black text-sm">
                                    {inv.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground font-bold">
                                    {inv.partner}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-blue-600">
                                    {formatCurrency(inv.amount)}
                                  </p>
                                  <span
                                    className={cn(
                                      "text-[9px] font-black uppercase px-2 py-0.5 none-full",
                                      inv.state === "posted"
                                        ? "bg-emerald-500/10 text-emerald-600"
                                        : "bg-amber-500/10 text-amber-600",
                                    )}
                                  >
                                    {inv.state}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium">
                                {new Date(inv.date).toLocaleDateString("en-IN")}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-muted-foreground opacity-40">
                          <FileText className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-xs font-bold uppercase">
                            No recent invoices
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Recent Expenses */}
                  <Card className="none-4xl border-2 overflow-hidden">
                    <div className="p-6 border-b-2 bg-purple-500/5 flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-purple-600" />
                      <h3 className="text-sm font-black uppercase tracking-tight">
                        Recent Employee Expenses
                      </h3>
                    </div>
                    <CardContent className="p-0">
                      {summary.recentTransactions.expenses.length > 0 ? (
                        <div className="divide-y-2">
                          {summary.recentTransactions.expenses.map((exp) => (
                            <div
                              key={exp._id}
                              onClick={() => router.push("/finance/expenses")}
                              className="p-4 hover:bg-primary/5 cursor-pointer transition-colors group"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-black text-sm">
                                    {exp.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground font-bold flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {exp.employee}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-purple-600">
                                    {formatCurrency(exp.amount)}
                                  </p>
                                  <span
                                    className={cn(
                                      "text-[9px] font-black uppercase px-2 py-0.5 none-full",
                                      exp.status === "approved"
                                        ? "bg-emerald-500/10 text-emerald-600"
                                        : exp.status === "rejected"
                                          ? "bg-rose-500/10 text-rose-600"
                                          : "bg-amber-500/10 text-amber-600",
                                    )}
                                  >
                                    {exp.status}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium">
                                {new Date(exp.date).toLocaleDateString("en-IN")}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-muted-foreground opacity-40">
                          <CreditCard className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-xs font-bold uppercase">
                            No recent expenses
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Recent Returns */}
                  <Card className="none-4xl border-2 overflow-hidden">
                    <div className="p-6 border-b-2 bg-amber-500/5 flex items-center gap-3">
                      <Undo2 className="h-5 w-5 text-amber-600" />
                      <h3 className="text-sm font-black uppercase tracking-tight">
                        Recent Returns
                      </h3>
                    </div>
                    <CardContent className="p-0">
                      {summary.recentTransactions.returns.length > 0 ? (
                        <div className="divide-y-2">
                          {summary.recentTransactions.returns.map((ret) => (
                            <div
                              key={ret._id}
                              onClick={() => router.push("/finance/returns")}
                              className="p-4 hover:bg-primary/5 cursor-pointer transition-colors group"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-black text-sm">
                                    {ret.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground font-bold">
                                    {ret.partner}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    "text-[9px] font-black uppercase px-2 py-0.5 none-full",
                                    ret.status === "done"
                                      ? "bg-emerald-500/10 text-emerald-600"
                                      : "bg-amber-500/10 text-amber-600",
                                  )}
                                >
                                  {ret.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium">
                                {new Date(ret.date).toLocaleDateString("en-IN")}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-muted-foreground opacity-40">
                          <Undo2 className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-xs font-bold uppercase">
                            No recent returns
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4 opacity-20">
            <Activity className="h-24 w-24" />
            <p className="text-xl font-black uppercase tracking-widest">
              Financial data pipeline offline
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
