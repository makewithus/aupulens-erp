"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  ShieldCheck,
  Scale,
  RefreshCw,
  Plus,
  Landmark,
  ArrowRight,
  ExternalLink,
  PieChart as PieChartIcon,
  BarChart3,
  Layers,
} from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { useThemeStore } from "@/store/themeStore";
import { BRAND_COLORS, BRAND_ACCENT_PALETTE } from "@/lib/constants/brandColors";

interface AgingBucket {
  label: string;
  amount: number;
  risk: string;
}

interface FinanceSummary {
  revenue: { current: number; previous: number; monthToDate?: number; change: number };
  expenses: { current: number; previous: number; monthToDate?: number; change: number };
  netIncome: { current: number; previous: number; monthToDate?: number; change: number };
  cashFlow: { current: number; previous: number; change: number };
  accountsReceivable: {
    total: number;
    overdue: number;
    buckets?: AgingBucket[];
  };
  accountsPayable: {
    total: number;
    overdue: number;
    buckets?: AgingBucket[];
  };
  matrices?: {
    workingCapital: number;
    currentRatio: number;
    quickRatio: number;
    profitMargin: number | null;
    operatingMargin: number | null;
    profitStatus?: string;
    profitUnavailableReason?: string;
    cashRunway: number | null;
    cashRunwayStatus?: string;
    cashRunwayReason?: string;
    ebitda: number | null;
    avgCollectionPeriod: number;
    payablesTurnover: number;
    effectiveCash: number;
  };
  expenseBreakdown?: Array<{ name: string; value: number }>;
  monthlyPerformance?: Array<{
    date: string;
    revenue: number;
    expenses: number;
    value: number;
    net: number;
  }>;
  revenueTimeline?: Array<{
    date: string;
    value: number;
    inflow?: number;
    outflow?: number;
    net?: number;
  }>;
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
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [summary, setSummary] = useState<FinanceSummary | null>(() => {
    if (typeof window !== "undefined") {
      const cached = getInstantCachedData<{ summary: FinanceSummary }>("/api/finance/summary", { allowPreHydration: true });
      return cached?.summary || null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const cached = getInstantCachedData<{ summary: FinanceSummary }>("/api/finance/summary", { allowPreHydration: true });
      return !cached?.summary;
    }
    return true;
  });
  const [error, setError] = useState("");

  const fetchSummary = useCallback(async (force = false) => {
    try {
      const res = await cachedFetch("/api/finance/summary", undefined, { force });
      if (!res.ok) throw new Error("Failed to fetch summary");
      const data = await res.json();
      if (data?.summary) {
        setSummary(data.summary);
      }
      setError("");
    } catch (err) {
      console.error("Error fetching summary:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const cachedData = getInstantCachedData<{ summary: FinanceSummary }>("/api/finance/summary", { allowPreHydration: true });
    if (cachedData?.summary) {
      setSummary(cachedData.summary);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSummary();
    }
  }, [status, router, fetchSummary]);

  useEffect(() => {
    const handleRevalidate = (e: any) => {
      if (e?.detail?.url?.includes("/api/finance")) {
        fetchSummary();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("aup:revalidated", handleRevalidate);
      return () => window.removeEventListener("aup:revalidated", handleRevalidate);
    }
  }, [fetchSummary]);

  const formatCurrency = (amount?: number) => {
    const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompactCurrency = (amount?: number) => {
    const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
    if (Math.abs(value) >= 10000000) {
      return `₹${(value / 10000000).toFixed(2)} Cr`;
    }
    if (Math.abs(value) >= 100000) {
      return `₹${(value / 100000).toFixed(2)} L`;
    }
    return formatCurrency(value);
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
        title: "Total Posted Revenue",
        value: summary.revenue?.current ?? 0,
        previous: summary.revenue?.previous ?? 0,
        change: summary.revenue?.change ?? 0,
        subtitle: summary.revenue?.monthToDate !== undefined ? `MTD: ${formatCurrency(summary.revenue.monthToDate)} · 100% Posted` : undefined,
        icon: DollarSign,
        visual: <UsersGraph />,
        reverse: false,
        badgeLabel: "Ledger Verified",
      },
      {
        title: "Total Operating Expenses",
        value: summary.expenses?.current ?? 0,
        previous: summary.expenses?.previous ?? 0,
        change: summary.expenses?.change ?? 0,
        subtitle: "COGS · Balanced Ledger",
        icon: CreditCard,
        visual: <ActivePulse />,
        reverse: true,
        badgeLabel: "OpEx Costs",
      },
      {
        title: "Net Operating Income",
        value: summary.netIncome?.current ?? 0,
        previous: summary.netIncome?.previous ?? 0,
        change: summary.netIncome?.change ?? 0,
        subtitle: summary.matrices?.profitMargin != null
          ? `${summary.matrices.profitMargin}% Net Margin`
          : (summary.matrices?.profitUnavailableReason ? "Costs unposted" : "0% Net Margin"),
        icon: Wallet,
        visual: <UsersGraph />,
        reverse: false,
        badgeLabel: summary.matrices?.profitMargin != null
          ? `${summary.matrices.profitMargin}% Margin`
          : (summary.matrices?.profitUnavailableReason ? "Incomplete" : "0% Margin"),
      },
      {
        title: "Liquid Cash & Reserves",
        value: summary.matrices?.effectiveCash ?? summary.cashFlow?.current ?? 0,
        previous: summary.cashFlow?.previous ?? 0,
        change: summary.cashFlow?.change ?? 0,
        subtitle: "Verified Bank & Cash Accounts",
        icon: Landmark,
        visual: <ActivePulse />,
        reverse: false,
        badgeLabel: "Audited Reserves",
      },
    ];
  }, [summary]);

  const stateColors: Record<string, string> = {
    posted: "text-emerald-500",
    approved: "text-emerald-500",
    done: "text-emerald-500",
    paid: "text-emerald-500",
    draft: "text-muted-foreground",
    pending: "text-amber-500",
    rejected: "text-rose-500",
    cancelled: "text-rose-500",
  };

  const riskBadgeStyles: Record<string, string> = {
    low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    critical: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };

  const riskBarColors: Record<string, string> = {
    low: "bg-emerald-500",
    medium: "bg-amber-500",
    high: "bg-orange-500",
    critical: "bg-rose-500",
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      dashboardTitle="Finance"
      pageName="Dashboard"
      breadcrumbs={[{ label: "Finance" }, { label: "Executive Dashboard" }]}
      userName={session?.user?.name || "Finance Admin"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={fetchSummary}
      profilePath="/finance/profile"
    >
      <div className="space-y-8 font-mono min-w-0 max-w-full">
        {/* ── 1. HEADER & QUICK ACTION TOOLBAR ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/40 pb-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Ledger Telemetry
              </span>
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                IFRS / Ind-AS Compliant
              </span>
              <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Audit Grade Ledger
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-foreground">
              Financial Intelligence Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">
              Consolidated financial run-rate, cash flow dynamics, liquidity ratios, and real-time ledger intelligence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              size="sm"
              className="text-xs font-mono h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Link href="/finance/accounting/journal-entries">
                <Plus className="w-3.5 h-3.5" />
                New Journal Voucher
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(
                "text-xs font-mono h-9 gap-1.5 border shadow-sm",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white border-slate-300 text-slate-800"
              )}
            >
              <Link href="/finance/accounting/bank-reconciliation">
                <Landmark className="w-3.5 h-3.5 text-blue-400" />
                Bank Reconciliation
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(
                "text-xs font-mono h-9 gap-1.5 border shadow-sm",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white border-slate-300 text-slate-800"
              )}
            >
              <Link href="/finance/accounting/profit-loss">
                <Scale className="w-3.5 h-3.5 text-purple-400" />
                Profit & Loss
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(
                "text-xs font-mono h-9 gap-1.5 border shadow-sm",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white border-slate-300 text-slate-800"
              )}
            >
              <Link href="/finance/analytics">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                Financial Analytics
              </Link>
            </Button>
            <Button
              onClick={() => fetchSummary(true)}
              variant="outline"
              size="sm"
              className={cn(
                "text-xs font-mono h-9 gap-1.5 border shadow-sm px-3",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white border-slate-300 text-slate-800"
              )}
              title="Refresh ledger data"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        {/* ── 2. TOP 4 CORE KPI STAT CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
                <div className="p-6 space-y-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-40" />
                </div>
              </Card>
            ))
          ) : (
            widgets.map((w, i) => {
              const variant = getMetricVariant(w.change, w.reverse);
              const rightContent = (
                <div className="flex flex-col items-end gap-1">
                  <span className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border rounded-none",
                    variant.bg,
                    variant.color,
                    "border-border/20"
                  )}>
                    <variant.icon className="h-3 w-3" />
                    {Math.abs(w.change).toFixed(1)}%
                  </span>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-widest">
                    {w.badgeLabel}
                  </span>
                </div>
              );

              return (
                <StatCard
                  key={i}
                  title={w.title}
                  value={formatCurrency(w.value)}
                  rightContent={rightContent}
                  visual={w.visual}
                  subtitle={
                    (w as any).subtitle ||
                    (w.previous !== undefined
                      ? `Prior: ${formatCurrency(w.previous)}`
                      : undefined)
                  }
                  className={cn(
                    "rounded-none border shadow-none transition-colors",
                    isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
                  )}
                />
              );
            })
          )}
        </div>

        {/* ── 3. VISUAL TELEMETRY & ANALYTICS BANNER ── */}
        <div className="p-4 border border-border/40 bg-muted/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">
                Consolidated Financial Velocity & Timeline Analytics
              </div>
              <div className="text-xs text-muted-foreground">
                Interactive 2-year run-rate, monthly brick throughput, and OpEx allocation charts.
              </div>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            className="text-xs font-mono h-9 gap-1.5 shrink-0"
          >
            <Link href="/finance/analytics">
              View Analytics & Charts
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>

        {/* ── 5. SOLVENCY, LIQUIDITY & CAPITAL HEALTH MATRIX ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-foreground">
                Solvency & Capital Health Matrix
              </h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Dynamic Balance Sheet & Cash Flow Ratios
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading && !summary ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-5 space-y-3 rounded-none border border-border/40 shadow-none bg-background">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-3 w-20" />
                </Card>
              ))
            ) : (
              <>
            {/* Working Capital */}
            <Card
              className={cn(
                "rounded-none border shadow-xs transition-colors p-5 relative overflow-hidden",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Net Working Capital
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: BRAND_COLORS.accent.green }}
                />
              </div>
              <div className="text-2xl font-extrabold tracking-tight mt-2 text-emerald-400">
                {formatCompactCurrency(summary?.matrices?.workingCapital)}
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-[11px] text-muted-foreground">
                  Receivables less Payables
                </span>
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Solvent
                </span>
              </div>
            </Card>

            {/* Current Ratio */}
            <Card
              className={cn(
                "rounded-none border shadow-xs transition-colors p-5 relative overflow-hidden",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Current Liquidity Ratio
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: BRAND_COLORS.accent.blue }}
                />
              </div>
              <div className="text-2xl font-extrabold tracking-tight mt-2 text-blue-400">
                {(summary?.matrices?.currentRatio || 0).toFixed(2)}x
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-[11px] text-muted-foreground">
                  Benchmark: &gt; 1.50x
                </span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 border font-semibold",
                  (summary?.matrices?.currentRatio || 0) >= 1.5
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                )}>
                  {(summary?.matrices?.currentRatio || 0) >= 1.5 ? "Healthy" : "Watch"}
                </span>
              </div>
            </Card>

            {/* Cash Runway */}
            <Card
              className={cn(
                "rounded-none border shadow-xs transition-colors p-5 relative overflow-hidden",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Effective Cash Runway
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: BRAND_COLORS.accent.purple }}
                />
              </div>
              <div className="text-2xl font-extrabold tracking-tight mt-2 text-purple-400">
                {summary?.matrices?.cashRunway != null
                  ? `${summary.matrices.cashRunway.toFixed(1)} Months`
                  : (summary?.matrices?.cashRunwayReason || "Not available")}
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-[11px] text-muted-foreground">
                  Liquid: {formatCompactCurrency(summary?.matrices?.effectiveCash)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
                  Run-Rate
                </span>
              </div>
            </Card>

            {/* Operating Margin / EBITDA */}
            <Card
              className={cn(
                "rounded-none border shadow-xs transition-colors p-5 relative overflow-hidden",
                isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Operating Profit Margin
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: BRAND_COLORS.accent.yellow }}
                />
              </div>
              <div className="text-2xl font-extrabold tracking-tight mt-2 text-amber-400">
                {(summary?.matrices?.operatingMargin || 0).toFixed(1)}%
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-[11px] text-muted-foreground">
                  EBITDA: {formatCompactCurrency(summary?.matrices?.ebitda)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                  Profitable
                </span>
              </div>
            </Card>
            </>
            )}
          </div>
        </div>

        {/* ── 6. AGED RECEIVABLES VS AGED PAYABLES RISK BARS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Accounts Receivable Aging */}
          <Card
            className={cn(
              "rounded-none border shadow-sm transition-colors",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Accounts Receivable Aging Risk
                  </CardTitle>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Total Outstanding: {formatCurrency(summary?.accountsReceivable?.total)} · Overdue: {formatCurrency(summary?.accountsReceivable?.overdue)}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 text-[10px] font-mono gap-1 text-muted-foreground hover:text-foreground">
                <Link href="/finance/accounting/aged-partner">
                  Details <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {isLoading && !summary ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </div>
              ) : summary?.accountsReceivable?.buckets && summary.accountsReceivable.buckets.length > 0 ? (
                summary.accountsReceivable.buckets.map((b, idx) => {
                  const total = summary?.accountsReceivable?.total || 1;
                  const pct = total > 0 ? Math.min(100, Math.round((b.amount / total) * 100)) : 0;
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground/90">{b.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{formatCurrency(b.amount)}</span>
                          <span className={cn("text-[9px] px-1.5 py-0.2 border uppercase font-mono", riskBadgeStyles[b.risk] || riskBadgeStyles.low)}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-muted/20 overflow-hidden">
                        <div
                          className={cn("h-full transition-all duration-500", riskBarColors[b.risk] || "bg-emerald-500")}
                          style={{ width: `${Math.max(pct, b.amount > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No receivable aging records available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Accounts Payable Aging */}
          <Card
            className={cn(
              "rounded-none border shadow-sm transition-colors",
              isDark ? "bg-[#161616] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Accounts Payable Maturity Schedule
                  </CardTitle>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Total Obligations: {formatCurrency(summary?.accountsPayable?.total)} · Overdue: {formatCurrency(summary?.accountsPayable?.overdue)}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 text-[10px] font-mono gap-1 text-muted-foreground hover:text-foreground">
                <Link href="/finance/payables">
                  Details <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {isLoading && !summary ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </div>
              ) : summary?.accountsPayable?.buckets && summary.accountsPayable.buckets.length > 0 ? (
                summary.accountsPayable.buckets.map((b, idx) => {
                  const total = summary?.accountsPayable?.total || 1;
                  const pct = total > 0 ? Math.min(100, Math.round((b.amount / total) * 100)) : 0;
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground/90">{b.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{formatCurrency(b.amount)}</span>
                          <span className={cn("text-[9px] px-1.5 py-0.2 border uppercase font-mono", riskBadgeStyles[b.risk] || riskBadgeStyles.low)}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-muted/20 overflow-hidden">
                        <div
                          className={cn("h-full transition-all duration-500", riskBarColors[b.risk] || "bg-rose-500")}
                          style={{ width: `${Math.max(pct, b.amount > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No payable aging records available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── 7. RECENT OPERATIONAL DOCUMENTS & TRANSACTIONS ── */}
        {!isLoading && summary && summary.recentTransactions && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-foreground">
                  Recent Financial Documents & Vouchers
                </h3>
                <p className="text-xs text-muted-foreground">
                  Operational activity streams across vendor billing, client invoicing, employee expenses, and return adjustments.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Bills */}
              <Card className="overflow-hidden border border-border/40 bg-background rounded-none shadow-none">
                <div className="p-4 border-b border-border/20 bg-rose-500/[0.03] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-rose-500" />
                    <h4 className="text-sm font-semibold tracking-tight text-foreground">
                      Recent Vendor Bills
                    </h4>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] font-mono px-2 text-muted-foreground hover:text-foreground">
                    <Link href="/finance/bills">View All &rarr;</Link>
                  </Button>
                </div>
                <CardContent className="p-0 overflow-x-auto">
                  <Table className="min-w-[500px] whitespace-nowrap">
                    <TableHeader className="border-border/40">
                      <TableRow>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Bill Ref</TableHead>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Vendor</TableHead>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                        <TableHead className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {summary.recentTransactions.bills.length > 0 ? (
                        summary.recentTransactions.bills.map((bill) => (
                          <TableRow
                            key={bill._id}
                            onClick={() => router.push("/finance/bills")}
                            className="group cursor-pointer hover:bg-muted/10 transition-colors"
                          >
                            <TableCell className="px-5 py-4 font-mono text-xs font-semibold text-foreground">
                              {bill.name}
                            </TableCell>
                            <TableCell className="px-5 py-4">
                              <div className="text-xs font-medium text-foreground/90">{bill.partner}</div>
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {new Date(bill.date).toLocaleDateString("en-IN")}
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-4 font-sans tabular-nums text-xs font-semibold text-rose-500">
                              {formatCurrency(bill.amount)}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-right">
                              <Badge
                                className={cn(
                                  "rounded-none border-0 bg-transparent px-0 font-mono text-[10px] uppercase tracking-wider hover:bg-transparent shadow-none",
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
                          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground/40 text-xs font-mono uppercase">
                            No recent vendor bills
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Recent Invoices */}
              <Card className="overflow-hidden border border-border/40 bg-background rounded-none shadow-none">
                <div className="p-4 border-b border-border/20 bg-blue-500/[0.03] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <h4 className="text-sm font-semibold tracking-tight text-foreground">
                      Recent Customer Invoices
                    </h4>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] font-mono px-2 text-muted-foreground hover:text-foreground">
                    <Link href="/finance/invoices">View All &rarr;</Link>
                  </Button>
                </div>
                <CardContent className="p-0 overflow-x-auto">
                  <Table className="min-w-[500px] whitespace-nowrap">
                    <TableHeader className="border-border/40">
                      <TableRow>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Invoice Ref</TableHead>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                        <TableHead className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {summary.recentTransactions.invoices.length > 0 ? (
                        summary.recentTransactions.invoices.map((inv) => (
                          <TableRow
                            key={inv._id}
                            onClick={() => router.push("/finance/invoices")}
                            className="group cursor-pointer hover:bg-muted/10 transition-colors"
                          >
                            <TableCell className="px-5 py-4 font-mono text-xs font-semibold text-foreground">
                              {inv.name}
                            </TableCell>
                            <TableCell className="px-5 py-4">
                              <div className="text-xs font-medium text-foreground/90">{inv.partner}</div>
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {new Date(inv.date).toLocaleDateString("en-IN")}
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-4 font-sans tabular-nums text-xs font-semibold text-blue-500">
                              {formatCurrency(inv.amount)}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-right">
                              <Badge
                                className={cn(
                                  "rounded-none border-0 bg-transparent px-0 font-mono text-[10px] uppercase tracking-wider hover:bg-transparent shadow-none",
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
                          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground/40 text-xs font-mono uppercase">
                            No recent customer invoices
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Recent Expenses */}
              <Card className="overflow-hidden border border-border/40 bg-background rounded-none shadow-none">
                <div className="p-4 border-b border-border/20 bg-purple-500/[0.03] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-purple-500" />
                    <h4 className="text-sm font-semibold tracking-tight text-foreground">
                      Recent Employee Expenses
                    </h4>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] font-mono px-2 text-muted-foreground hover:text-foreground">
                    <Link href="/finance/expenses">View All &rarr;</Link>
                  </Button>
                </div>
                <CardContent className="p-0 overflow-x-auto">
                  <Table className="min-w-[500px] whitespace-nowrap">
                    <TableHeader className="border-border/40">
                      <TableRow>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Expense Ref</TableHead>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Employee</TableHead>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                        <TableHead className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {summary.recentTransactions.expenses.length > 0 ? (
                        summary.recentTransactions.expenses.map((exp) => (
                          <TableRow
                            key={exp._id}
                            onClick={() => router.push("/finance/expenses")}
                            className="group cursor-pointer hover:bg-muted/10 transition-colors"
                          >
                            <TableCell className="px-5 py-4 font-mono text-xs font-semibold text-foreground">
                              {exp.name}
                            </TableCell>
                            <TableCell className="px-5 py-4">
                              <div className="text-xs font-medium text-foreground/90 flex items-center gap-1">
                                <Users className="h-3 w-3 text-muted-foreground/60" />
                                {exp.employee}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {new Date(exp.date).toLocaleDateString("en-IN")}
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-4 font-sans tabular-nums text-xs font-semibold text-purple-500">
                              {formatCurrency(exp.amount)}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-right">
                              <Badge
                                className={cn(
                                  "rounded-none border-0 bg-transparent px-0 font-mono text-[10px] uppercase tracking-wider hover:bg-transparent shadow-none",
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
                          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground/40 text-xs font-mono uppercase">
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
                <div className="p-4 border-b border-border/20 bg-amber-500/[0.03] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Undo2 className="h-4 w-4 text-amber-500" />
                    <h4 className="text-sm font-semibold tracking-tight text-foreground">
                      Recent Return Adjustments
                    </h4>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] font-mono px-2 text-muted-foreground hover:text-foreground">
                    <Link href="/finance/returns">View All &rarr;</Link>
                  </Button>
                </div>
                <CardContent className="p-0 overflow-x-auto">
                  <Table className="min-w-[500px] whitespace-nowrap">
                    <TableHeader className="border-border/40">
                      <TableRow>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Return Ref</TableHead>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Partner</TableHead>
                        <TableHead className="px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                        <TableHead className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {summary.recentTransactions.returns.length > 0 ? (
                        summary.recentTransactions.returns.map((ret) => (
                          <TableRow
                            key={ret._id}
                            onClick={() => router.push("/finance/returns")}
                            className="group cursor-pointer hover:bg-muted/10 transition-colors"
                          >
                            <TableCell className="px-5 py-4 font-mono text-xs font-semibold text-foreground">
                              {ret.name}
                            </TableCell>
                            <TableCell className="px-5 py-4">
                              <div className="text-xs font-medium text-foreground/90">{ret.partner}</div>
                            </TableCell>
                            <TableCell className="px-5 py-4 font-mono text-xs text-foreground/75">
                              {new Date(ret.date).toLocaleDateString("en-IN")}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-right">
                              <Badge
                                className={cn(
                                  "rounded-none border-0 bg-transparent px-0 font-mono text-[10px] uppercase tracking-wider hover:bg-transparent shadow-none",
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
                          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground/40 text-xs font-mono uppercase">
                            No recent return adjustments
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
    </DashboardLayout>
  );
}
