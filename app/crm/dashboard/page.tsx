"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ShieldAlert,
  HeartPulse,
  DollarSign,
  Plus,
  PhoneCall,
  Calendar,
  Layers,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { DailyBrickBarChart } from "@/components/charts/DailyBrickBarChart";
import { SubsystemTransactionVolumeChart } from "@/components/crm/SubsystemTransactionVolumeChart";
import { useThemeStore } from "@/store/themeStore";
import { BRAND_COLORS } from "@/lib/constants/brandColors";
import { cn } from "@/lib/utils";
import { cachedFetch } from "@/lib/api/cachedFetch";

export default function CRMDashboardPage() {
  const { data: session } = useSession();
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [isLoading, setIsLoading] = useState(true);

  // Live CRM State
  const [crmStats, setCrmStats] = useState({
    totalPipelineValue: 0,
    pipelineGrowthYoY: 0,
    winRate: 0,
    avgSalesCycleDays: 0,
    netRetentionRate: 0,
    expansionARR: 0,
    accountsAtRiskCount: 0,
    churnValueRisk: 0,
    totalLeadsThisMonth: 0,
    leadConversionRate: 0,
  });

  const [accountHealthDistribution, setAccountHealthDistribution] = useState<any[]>([]);
  const [criticalChurnAccounts, setCriticalChurnAccounts] = useState<any[]>([]);
  const [highValueDeals, setHighValueDeals] = useState<any[]>([]);
  const [dailyLeadInflow, setDailyLeadInflow] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadCrmData() {
      try {
        setIsLoading(true);
        const fetchJson = async (url: string) => {
          try {
            const r = await cachedFetch(url);
            return r.ok ? await r.json() : null;
          } catch {
            return null;
          }
        };

        const [pData, oppsData, leadsData, acctsData] = await Promise.all([
          fetchJson("/api/crm/pipeline/analytics"),
          fetchJson("/api/crm/opportunities?limit=10"),
          fetchJson("/api/crm/leads"),
          fetchJson("/api/crm/accounts?limit=20"),
        ]);

        if (!isMounted) return;

        // 1. Pipeline Analytics
        if (pData?.data) {
          const p = pData.data;
          setCrmStats((prev) => ({
            ...prev,
            totalPipelineValue: p.totalPipelineValue || 0,
            winRate: Math.round(p.winRate || 0),
            expansionARR: p.weightedPipeline || 0,
          }));
        }

        // 2. Opportunities (High-Value Deals)
        if (oppsData) {
          const opps = oppsData.data || (Array.isArray(oppsData) ? oppsData : []);
          setHighValueDeals(
            opps.slice(0, 5).map((o: any) => ({
              id: o.opportunity_id || o.deal_name || o._id?.slice(-8) || "DEAL",
              customer: o.account_name || o.account_id?.name || o.deal_name || "Enterprise Client",
              value: o.amount || 0,
              stage: o.stage || "Prospecting",
              probability: o.probability || 50,
              expectedClose: o.expected_close_date ? new Date(o.expected_close_date).toLocaleDateString() : "Active",
              owner: o.owner_name || o.owner_id?.name || "Account Exec",
            }))
          );
        }

        // 3. Leads & Daily Inflow
        if (leadsData) {
          const leads = leadsData.data || leadsData.leads || (Array.isArray(leadsData) ? leadsData : []);
          setCrmStats((prev) => ({ ...prev, totalLeadsThisMonth: leads.length }));

          const countsByDate = new Map<string, number>();
          for (const lead of leads) {
            const d = lead.created_at || lead.createdAt;
            if (!d) continue;
            const dateStr = new Date(d).toISOString().slice(0, 10);
            countsByDate.set(dateStr, (countsByDate.get(dateStr) || 0) + 1);
          }
          setDailyLeadInflow(
            Array.from(countsByDate.entries()).map(([date, count]) => ({ date, count }))
          );
        }

        // 4. Accounts & Health
        if (acctsData) {
          const accts = acctsData.data || (Array.isArray(acctsData) ? acctsData : []);
          const totalAccts = accts.length;
          if (totalAccts > 0) {
            const healthy = accts.filter((a: any) => (a.health_score || 80) >= 80).length;
            const warning = accts.filter((a: any) => (a.health_score || 80) >= 60 && (a.health_score || 80) < 80).length;
            const atRisk = accts.filter((a: any) => (a.health_score || 80) >= 40 && (a.health_score || 80) < 60).length;
            const critical = accts.filter((a: any) => (a.health_score || 80) < 40).length;

            setAccountHealthDistribution([
              { label: "Healthy Accounts (80-100)", count: healthy, percent: Math.round((healthy / totalAccts) * 100), color: BRAND_COLORS.accent.green },
              { label: "Warning / Attention (60-79)", count: warning, percent: Math.round((warning / totalAccts) * 100), color: BRAND_COLORS.accent.yellow },
              { label: "At Risk (40-59)", count: atRisk, percent: Math.round((atRisk / totalAccts) * 100), color: BRAND_COLORS.accent.purple },
              { label: "Critical Churn Risk (<40)", count: critical, percent: Math.round((critical / totalAccts) * 100), color: BRAND_COLORS.accent.red },
            ]);

            const churnRisk = accts.filter((a: any) => (a.health_score || 100) < 50);
            setCriticalChurnAccounts(
              churnRisk.slice(0, 3).map((a: any) => ({
                id: a.account_number || a._id?.slice(-6) || "ACC",
                name: a.name || a.company_name || "Account",
                contractValue: a.annual_revenue || a.contract_value || 0,
                healthScore: a.health_score || 35,
                riskReason: a.churn_risk_reason || "Low user adoption and pending tickets",
                owner: a.owner_name || "Success Mgr",
                renewalDays: a.renewal_date ? `${Math.max(0, Math.ceil((new Date(a.renewal_date).getTime() - Date.now()) / (1000 * 3600 * 24)))} days` : "30 days",
              }))
            );
          } else {
            setAccountHealthDistribution([]);
            setCriticalChurnAccounts([]);
          }
        }
      } catch (err) {
        console.error("Failed to load CRM dashboard data:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadCrmData();
    return () => { isMounted = false; };
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 min-w-0 max-w-full font-mono">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Customer Intelligence
            </span>
            <span className="px-2.5 py-0.5 text-[10px] tracking-wider uppercase font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              NRR 118.4%
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
            CRM Executive Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Enterprise customer telemetry tracking relationship pipeline velocity, win ratios, account health, and renewal security.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="text-xs font-mono h-9 gap-1.5 bg-[#6CADF5] hover:bg-[#5aa0eb] text-[#0A0A0A] font-bold shadow-sm"
          >
            <Link href="/crm/opportunities">
              <Plus className="w-3.5 h-3.5" />
              New Opportunity
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(
              "text-xs font-mono h-9 gap-1.5 border-border/70",
              isDark ? "bg-[#161616] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white text-zinc-800 hover:bg-zinc-100"
            )}
          >
            <Link href="/crm/leads">
              <Users className="w-3.5 h-3.5" />
              Lead Pipeline
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(
              "text-xs font-mono h-9 gap-1.5 border-border/70",
              isDark ? "bg-[#161616] text-[#F2F2F2] hover:bg-[#272727]" : "bg-white text-zinc-800 hover:bg-zinc-100"
            )}
          >
            <Link href="/crm/contracts">
              <Calendar className="w-3.5 h-3.5" />
              Manage Renewals
            </Link>
          </Button>
        </div>
      </div>

      {/* 4 Primary CRM KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Pipeline Value */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
              <span>Total Active Pipeline</span>
              <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                <Briefcase className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-foreground">
              {formatCurrency(crmStats.totalPipelineValue)}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-blue-400 font-semibold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+{crmStats.pipelineGrowthYoY}% YoY expansion</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Win Rate % */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
              <span>Opportunity Win Rate</span>
              <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-emerald-400">
              {crmStats.winRate}%
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-semibold">
              <span>Avg sales cycle: {crmStats.avgSalesCycleDays} days</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Net Retention Rate */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
              <span>Net Retention Rate (NRR)</span>
              <span className="p-1.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">
                <HeartPulse className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-foreground">
              {crmStats.netRetentionRate}%
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-purple-400 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{formatCurrency(crmStats.expansionARR)} expansion ARR</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Accounts At Risk */}
        <Card
          className={cn(
            "border border-border/60 shadow-sm",
            isDark ? "bg-[#161616]" : "bg-card"
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">
              <span>Accounts at Risk</span>
              <span className="p-1.5 bg-red-500/10 text-red-500 rounded border border-red-500/20">
                <ShieldAlert className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-black tracking-tight text-red-500">
              {crmStats.accountsAtRiskCount} Accounts
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-red-400 font-semibold">
              <span>{formatCurrency(crmStats.churnValueRisk)} contract ARR at risk</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Subsystem Transaction Volume (Enhanced) */}
      <SubsystemTransactionVolumeChart />

      {/* Section 3: Daily Inflow Velocity & Account Health Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Opportunity Inflow (DailyBrickBarChart) */}
        <div className="lg:col-span-8">
          <Card
            className={cn(
              "border border-border/60 shadow-sm h-full",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#6CADF5] animate-pulse" />
                  <CardTitle className="text-base font-bold">
                    Daily Lead Inflow & Qualified Opportunities
                  </CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  High-frequency pipeline progression tracking daily MQL and SQL transitions.
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#6CADF5]" />
                  <span className="text-muted-foreground">Inbound Leads</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#A77DFF]" />
                  <span className="text-muted-foreground">SQL Converted</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <DailyBrickBarChart
                height={320}
                colorTheme="blue"
                metricLabel="Inbound Leads"
                data={dailyLeadInflow}
                valueKey="count"
                yAxisFormatter={(v) => `${v}`}
              />
            </CardContent>
          </Card>
        </div>

        {/* Account Health Distribution Progress Bars */}
        <div className="lg:col-span-4">
          <Card
            className={cn(
              "border border-border/60 shadow-sm h-full flex flex-col justify-between",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardHeader className="p-5 border-b border-border/60">
              <CardTitle className="text-base font-bold">
                Customer Health Cohorts
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Composite scoring based on telemetry logins, tickets, and billing status.
              </p>
            </CardHeader>
            <CardContent className="p-5 space-y-5 flex-1 flex flex-col justify-center">
              {accountHealthDistribution.length > 0 ? (
                accountHealthDistribution.map((cohort, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground">{cohort.label}</span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          backgroundColor: `${cohort.color}20`,
                          color: cohort.color,
                          border: `1px solid ${cohort.color}40`,
                        }}
                      >
                        {cohort.count} accounts ({cohort.percent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-border/40 overflow-hidden">
                      <div
                        className="h-full transition-all duration-500"
                        style={{ width: `${cohort.percent}%`, backgroundColor: cohort.color }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground font-mono">
                  No customer accounts registered yet for this organization.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 4: Critical Churn Risks & High-Value Deals Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Critical Churn Risks */}
        <div className="lg:col-span-5">
          <Card
            className={cn(
              "border border-border/60 shadow-sm h-full",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-red-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Immediate Churn Risk Interventions
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  High-value accounts displaying negative health indicators.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                {criticalChurnAccounts.length > 0 ? (
                  criticalChurnAccounts.map((acct, i) => (
                    <div key={i} className="p-4 hover:bg-muted/10 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className="font-bold text-foreground text-xs">{acct.name}</span>
                          <div className="text-[10px] text-muted-foreground">Owner: {acct.owner}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-red-500 block">
                            {formatCurrency(acct.contractValue)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Renewal in {acct.renewalDays}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-red-400/90 mt-1 bg-red-500/10 p-2 border border-red-500/20">
                        ⚠️ {acct.riskReason}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                    Zero customer accounts currently at risk of churn.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* High-Touch Closing Opportunities */}
        <div className="lg:col-span-7">
          <Card
            className={cn(
              "border border-border/60 shadow-sm h-full",
              isDark ? "bg-[#161616]" : "bg-card"
            )}
          >
            <CardHeader className="p-5 border-b border-border/60 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">
                  High-Value Enterprise Opportunities
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Top weighted opportunities in final negotiation and proposal review.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="text-xs font-mono h-8 border-border/60"
              >
                <Link href="/crm/opportunities">View All ({highValueDeals.length})</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs font-mono">
                  <thead className="border-b border-border/60 text-muted-foreground bg-muted/20">
                    <tr>
                      <th className="p-3 pl-5 whitespace-nowrap">Opportunity / Client</th>
                      <th className="p-3 whitespace-nowrap">Value</th>
                      <th className="p-3 whitespace-nowrap">Stage</th>
                      <th className="p-3 whitespace-nowrap">Probability</th>
                      <th className="p-3 whitespace-nowrap">Close Date</th>
                      <th className="p-3 pr-5 text-right whitespace-nowrap">Owner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {highValueDeals.length > 0 ? (
                      highValueDeals.map((deal, i) => (
                        <tr key={i} className="hover:bg-muted/10 transition-colors">
                          <td className="p-3 pl-5 whitespace-nowrap">
                            <div className="font-bold text-foreground">{deal.customer}</div>
                            <div className="text-[10px] text-muted-foreground">{deal.id}</div>
                          </td>
                          <td className={cn("p-3 font-semibold whitespace-nowrap", isDark ? "text-[#6CADF5]" : "text-blue-700 font-bold")}>
                            {formatCurrency(deal.value)}
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">{deal.stage}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold border",
                              isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-300"
                            )}>
                              {deal.probability}%
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">{deal.expectedClose}</td>
                          <td className="p-3 pr-5 text-right text-muted-foreground whitespace-nowrap">{deal.owner}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-muted-foreground font-mono">
                          No active enterprise opportunities found for this organization.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
