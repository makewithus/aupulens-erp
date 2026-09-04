"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  Undo2,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";

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
      const res = await cachedFetch("/api/finance/summary");
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
    if (status === "authenticated") {
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
    if (change === 0) return { color: "text-muted-foreground", bg: "bg-muted/10", icon: Activity };
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
        value: summary.revenue.current,
        change: summary.revenue.change,
        icon: DollarSign,
        visual: <UsersGraph />,
        reverse: false,
      },
      {
        title: "Total Expenses",
        value: summary.expenses.current,
        change: summary.expenses.change,
        icon: CreditCard,
        visual: <ActivePulse />,
        reverse: true,
      },
      {
        title: "Net Income",
        value: summary.netIncome.current,
        change: summary.netIncome.change,
        icon: Wallet,
        visual: <UsersGraph />,
        reverse: false,
      },
      {
        title: "Cash Flow",
        value: summary.cashFlow.current,
        change: summary.cashFlow.change,
        icon: Activity,
        visual: <ActivePulse />,
        reverse: false,
      },
    ];
  }, [summary]);

  const stateColors: Record<string, string> = {
    posted: "text-emerald-500",
    approved: "text-emerald-500",
    done: "text-emerald-500",
    draft: "text-muted-foreground",
    pending: "text-amber-500",
    rejected: "text-rose-500",
  };

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
      <div className="space-y-6">
        {/* Header Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Financial Summary
            </h1>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 border border-border/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground bg-white/[0.02]">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Last 30 Days</span>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        {/* Stats Row */}
        <div className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
                  <div className="p-8 space-y-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-12 w-36" />
                  </div>
                </Card>
              ))
            ) : (
              widgets.map((w, i) => {
                const variant = getMetricVariant(w.change, w.reverse);
                const rightContent = (
                  <div
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border border-border/20 rounded-none",
                      variant.bg,
                      variant.color
                    )}
                  >
                    <variant.icon className="h-3 w-3" />
                    {Math.abs(w.change).toFixed(1)}%
                  </div>
                );

                return (
                  <StatCard
                    key={i}
                    title={w.title}
                    value={formatCurrency(w.value)}
                    rightContent={rightContent}
                    visual={w.visual}
                    className="border border-border/40 shadow-none bg-background rounded-none"
                  />
                );
              })
            )}
          </div>

          {/* Recent Activity Grid */}
          {!isLoading && summary && summary.recentTransactions && (
            <div className="space-y-6 pt-6">
              

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Bills */}
                <Card className="overflow-hidden border border-border/40 bg-background rounded-none shadow-none">
                  <div className="p-6 border-b border-border/20 bg-rose-500/[0.02] flex items-center gap-3">
                   
                    <h3 className="text-[18px] font-medium tracking-tight text-foreground">
                      Recent Vendor Bills
                    </h3>
                  </div>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="border-border/40">
                        <TableRow>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Bill Ref</TableHead>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Vendor</TableHead>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Amount</TableHead>
                          <TableHead className="px-6 py-4 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border/30">
                        {summary.recentTransactions.bills.length > 0 ? (
                          summary.recentTransactions.bills.map((bill) => (
                            <TableRow
                              key={bill._id}
                              onClick={() => router.push("/finance/bills")}
                              className="group cursor-pointer hover:bg-white/[0.01] transition-colors"
                            >
                              <TableCell className="px-6 py-5 font-mono text-xs font-semibold text-foreground">
                                {bill.name}
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="text-sm font-medium text-foreground/80">{bill.partner}</div>
                                <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                                  {new Date(bill.date).toLocaleDateString("en-IN")}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5 font-sans tabular-nums text-sm font-semibold text-rose-500">
                                {formatCurrency(bill.amount)}
                              </TableCell>
                              <TableCell className="px-6 py-5 text-right">
                                <Badge
                                  className={cn(
                                    "rounded-none border-0 bg-transparent px-0 font-mono text-[11px] uppercase tracking-wider hover:bg-transparent shadow-none",
                                    stateColors[bill.state] || "text-muted-foreground"
                                  )}
                                >
                                  {bill.state}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="py-12 text-center text-muted-foreground/40 text-xs font-mono uppercase">
                              No recent bills
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Recent Invoices */}
                <Card className="overflow-hidden border border-border/40 bg-background rounded-none shadow-none">
                  <div className="p-6 border-b border-border/20 bg-blue-500/[0.02] flex items-center gap-3">
                    
                    <h3 className="text-[18px] font-medium tracking-tight text-foreground">
                      Recent Customer Invoices
                    </h3>
                  </div>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="border-border/40">
                        <TableRow>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Invoice Ref</TableHead>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Customer</TableHead>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Amount</TableHead>
                          <TableHead className="px-6 py-4 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border/30">
                        {summary.recentTransactions.invoices.length > 0 ? (
                          summary.recentTransactions.invoices.map((inv) => (
                            <TableRow
                              key={inv._id}
                              onClick={() => router.push("/finance/invoices")}
                              className="group cursor-pointer hover:bg-white/[0.01] transition-colors"
                            >
                              <TableCell className="px-6 py-5 font-mono text-xs font-semibold text-foreground">
                                {inv.name}
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="text-sm font-medium text-foreground/80">{inv.partner}</div>
                                <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                                  {new Date(inv.date).toLocaleDateString("en-IN")}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5 font-sans tabular-nums text-sm font-semibold text-blue-500">
                                {formatCurrency(inv.amount)}
                              </TableCell>
                              <TableCell className="px-6 py-5 text-right">
                                <Badge
                                  className={cn(
                                    "rounded-none border-0 bg-transparent px-0 font-mono text-[11px] uppercase tracking-wider hover:bg-transparent shadow-none",
                                    stateColors[inv.state] || "text-muted-foreground"
                                  )}
                                >
                                  {inv.state}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="py-12 text-center text-muted-foreground/40 text-xs font-mono uppercase">
                              No recent invoices
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Recent Expenses */}
                <Card className="overflow-hidden border border-border/40 bg-background rounded-none shadow-none">
                  <div className="p-6 border-b border-border/20 bg-purple-500/[0.02] flex items-center gap-3">
                    
                    <h3 className="text-[18px] font-medium tracking-tight text-foreground">
                      Recent Employee Expenses
                    </h3>
                  </div>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="border-border/40">
                        <TableRow>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Expense Ref</TableHead>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Employee</TableHead>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Amount</TableHead>
                          <TableHead className="px-6 py-4 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border/30">
                        {summary.recentTransactions.expenses.length > 0 ? (
                          summary.recentTransactions.expenses.map((exp) => (
                            <TableRow
                              key={exp._id}
                              onClick={() => router.push("/finance/expenses")}
                              className="group cursor-pointer hover:bg-white/[0.01] transition-colors"
                            >
                              <TableCell className="px-6 py-5 font-mono text-xs font-semibold text-foreground">
                                {exp.name}
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="text-sm font-medium text-foreground/80 flex items-center gap-1">
                                  <Users className="h-3 w-3 text-muted-foreground/60" />
                                  {exp.employee}
                                </div>
                                <div className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                                  {new Date(exp.date).toLocaleDateString("en-IN")}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-5 font-sans tabular-nums text-sm font-semibold text-purple-500">
                                {formatCurrency(exp.amount)}
                              </TableCell>
                              <TableCell className="px-6 py-5 text-right">
                                <Badge
                                  className={cn(
                                    "rounded-none border-0 bg-transparent px-0 font-mono text-[11px] uppercase tracking-wider hover:bg-transparent shadow-none",
                                    stateColors[exp.status] || "text-muted-foreground"
                                  )}
                                >
                                  {exp.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="py-12 text-center text-muted-foreground/40 text-xs font-mono uppercase">
                              No recent expenses
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Recent Returns */}
                <Card className="overflow-hidden border border-border/40 bg-background rounded-none shadow-none">
                  <div className="p-6 border-b border-border/20 bg-amber-500/[0.02] flex items-center gap-3">
                    
                    <h3 className="text-[18px] font-medium tracking-tight text-foreground">
                      Recent Returns
                    </h3>
                  </div>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="border-border/40">
                        <TableRow>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Return Ref</TableHead>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Partner</TableHead>
                          <TableHead className="px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Date</TableHead>
                          <TableHead className="px-6 py-4 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border/30">
                        {summary.recentTransactions.returns.length > 0 ? (
                          summary.recentTransactions.returns.map((ret) => (
                            <TableRow
                              key={ret._id}
                              onClick={() => router.push("/finance/returns")}
                              className="group cursor-pointer hover:bg-white/[0.01] transition-colors"
                            >
                              <TableCell className="px-6 py-5 font-mono text-xs font-semibold text-foreground">
                                {ret.name}
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <div className="text-sm font-medium text-foreground/80">{ret.partner}</div>
                              </TableCell>
                              <TableCell className="px-6 py-5 font-mono text-xs text-foreground/75">
                                {new Date(ret.date).toLocaleDateString("en-IN")}
                              </TableCell>
                              <TableCell className="px-6 py-5 text-right">
                                <Badge
                                  className={cn(
                                    "rounded-none border-0 bg-transparent px-0 font-mono text-[11px] uppercase tracking-wider hover:bg-transparent shadow-none",
                                    stateColors[ret.status] || "text-muted-foreground"
                                  )}
                                >
                                  {ret.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="py-12 text-center text-muted-foreground/40 text-xs font-mono uppercase">
                              No recent returns
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
