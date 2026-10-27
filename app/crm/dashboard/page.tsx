"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/StatCard";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { InactiveOrbit } from "@/components/admin/graphics/InactiveOrbit";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import {
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/shared/Table";
import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";
import {
  Plus,
  Users,
  Calendar,
  BarChart3,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Briefcase,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function CrmDashboardSkeleton() {
  return (
    <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8 py-6 max-w-full animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
        <div className="space-y-2">
          <div className="h-5 w-48 bg-muted/40 rounded-md" />
          <div className="h-10 w-80 bg-muted/60 rounded-lg" />
          <div className="h-4 w-60 bg-muted/30 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-muted/40 rounded-lg" />
          <div className="h-9 w-28 bg-muted/40 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-border/60 bg-muted/20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 h-96 rounded-xl border border-border/60 bg-muted/20" />
        <div className="lg:col-span-7 h-96 rounded-xl border border-border/60 bg-muted/20" />
      </div>
    </div>
  );
}

export default function CRMDashboardPage() {
  const [pipelineData, setPipelineData] = useState<any>(() => {
    if (typeof window !== "undefined") {
      const cached = getInstantCachedData<any>("/api/crm/pipeline/analytics", { allowPreHydration: true });
      return cached?.data || null;
    }
    return null;
  });
  const [healthData, setHealthData] = useState<any>(() => {
    if (typeof window !== "undefined") {
      const cached = getInstantCachedData<any>("/api/crm/health", { allowPreHydration: true });
      return cached?.data || null;
    }
    return null;
  });
  const [churnData, setChurnData] = useState<any>(null);
  const [renewalData, setRenewalData] = useState<any>(null);
  const [expansionData, setExpansionData] = useState<any>(null);
  const [highValueDeals, setHighValueDeals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const cached = getInstantCachedData<any>("/api/crm/pipeline/analytics", { allowPreHydration: true });
      return !cached?.data;
    }
    return true;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchJson = async (url: string, fresh: boolean = false) => {
    try {
      const finalUrl = fresh ? `${url}${url.includes("?") ? "&" : "?"}fresh=true` : url;
      const res = await cachedFetch(finalUrl, { cache: fresh ? "no-store" : "default" });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  const loadData = useCallback(async (fresh: boolean = false) => {
    try {
      if (fresh) setIsRefreshing(true);
      const [pipe, health, churn, renewal, exp, opps] = await Promise.all([
        fetchJson("/api/crm/pipeline/analytics", fresh),
        fetchJson("/api/crm/health", fresh),
        fetchJson("/api/crm/churn", fresh),
        fetchJson("/api/crm/renewals", fresh),
        fetchJson("/api/crm/expansion", fresh),
        fetchJson("/api/crm/opportunities?limit=5", fresh),
      ]);

      if (pipe?.success && pipe.data) setPipelineData(pipe.data);
      if (health?.success && health.data) setHealthData(health.data);
      if (churn?.success && churn.data) setChurnData(churn.data);
      if (renewal?.success && renewal.data) setRenewalData(renewal.data);
      if (exp?.success && exp.data) setExpansionData(exp.data);
      if (opps?.data) setHighValueDeals(opps.data.slice(0, 5));
      if (fresh) toast.success("Live CRM dashboard synchronized");
    } catch (err) {
      console.error("Error loading CRM dashboard:", err);
      if (fresh) toast.error("Failed to sync live CRM data");
    } finally {
      setIsLoading(false);
      if (fresh) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // 1. Immediately hydrate from client cache if present (safe post-hydration)
    const cachedPipe = getInstantCachedData<any>("/api/crm/pipeline/analytics", { allowPreHydration: true });
    if (cachedPipe?.data) {
      setPipelineData(cachedPipe.data);
      setIsLoading(false);
    }
    const cachedHealth = getInstantCachedData<any>("/api/crm/health", { allowPreHydration: true });
    if (cachedHealth?.data) setHealthData(cachedHealth.data);
    const cachedChurn = getInstantCachedData<any>("/api/crm/churn", { allowPreHydration: true });
    if (cachedChurn?.data) setChurnData(cachedChurn.data);
    const cachedRenewal = getInstantCachedData<any>("/api/crm/renewals", { allowPreHydration: true });
    if (cachedRenewal?.data) setRenewalData(cachedRenewal.data);
    const cachedExp = getInstantCachedData<any>("/api/crm/expansion", { allowPreHydration: true });
    if (cachedExp?.data) setExpansionData(cachedExp.data);
    const cachedOpps = getInstantCachedData<any>("/api/crm/opportunities?limit=5", { allowPreHydration: true });
    if (cachedOpps?.data) setHighValueDeals(cachedOpps.data.slice(0, 5));

    // 2. Revalidate live data via SWR
    loadData(false);

    const handleRevalidated = (e: any) => {
      if (e?.detail?.url?.includes("/api/crm")) {
        loadData(false);
      }
    };
    window.addEventListener("aup:revalidated", handleRevalidated);
    return () => window.removeEventListener("aup:revalidated", handleRevalidated);
  }, [loadData]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val || 0);

  if (isLoading && !pipelineData) {
    return <CrmDashboardSkeleton />;
  }

  const totalPipelineValue = pipelineData?.totalPipelineValue || 0;
  const activeDeals = pipelineData?.activeDeals || pipelineData?.totalOpportunities || 0;
  const wonDeals = pipelineData?.wonDeals || 0;
  const lostDeals = pipelineData?.lostDeals || 0;

  const totalRenewalValue = renewalData?.renewalPipelineValue90Days || 0;
  const totalExpansionValue = expansionData?.summary?.totalExpansionPipeline || 0;
  const retentionRate = expansionData?.summary?.renewalSuccessRate || 0;
  const totalChurnRisk = (churnData?.high || 0) + (churnData?.critical || 0);

  return (
    <div className="w-full space-y-6 px-4 sm:px-6 lg:px-8 py-6 max-w-full">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/25 rounded-md">
              Customer Intelligence
            </span>
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-md">
              Retention {retentionRate > 0 ? `${retentionRate}%` : "100%"}
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground break-words leading-none">
            CRM Executive Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Enterprise customer telemetry tracking relationship pipeline velocity, win ratios, account health, and renewal security.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-mono text-xs shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Syncing..." : "Live Sync"}
          </Button>

          <Button asChild size="sm" className="h-9 gap-1.5 font-bold shadow-sm">
            <Link href="/crm/opportunities">
              <Plus className="w-3.5 h-3.5" />
              New Opportunity
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 shadow-xs font-semibold">
            <Link href="/crm/analytics">
              <BarChart3 className="w-3.5 h-3.5" />
              CRM Analytics
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 border-border/60">
            <Link href="/crm/leads">
              <Users className="w-3.5 h-3.5" />
              Lead Pipeline
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 border-border/60">
            <Link href="/crm/contracts">
              <Calendar className="w-3.5 h-3.5" />
              Manage Renewals
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 border-border/60">
            <Link href="/crm/reports">
              <BarChart3 className="w-3.5 h-3.5" />
              CRM Reports
            </Link>
          </Button>
        </div>
      </div>

      {/* Top 4 StatCards - Wide responsive grid with generous breathing room */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Pipeline Value"
            value={formatCurrency(totalPipelineValue)}
            visual={<UsersGraph />}
            subtitle="Total open pipeline"
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Active Deals"
            value={activeDeals}
            visual={<ActivePulse />}
            subtitle="Currently in progress"
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Won"
            value={wonDeals}
            visual={<UsersGraph />}
            subtitle="Closed successfully"
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-1 shadow-xs hover:border-primary/40 transition-all">
          <StatCard
            title="Lost"
            value={lostDeals}
            visual={<InactiveOrbit />}
            subtitle="Closed lost"
          />
        </div>
      </div>

      {/* Main CRM Intelligence Grid - Balanced wide columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        {/* Left Column (lg:col-span-5) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Account Health Distribution */}
          <Card className="bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-bold">
                Account Health Distribution
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Segmented client relationship resilience scores.
              </p>
            </CardHeader>
            <CardContent className="p-6 pt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </div>
              ) : healthData?.distribution?.length > 0 ? (
                <div className="space-y-4 font-mono text-xs">
                  {healthData.distribution.map((bucket: any) => {
                    const label =
                      bucket._id === 0
                        ? "Critical Risk"
                        : bucket._id === 25
                        ? "High Risk"
                        : bucket._id === 50
                        ? "Warning"
                        : "Healthy";
                    const color =
                      bucket._id === 0
                        ? "bg-red-500"
                        : bucket._id === 25
                        ? "bg-amber-500"
                        : bucket._id === 50
                        ? "bg-blue-500"
                        : "bg-emerald-500";
                    return (
                      <div key={bucket._id} className="space-y-1.5">
                        <div className="flex justify-between text-muted-foreground">
                          <span className="font-semibold text-foreground">{label}</span>
                          <span>{bucket.count} accounts</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted/40 overflow-hidden rounded-none">
                          <div
                            className={`h-full ${color}`}
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(10, (bucket.count / (healthData.totalAccounts || 1)) * 100)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs font-mono">
                  No account health records yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Critical Churn Risks */}
          <Card className="bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-bold text-red-500 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Critical Churn Risks ({churnData?.critical || 0})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accounts requiring immediate CS intervention.
              </p>
            </CardHeader>
            <CardContent className="p-6 pt-3">
              {churnData?.criticalAccounts?.length > 0 ? (
                <div className="space-y-2">
                  {churnData.criticalAccounts.slice(0, 5).map((acct: any) => (
                    <Link
                      key={acct._id}
                      href={`/crm/accounts/${acct._id}`}
                      className="group block p-3 border border-border/40 hover:bg-muted/30 transition-colors rounded-lg bg-background/50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {acct.company_name}
                        </span>
                        <span className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                          risk
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {acct.reasons?.[0] || "Declining usage or contract lapse"}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs font-mono">
                  No critical account risks detected
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (lg:col-span-7) */}
        <div className="space-y-6 lg:col-span-7">
          {/* 12-Month Revenue Forecast Table */}
          <Card className="bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-bold">
                12-Month Revenue & Expansion Forecast
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Projected contract renewals and customer lifetime expansion targets.
              </p>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 border border-border/40 bg-muted/20 rounded-lg font-mono text-xs">
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-semibold">Total Forecast</span>
                    <div className="text-lg font-bold text-foreground mt-0.5">
                      {formatCurrency(totalRenewalValue + totalExpansionValue)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-semibold">Renewal Rate</span>
                    <div className="text-lg font-bold text-emerald-400 mt-0.5">
                      {retentionRate}%
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-semibold">At-Risk Value</span>
                    <div className="text-lg font-bold text-red-400 mt-0.5">
                      {formatCurrency(expansionData?.summary?.atRiskRenewalValue || 0)}
                    </div>
                  </div>
                </div>

                <TableContainer className="border border-border/40 rounded-lg overflow-hidden">
                  <TableHead>
                    <TableRow className="border-b border-border/40 bg-muted/20">
                      <TableHeaderCell className="py-3 text-xs font-bold tracking-normal">Quarter</TableHeaderCell>
                      <TableHeaderCell className="py-3 text-xs font-bold tracking-normal text-right">Renewal Target</TableHeaderCell>
                      <TableHeaderCell className="py-3 text-xs font-bold tracking-normal text-right">Expansion Pipeline</TableHeaderCell>
                      <TableHeaderCell className="py-3 text-xs font-bold tracking-normal text-right">Total Forecast</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expansionData?.quarterly?.length > 0 ? (
                      expansionData.quarterly.map((q: any) => (
                        <TableRow key={q.quarter} className="border-b border-border/20 hover:bg-muted/30">
                          <TableCell className="py-3 text-sm font-semibold text-foreground">{q.quarter}</TableCell>
                          <TableCell className="py-3 text-right font-mono text-xs text-blue-400 font-medium">
                            {formatCurrency(q.renewalRevenue)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono text-xs text-emerald-400 font-medium">
                            {formatCurrency(q.expansionRevenue)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono text-sm font-bold text-foreground">
                            {formatCurrency(q.totalRevenue)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-muted-foreground text-xs font-mono">
                          No quarterly forecast projections recorded yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </TableContainer>
              </div>
            </CardContent>
          </Card>

          {/* Sub Grid for Upcoming Renewals & High-Value Opportunities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upcoming Renewals */}
            <Card className="bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-base font-bold">Upcoming Renewals</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contracts approaching renewal milestone.
                </p>
              </CardHeader>
              <CardContent className="p-6 pt-3 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-3 border border-red-500/20 bg-red-500/10 rounded-lg">
                  <span className="text-red-400 font-semibold">Expiring in 7 days</span>
                  <span className="font-bold text-foreground">{renewalData?.expiring7 || 0} contracts</span>
                </div>
                <div className="flex items-center justify-between p-3 border border-amber-500/20 bg-amber-500/10 rounded-lg">
                  <span className="text-amber-400 font-semibold">Expiring in 30 days</span>
                  <span className="font-bold text-foreground">{renewalData?.expiring30 || 0} contracts</span>
                </div>
                <div className="flex items-center justify-between p-3 border border-blue-500/20 bg-blue-500/10 rounded-lg">
                  <span className="text-blue-400 font-semibold">Expiring in 90 days</span>
                  <span className="font-bold text-foreground">{renewalData?.expiring90 || 0} contracts</span>
                </div>
              </CardContent>
            </Card>

            {/* High-Value Opportunities */}
            <Card className="bg-card/60 backdrop-blur-md border border-border/60 shadow-xs rounded-xl hover:border-border/90 transition-all">
              <CardHeader className="flex flex-row items-center justify-between p-6 pb-2">
                <div>
                  <CardTitle className="text-base font-bold">High-Value Deals</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Largest active opportunities in pipe.
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild className="text-xs font-mono">
                  <Link href="/crm/opportunities">View Pipe</Link>
                </Button>
              </CardHeader>
              <CardContent className="p-6 pt-3">
                {highValueDeals.length > 0 ? (
                  <div className="space-y-2">
                    {highValueDeals.map((deal: any, i: number) => (
                      <div
                        key={deal._id || i}
                        className="flex items-center justify-between p-2 border border-border/30 hover:bg-muted/20 transition-colors"
                      >
                        <div className="truncate pr-2">
                          <div className="font-semibold text-xs text-foreground truncate">
                            {deal.deal_name || deal.account_name || "Enterprise Deal"}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {deal.stage || "Prospecting"}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-xs text-foreground whitespace-nowrap">
                          {formatCurrency(deal.amount || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-xs font-mono">
                    No active deals in pipeline
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
