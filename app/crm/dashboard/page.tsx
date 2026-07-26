'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
import CrmOnboarding from "@/components/crm/CrmOnboarding";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [healthData, setHealthData] = useState<any>(null);
  const [churnData, setChurnData] = useState<any>(null);
  const [renewalData, setRenewalData] = useState<any>(null);
  const [expansionData, setExpansionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/health").then((res) => res.json()),
      fetch("/api/crm/churn").then((res) => res.json()),
      fetch("/api/crm/renewals").then((res) => res.json()),
      fetch("/api/crm/expansion").then((res) => res.json()),
    ]).then(([health, churn, renewal, exp]) => {
      if (health.success) setHealthData(health.data);
      if (churn.success) setChurnData(churn.data);
      if (renewal.success) setRenewalData(renewal.data);
      if (exp.success) setExpansionData(exp.data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setLoading(false);
    });
  }, []);

  // Compute aggregated stats
  const totalRenewalValue = renewalData?.renewalPipelineValue90Days || 0;
  const totalExpansionValue = expansionData?.summary?.totalExpansionPipeline || 0;
  const retentionRate = expansionData?.summary?.renewalSuccessRate || 0;
  const totalChurnRisk = (churnData?.high || 0) + (churnData?.critical || 0);

  if (!loading && (!healthData?.accounts || healthData.accounts.length === 0) && (!expansionData?.quarterly || expansionData.quarterly.length === 0)) {
    return <CrmOnboarding />;
  }

  return (
    <div className="p-8 space-y-1 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary leading-none">
            Executive Dashboard
          </h1>
          {/* {lastUpdated && (
            <p className="text-xs text-muted-foreground/60 font-mono">
              Last updated: {lastUpdated}
            </p>
          )} */}
        </div>
        <div className="shrink-0">
          <Button variant="outline" className="border-border/40 bg-background" asChild>
            <Link href="/crm/contracts">Manage Renewals</Link>
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {/* Top Level KPIs (StatCards) */}
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
        {/* <StatCard 
          title="90-day renewal pipeline" 
          value={loading ? <div className="h-14 w-32 bg-muted/25 animate-pulse rounded-none mt-1" /> : `$${totalRenewalValue.toLocaleString()}`}
          subtitle={loading ? "..." : `${(renewalData?.expiring90 || 0)} upcoming renewals`}
          visual={loading ? null : <UsersGraph />}
          className="border border-border/40 bg-background"
        /> */}
        <StatCard 
          title="Expansion pipeline" 
          value={loading ? <div className="h-14 w-32 bg-muted/25 animate-pulse rounded-none mt-1" /> : `$${totalExpansionValue.toLocaleString()}`}
          subtitle={loading ? "..." : "Weighted revenue"}
          visual={loading ? null : <ActivePulse />}
          className="border border-border/40 bg-background"
        />
        <StatCard 
          title="Accounts at risk" 
          value={loading ? <div className="h-14 w-32 bg-muted/25 animate-pulse rounded-none mt-1" /> : totalChurnRisk}
          subtitle={loading ? "..." : `${churnData?.critical || 0} critical, ${churnData?.high || 0} high`}
          visual={loading ? null : <InactiveOrbit />}
          className="border border-border/40 bg-background"
        />
        <StatCard 
          title="Renewal success rate" 
          value={loading ? <div className="h-14 w-32 bg-muted/25 animate-pulse rounded-none mt-1" /> : `${retentionRate}%`}
          subtitle={loading ? "..." : "Historical retention"}
          visual={loading ? null : <ActivePulse />}
          className="border border-border/40 bg-background"
        />
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-1">
        
        {/* Left Column (35% -> lg:col-span-4) */}
        <div className="space-y-1 lg:col-span-4">
          
          {/* Account Health Card */}
          <Card className="bg-background border border-border/40 shadow-none">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-lg font-bold mb-0">
                Account Health Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-4 w-24 bg-muted/25 animate-pulse rounded-none" />
                      <div className="h-2 w-full bg-muted/25 animate-pulse rounded-none" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {healthData?.distribution?.map((bucket: any) => {
                    const label = bucket._id === 0 ? "Critical" : bucket._id === 25 ? "At Risk" : bucket._id === 50 ? "Warning" : "Healthy";
                    const color = bucket._id === 0 ? "bg-red-500" : bucket._id === 25 ? "bg-orange-500" : bucket._id === 50 ? "bg-yellow-500" : "bg-[#8ae06c]";
                    const percentage = healthData.accounts.length > 0 ? (bucket.count / healthData.accounts.length) * 100 : 0;
                    
                    // 10 blocks for segmented visual indicator
                    const activeBlocks = Math.round(percentage / 10);

                    return (
                      <div key={bucket._id} className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground/60">
                          <span className="font-sans text-sm font-semibold text-foreground">{label}</span>
                          <div className="flex items-center gap-2">
                            <span>{bucket.count} accounts</span>
                            <span className="text-foreground font-bold">{percentage.toFixed(0)}%</span>
                          </div>
                        </div>
                        {/* Segmented Visual Indicator (brand colors used as per request) */}
                        <div className="flex gap-1">
                          {Array.from({ length: 10 }).map((_, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "h-1.5 flex-1 transition-all duration-300 rounded-none",
                                idx < activeBlocks ? color : "bg-muted/15"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Critical Churn Risks Card */}
          <Card className="bg-background border border-border/40 shadow-none">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-lg font-bold mb-0 text-red-500">
                Critical Churn Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 w-full bg-muted/20 animate-pulse rounded-none" />
                  ))}
                </div>
              ) : churnData?.criticalAccounts?.length > 0 ? (
                <div className="space-y-3">
                  {churnData.criticalAccounts.slice(0, 5).map((acct: any) => (
                    <Link
                      key={acct._id}
                      href={`/crm/accounts/${acct._id}`}
                      className="group flex items-center justify-between p-3 border border-border/20 bg-background/40 hover:bg-white/[0.02] hover:border-border/40 transition-all duration-300 rounded-none"
                    >
                      <div className="space-y-1.5 flex-1 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {acct.company_name}
                          </span>
                          <span className="text-[9px] font-mono text-red-500 bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 rounded-none font-medium">
                            risk
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/75 leading-relaxed">
                          {acct.reasons[0] || "No critical churn reasons stated."}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {churnData.criticalAccounts.length > 5 && (
                    <div className="text-xs text-center text-muted-foreground/40 pt-2 font-mono">
                      + {churnData.criticalAccounts.length - 5} more accounts at risk
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground/50 text-sm">
                  No critical risks detected.
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Right Column (65% -> lg:col-span-8) */}
        <div className="space-y-1 lg:col-span-8">
          
          {/* Revenue Forecast Card */}
          <Card className="bg-background border border-border/40 shadow-none">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-lg font-bold mb-0">
                12-Month Revenue Forecast
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {loading ? (
                <div className="h-64 w-full bg-muted/20 animate-pulse rounded-none" />
              ) : (
                <div className="space-y-6">
                  {/* Compact Revenue Summary (no uppercase / pills) */}
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-border/45 bg-muted/5 rounded-none">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">Total forecast value</span>
                      <h3 className="text-xl font-bold font-mono text-foreground">${(totalRenewalValue + totalExpansionValue).toLocaleString()}</h3>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">Renewal success rate</span>
                      <h3 className="text-xl font-bold font-mono text-foreground">{retentionRate}%</h3>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">Value at risk</span>
                      <h3 className="text-xl font-bold font-mono text-red-500">${(expansionData?.summary?.atRiskRenewalValue || 0).toLocaleString()}</h3>
                    </div>
                  </div>

                  {/* Forecast Table using CRM Shared Table components */}
                  <TableContainer className="border border-border/40 rounded-none">
                    <TableHead>
                      <TableRow className="border-b border-border/40 bg-muted/5">
                        <TableHeaderCell className="normal-case tracking-normal text-xs font-semibold text-muted-foreground/60 py-3.5">Quarter</TableHeaderCell>
                        <TableHeaderCell className="normal-case tracking-normal text-xs font-semibold text-muted-foreground/60 py-3.5 text-right">Renewal Target</TableHeaderCell>
                        <TableHeaderCell className="normal-case tracking-normal text-xs font-semibold text-muted-foreground/60 py-3.5 text-right">Expansion Pipeline</TableHeaderCell>
                        <TableHeaderCell className="normal-case tracking-normal text-xs font-semibold text-muted-foreground/60 py-3.5 text-right">Total Forecast</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {expansionData?.quarterly?.map((q: any) => (
                        <TableRow key={q.quarter} className="border-b border-border/30 hover:bg-muted/10">
                          <TableCell className="py-4 text-sm font-semibold text-foreground">{q.quarter}</TableCell>
                          <TableCell className="py-4 text-right font-mono text-xs text-blue-500/80 dark:text-blue-400/80">${q.renewalRevenue.toLocaleString()}</TableCell>
                          <TableCell className="py-4 text-right font-mono text-xs text-emerald-500/80 dark:text-emerald-400/80">${q.expansionRevenue.toLocaleString()}</TableCell>
                          <TableCell className="py-4 text-right font-mono text-sm font-bold text-foreground">${q.totalRevenue.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {expansionData?.quarterly?.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground/50 text-sm">
                            No forecast data available.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </TableContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sub Grid for Upcoming Renewals & Action Required */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            
            {/* Upcoming Renewals Card */}
            <Card className="bg-background border border-border/40 shadow-none">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-lg font-bold mb-0">
                  Upcoming Renewals
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-2">
                {loading ? (
                  <div className="space-y-4 py-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-10 w-full bg-muted/20 animate-pulse rounded-none" />
                    ))}
                  </div>
                ) : (
                  <div className="relative pl-6 border-l border-border/40 py-2 space-y-6">
                    {/* 7 Days Timeline Item */}
                    <div className="relative">
                      <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border border-red-500 bg-background flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Expiring in 7 days</span>
                        <span className="font-mono text-sm font-bold text-red-500">{renewalData?.expiring7 || 0}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5">urgent renewal actions required</p>
                    </div>

                    {/* 30 Days Timeline Item */}
                    <div className="relative">
                      <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border border-orange-500 bg-background flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Expiring in 30 days</span>
                        <span className="font-mono text-sm font-bold text-orange-500">{renewalData?.expiring30 || 0}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5">accounts to follow up this month</p>
                    </div>

                    {/* 60 Days Timeline Item */}
                    <div className="relative">
                      <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border border-yellow-500 bg-background flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Expiring in 60 days</span>
                        <span className="font-mono text-sm font-bold text-yellow-500">{renewalData?.expiring60 || 0}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5">pipeline contracts under review</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Required Card */}
            <Card className="bg-background border border-border/40 shadow-none">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-lg font-bold mb-0">
                  Action Required
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-2">
                {loading ? (
                  <div className="space-y-4 py-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-16 w-full bg-muted/20 animate-pulse rounded-none" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4 py-1">
                    {/* Task: Expired active contracts */}
                    <div className="flex items-start gap-3.5 p-3 border border-border/20 bg-background hover:bg-white/[0.015] transition-all rounded-none">
                      <div className="mt-1">
                        <div className="w-3.5 h-3.5 rounded-none border border-red-500 bg-red-500/10 flex items-center justify-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-none" />
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="text-xs font-bold text-foreground">expired active contracts</h4>
                          <span className="font-mono text-xs font-bold text-red-500">{renewalData?.expiredActive || 0}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/75 leading-relaxed">
                          Contracts passed end date but not closed.
                        </p>
                        <div className="pt-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-[10px] border-border/40 bg-background rounded-none font-mono" asChild>
                            <Link href="/crm/contracts">review contracts</Link>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Task: Renewal revenue at risk */}
                    <div className="flex items-start gap-3.5 p-3 border border-border/20 bg-background hover:bg-white/[0.015] transition-all rounded-none">
                      <div className="mt-1">
                        <div className="w-3.5 h-3.5 rounded-none border border-orange-500 bg-orange-500/10 flex items-center justify-center">
                          <span className="w-1.5 h-1.5 bg-orange-500 rounded-none" />
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="text-xs font-bold text-foreground">renewal revenue risk</h4>
                          <span className="font-mono text-xs font-bold text-orange-500">${(expansionData?.summary?.atRiskRenewalValue || 0).toLocaleString()}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/75 leading-relaxed">
                          Value tied up in high-risk health accounts.
                        </p>
                        <div className="pt-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-[10px] border-border/40 bg-background rounded-none font-mono" asChild>
                            <Link href="/crm/accounts">review accounts</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

        </div>

      </div>
      </div>
    </div>
  );
}
