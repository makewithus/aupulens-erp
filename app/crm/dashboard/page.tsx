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
import { cachedFetch } from "@/lib/api/cachedFetch";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function CRMDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [churnData, setChurnData] = useState<any>(null);
  const [renewalData, setRenewalData] = useState<any>(null);
  const [expansionData, setExpansionData] = useState<any>(null);
  const [highValueDeals, setHighValueDeals] = useState<any[]>([]);

  const fetchJson = async (url: string) => {
    try {
      const res = await cachedFetch(url);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [pipe, health, churn, renewal, exp, opps] = await Promise.all([
        fetchJson("/api/crm/pipeline/analytics"),
        fetchJson("/api/crm/health"),
        fetchJson("/api/crm/churn"),
        fetchJson("/api/crm/renewals"),
        fetchJson("/api/crm/expansion"),
        fetchJson("/api/crm/opportunities?limit=5"),
      ]);

      if (pipe?.success) setPipelineData(pipe.data);
      if (health?.success) setHealthData(health.data);
      if (churn?.success) setChurnData(churn.data);
      if (renewal?.success) setRenewalData(renewal.data);
      if (exp?.success) setExpansionData(exp.data);
      if (opps?.data) setHighValueDeals(opps.data.slice(0, 5));
    } catch (err) {
      console.error("Error loading CRM dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val || 0);

  const totalPipelineValue = pipelineData?.totalPipelineValue || 0;
  const activeDeals = pipelineData?.activeDeals || pipelineData?.totalOpportunities || 0;
  const wonDeals = pipelineData?.wonDeals || 0;
  const lostDeals = pipelineData?.lostDeals || 0;

  const totalRenewalValue = renewalData?.renewalPipelineValue90Days || 0;
  const totalExpansionValue = expansionData?.summary?.totalExpansionPipeline || 0;
  const retentionRate = expansionData?.summary?.renewalSuccessRate || 0;
  const totalChurnRisk = (churnData?.high || 0) + (churnData?.critical || 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] tracking-wider uppercase font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Customer Intelligence
            </span>
            <span className="px-2 py-0.5 text-[10px] tracking-wider uppercase font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Retention {retentionRate > 0 ? `${retentionRate}%` : "100%"}
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-[56px] font-black tracking-tighter text-primary break-words leading-none">
            CRM Executive Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">
            Enterprise customer telemetry tracking relationship pipeline velocity, win ratios, account health, and renewal security.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="h-9 gap-1.5 font-bold shadow-sm">
            <Link href="/crm/opportunities">
              <Plus className="w-3.5 h-3.5" />
              New Opportunity
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

      {/* Top 4 StatCards - Matching Image 4 & PipelineStats Reference */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border border-border/40 bg-background shadow-none rounded-none p-6">
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-10 w-36 mb-2" />
              <Skeleton className="h-3 w-28" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
          <StatCard
            title="Pipeline Value"
            value={formatCurrency(totalPipelineValue)}
            visual={<UsersGraph />}
            subtitle="Total open pipeline"
          />
          <StatCard
            title="Active Deals"
            value={activeDeals}
            visual={<ActivePulse />}
            subtitle="Currently in progress"
          />
          <StatCard
            title="Won"
            value={wonDeals}
            visual={<UsersGraph />}
            subtitle="Closed successfully"
          />
          <StatCard
            title="Lost"
            value={lostDeals}
            visual={<InactiveOrbit />}
            subtitle="Closed lost"
          />
        </div>
      )}

      {/* Main CRM Intelligence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-1 pt-2">
        {/* Left Column (35% -> lg:col-span-4) */}
        <div className="space-y-1 lg:col-span-4">
          {/* Account Health Distribution */}
          <Card className="bg-background border border-border/40 shadow-none rounded-none">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-bold">
                Account Health Distribution
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Segmented client relationship resilience scores.
              </p>
            </CardHeader>
            <CardContent className="p-6 pt-4">
              {loading ? (
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
          <Card className="bg-background border border-border/40 shadow-none rounded-none">
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
                      className="group block p-3 border border-border/30 hover:bg-muted/30 transition-colors rounded-none"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {acct.company_name}
                        </span>
                        <span className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5">
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

        {/* Right Column (65% -> lg:col-span-8) */}
        <div className="space-y-1 lg:col-span-8">
          {/* 12-Month Revenue Forecast Table */}
          <Card className="bg-background border border-border/40 shadow-none rounded-none">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 border border-border/30 bg-muted/5 font-mono text-xs">
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase">Total Forecast</span>
                    <div className="text-base font-bold text-foreground mt-0.5">
                      {formatCurrency(totalRenewalValue + totalExpansionValue)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase">Renewal Rate</span>
                    <div className="text-base font-bold text-emerald-400 mt-0.5">
                      {retentionRate}%
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase">At-Risk Value</span>
                    <div className="text-base font-bold text-red-400 mt-0.5">
                      {formatCurrency(expansionData?.summary?.atRiskRenewalValue || 0)}
                    </div>
                  </div>
                </div>

                <TableContainer className="border border-border/40 rounded-none">
                  <TableHead>
                    <TableRow className="border-b border-border/40 bg-muted/10">
                      <TableHeaderCell className="py-3 text-xs normal-case tracking-normal">Quarter</TableHeaderCell>
                      <TableHeaderCell className="py-3 text-xs normal-case tracking-normal text-right">Renewal Target</TableHeaderCell>
                      <TableHeaderCell className="py-3 text-xs normal-case tracking-normal text-right">Expansion Pipeline</TableHeaderCell>
                      <TableHeaderCell className="py-3 text-xs normal-case tracking-normal text-right">Total Forecast</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expansionData?.quarterly?.length > 0 ? (
                      expansionData.quarterly.map((q: any) => (
                        <TableRow key={q.quarter} className="border-b border-border/20 hover:bg-muted/20">
                          <TableCell className="py-3 text-sm font-semibold text-foreground">{q.quarter}</TableCell>
                          <TableCell className="py-3 text-right font-mono text-xs text-blue-400">
                            {formatCurrency(q.renewalRevenue)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono text-xs text-emerald-400">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 pt-1">
            {/* Upcoming Renewals */}
            <Card className="bg-background border border-border/40 shadow-none rounded-none">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-base font-bold">Upcoming Renewals</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contracts approaching renewal milestone.
                </p>
              </CardHeader>
              <CardContent className="p-6 pt-3 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-2.5 border border-border/30 bg-red-500/5">
                  <span className="text-red-400 font-semibold">Expiring in 7 days</span>
                  <span className="font-bold text-foreground">{renewalData?.expiring7 || 0} contracts</span>
                </div>
                <div className="flex items-center justify-between p-2.5 border border-border/30 bg-amber-500/5">
                  <span className="text-amber-400 font-semibold">Expiring in 30 days</span>
                  <span className="font-bold text-foreground">{renewalData?.expiring30 || 0} contracts</span>
                </div>
                <div className="flex items-center justify-between p-2.5 border border-border/30 bg-blue-500/5">
                  <span className="text-blue-400 font-semibold">Expiring in 90 days</span>
                  <span className="font-bold text-foreground">{renewalData?.expiring90 || 0} contracts</span>
                </div>
              </CardContent>
            </Card>

            {/* High-Value Opportunities */}
            <Card className="bg-background border border-border/40 shadow-none rounded-none">
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
