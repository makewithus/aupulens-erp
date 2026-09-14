"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";
import { formatShortId } from "@/lib/platform/formatting/idFormatter";
import { CopyableId } from "@/components/platform/CopyableId";
import { StatCard } from "@/components/admin/StatCard";

interface JobStatus {
  jobId: string;
  description: string;
  owner: string;
  scheduleLabel: string;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  lastError: string | null;
  nextDueAt: string;
  isDue: boolean;
  isStale: boolean;
}

interface AlertRow {
  id: string;
  tenantId?: string;
  alertType: string;
  severity: string;
  message: string;
  createdAt: string;
}

interface AiUsageSummary {
  available: true;
  thisMonthDataSource: "rollup" | "live";
  totalRequestsAllTime: number;
  totalRequestsThisMonth: number;
  totalRequestsToday: number;
  totalRequestsPreviousMonth: number;
  totalTokens: number;
  estimatedCostUsd: number;
  failedRequests: number;
  averageRequestCostUsd: number;
  topOrganisations: { tenantId: string; name: string; requestCount: number; estimatedCostUsd: number }[];
  topModels: { modelName: string; requestCount: number }[];
}

interface DashboardKpis {
  totalOrganisations: number;
  activeOrganisations: number;
  trialOrganisations: number;
  suspendedOrganisations: number;
  totalUsers: number;
  activeUsers: number;
  activeSubscriptions: number;
  upgrades: number;
  downgrades: number;
  aiRequestsThisMonth: number;
  aiCostThisMonth: number;
  aiCreditsUsedThisMonth: number;
  systemErrorsCurrentlyFailing: number;
  securityAlertsUnresolved: number;
  contractedMrr: number;
  contractedArr: number;
  mrrLabel: string;
  storageUsedBytesTotal: number;
  unavailable: { field: string; reason: string }[];
}

interface DashboardPanels {
  recentOrganisations: { id: string; name: string; subdomain: string; status: string; createdAt: string }[];
  recentSubscriptionChanges: { id: string; tenantId: string; type: string; tier?: string; occurredAt: string }[];
  recentAdminActions: { id: string; actorRole: string; eventType: string; tenantId?: string; entityType?: string; entityId?: string; createdAt: string }[];
}

interface DashboardSummary {
  organizationCount: number;
  adminUserCount: number;
  auditEventsToday: number;
  aiUsage: AiUsageSummary;
  billing: { available: false; reason: string };
  kpis: DashboardKpis;
  panels: DashboardPanels;
}

export default function PlatformDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobStatus[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function loadJobs() {
    fetch("/api/platform/scheduler/jobs")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setJobs(body.data);
        else setJobsError(body.message ?? "Failed to load scheduled jobs.");
      })
      .catch(() => setJobsError("Failed to load scheduled jobs."));
  }

  async function handleRunNow(jobId: string) {
    setRunningJobId(jobId);
    try {
      await fetch(`/api/platform/scheduler/jobs/${jobId}/run`, { method: "POST" });
      loadJobs();
    } finally {
      setRunningJobId(null);
    }
  }

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch("/api/platform/dashboard/summary").then((res) => res.json()).catch(() => ({ success: false })),
      fetch("/api/platform/scheduler/jobs").then((res) => res.json()).catch(() => ({ success: false })),
      fetch("/api/platform/alerts?unresolvedOnly=true").then((res) => res.json()).catch(() => ({ success: false, data: [] }))
    ]).then(([summaryBody, jobsBody, alertsBody]) => {
      if (summaryBody.success) setSummary(summaryBody.data);
      else setError(summaryBody.message ?? "Failed to load dashboard.");

      if (jobsBody.success) setJobs(jobsBody.data);
      else setJobsError(jobsBody.message ?? "Failed to load scheduled jobs.");

      if (alertsBody.success) setAlerts(alertsBody.data);
      setIsLoading(false);
    });
  }, []);

  const AI_ALERT_TYPES = ["ai_usage_threshold", "ai_cost_spike"];
  const aiAlerts = alerts.filter((a) => AI_ALERT_TYPES.includes(a.alertType));
  const securityAlerts = alerts.filter((a) => a.severity === "security");

  function formatSystemError(err: string | null): string {
    if (!err) return "Unknown error occurred.";
    if (err.includes("E11000 duplicate key error")) {
      const match = err.match(/collection:\s*([^ ]+)/);
      const collection = match ? match[1].split('.').pop() : "database";
      return `Duplicate record prevented: The system attempted to create a record that already exists in the ${collection}.`;
    }
    // Add any other common system error string matching here
    if (err.includes("MongoTimeoutError") || err.includes("ECONNREFUSED")) {
      return "Database connection failed. The system timed out while trying to reach the database.";
    }
    return err;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-1 mb-8">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            Platform Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Every figure below is read live from the database. Nothing here is a placeholder.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/20 border-t-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 mb-8">
        <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
          Platform Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Every figure below is read live from the database. Nothing here is a placeholder.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {summary?.aiUsage.thisMonthDataSource === "live" && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
          &quot;This month&quot; AI figures below are computed live — the scheduled rollup job
          hasn&apos;t run recently. See the Scheduled Jobs panel for details.
        </div>
      )}

      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Organisations" value={summary?.kpis.totalOrganisations?.toLocaleString()} />
          <StatCard title="Active Organisations" value={summary?.kpis.activeOrganisations?.toLocaleString()} />
          <StatCard title="Trial Organisations" value={summary?.kpis.trialOrganisations?.toLocaleString()} />
          <StatCard title="Suspended Organisations" value={summary?.kpis.suspendedOrganisations?.toLocaleString()} />
          <StatCard title="Total Users" value={summary?.kpis.totalUsers?.toLocaleString()} />
          <StatCard title="Active Users" value={summary?.kpis.activeUsers?.toLocaleString()} />
          <StatCard title="Active Subscriptions" value={summary?.kpis.activeSubscriptions?.toLocaleString()} />
          <StatCard title="Upgrades (this month)" value={summary?.kpis.upgrades?.toLocaleString()} />
          <StatCard title="Downgrades (this month)" value={summary?.kpis.downgrades?.toLocaleString()} />
          <StatCard title="AI Requests (this month)" value={summary?.kpis.aiRequestsThisMonth?.toLocaleString()} />
          <StatCard title="AI Cost (this month)" value={summary ? `₹${Number(summary.kpis.aiCostThisMonth.toFixed(2)).toLocaleString("en-IN")}` : undefined} />
          <StatCard
            title="AI Credits Used"
            value={summary ? `₹${Number(summary.kpis.aiCreditsUsedThisMonth.toFixed(2)).toLocaleString("en-IN")}` : undefined}
          />
          <StatCard title="MRR (contracted)" value={summary ? `₹${summary.kpis.contractedMrr?.toLocaleString("en-IN")}` : undefined} />
          <StatCard title="ARR (contracted)" value={summary ? `₹${summary.kpis.contractedArr?.toLocaleString("en-IN")}` : undefined} />
          <StatCard title="Storage Used" value={summary ? formatBytesNumber(summary.kpis.storageUsedBytesTotal) : undefined} />
          <EmptyStatTile label="API Usage" reason={summary?.kpis.unavailable.find((u) => u.field === "API Usage")?.reason} />
          <StatCard
            title="System Errors"
            value={summary?.kpis.systemErrorsCurrentlyFailing?.toLocaleString()}
          />
          <StatCard title="Security Alerts" value={summary?.kpis.securityAlertsUnresolved?.toLocaleString()} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Admin users" value={summary?.adminUserCount?.toLocaleString()} />
        <StatCard title="Audit events today" value={summary?.auditEventsToday?.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="AI requests today" value={summary?.aiUsage.totalRequestsToday?.toLocaleString()} />
        <StatCard title="AI requests last month" value={summary?.aiUsage.totalRequestsPreviousMonth?.toLocaleString()} />
        <StatCard title="AI requests, all time" value={summary?.aiUsage.totalRequestsAllTime?.toLocaleString()} />
        <StatCard title="Failed AI requests" value={summary?.aiUsage.failedRequests?.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Estimated AI cost this month"
          value={summary ? `₹${Number(summary.aiUsage.estimatedCostUsd.toFixed(2)).toLocaleString("en-IN")}` : undefined}
        />
        <StatCard
          title="Average AI request cost"
          value={summary ? `₹${Number(summary.aiUsage.averageRequestCostUsd.toFixed(4)).toLocaleString("en-IN")}` : undefined}
        />
        <StatCard title="Total AI tokens this month" value={summary?.aiUsage.totalTokens?.toLocaleString()} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/50 border-b border-border">
          <CardTitle className="text-base font-semibold">Scheduled jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6">
            {jobsError && <p className="text-sm text-red-600">{jobsError}</p>}
            {jobs === null && !jobsError && <p className="text-sm text-muted-foreground">Loading…</p>}
            {jobs && (
              <TruncatedList
                items={jobs}
                renderItem={(j) => (
                  <div key={j.jobId} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm py-4 border-b border-border last:border-0 gap-4">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-foreground truncate">
                        {j.jobId} <span className="text-xs text-muted-foreground font-normal ml-2">({j.scheduleLabel})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last run: {j.lastRunAt ? formatPlatformTimestamp(j.lastRunAt) : "never"}
                        {j.lastRunStatus === "error" && <span className="text-red-500 font-medium ml-1">— failed</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {j.isStale && <Badge variant="destructive" className="rounded-md">Stale</Badge>}
                      {!j.isStale && j.isDue && <Badge variant="secondary" className="rounded-md">Due</Badge>}
                      <Button size="sm" variant="outline" disabled={runningJobId === j.jobId} onClick={() => handleRunNow(j.jobId)}>
                        {runningJobId === j.jobId ? "Running…" : "Run now"}
                      </Button>
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/50 border-b border-border">
          <CardTitle className="text-base font-semibold">Alerts (all)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6">
            {alerts.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No unresolved alerts.</p>
            )}
            <TruncatedList
              items={alerts}
              renderItem={(a) => (
                <div key={a.id} className="flex items-start justify-between text-sm py-4 border-b border-border last:border-0 gap-4">
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground">{formatSystemError(a.message)}</p>
                    <p className="text-xs text-muted-foreground">{formatPlatformTimestamp(a.createdAt)}</p>
                  </div>
                  <Badge variant={a.severity === "critical" || a.severity === "security" ? "destructive" : "secondary"} className="shrink-0 rounded-md">
                    {a.severity}
                  </Badge>
                </div>
              )}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/50 border-b border-border">
            <CardTitle className="text-base font-semibold">AI Usage Alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-6">
              {aiAlerts.length === 0 && <p className="text-sm text-muted-foreground italic">No unresolved AI usage/cost alerts.</p>}
              <TruncatedList
                items={aiAlerts}
                renderItem={(a) => (
                  <div key={a.id} className="text-sm py-3 border-b border-border last:border-0 space-y-1.5">
                    <p className="font-medium text-foreground">{formatSystemError(a.message)}</p>
                    <p className="text-xs text-muted-foreground">{formatPlatformTimestamp(a.createdAt)}</p>
                  </div>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/50 border-b border-border">
            <CardTitle className="text-base font-semibold">Security Alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-6">
              {securityAlerts.length === 0 && <p className="text-sm text-muted-foreground italic">No unresolved security alerts.</p>}
              <TruncatedList
                items={securityAlerts}
                renderItem={(a) => (
                  <div key={a.id} className="text-sm py-3 border-b border-border last:border-0 space-y-1.5">
                    <p className="font-medium text-foreground">{formatSystemError(a.message)}</p>
                    <p className="text-xs text-muted-foreground">{formatPlatformTimestamp(a.createdAt)}</p>
                  </div>
                )}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-destructive/20">
        <CardHeader className="bg-destructive/5 border-b border-destructive/10">
          <CardTitle className="text-base font-semibold text-destructive">System Errors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6">
            {jobs && jobs.filter((j) => j.lastRunStatus === "error").length === 0 && (
              <p className="text-sm text-muted-foreground italic">No jobs currently in a failed state.</p>
            )}
            {jobs && (
              <TruncatedList
                items={jobs.filter((j) => j.lastRunStatus === "error")}
                renderItem={(j) => (
                  <div key={j.jobId} className="flex flex-col gap-2 text-sm py-4 border-b border-border last:border-0">
                    <span className="font-semibold text-foreground">{j.jobId}</span>
                    <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-md font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {formatSystemError(j.lastError)}
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/50 border-b border-border">
            <CardTitle className="text-base font-semibold">Recent Organisations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-6">
              {summary && summary.panels.recentOrganisations.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No organisations yet.</p>
              )}
              {summary && (
                <TruncatedList
                  items={summary.panels.recentOrganisations}
                  renderItem={(o) => (
                    <div key={o.id} className="text-sm py-3 border-b border-border last:border-0 space-y-1.5">
                      <p className="truncate font-medium text-foreground">
                        {o.name} <span className="text-xs text-muted-foreground font-normal ml-1">(<CopyableId value={o.id} />)</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="capitalize">{o.status}</span> · {formatPlatformTimestamp(o.createdAt, { dateOnly: true })}
                      </p>
                    </div>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/50 border-b border-border">
            <CardTitle className="text-base font-semibold">Subscription Changes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-6">
              {summary && summary.panels.recentSubscriptionChanges.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No subscription changes recorded yet.</p>
              )}
              {summary && (
                <TruncatedList
                  items={summary.panels.recentSubscriptionChanges}
                  renderItem={(e) => (
                    <div key={e.id} className="text-sm py-3 border-b border-border last:border-0 space-y-1.5">
                      <div className="truncate flex items-center gap-2 font-medium text-foreground">
                        <CopyableId value={e.tenantId} /> <span className="text-muted-foreground font-normal">— {e.type}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatPlatformTimestamp(e.occurredAt, { dateOnly: true })}</p>
                    </div>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/50 border-b border-border">
            <CardTitle className="text-base font-semibold">Global Admin Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-6">
              {summary && summary.panels.recentAdminActions.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No admin actions recorded yet.</p>
              )}
              {summary && (
                <TruncatedList
                  items={summary.panels.recentAdminActions}
                  renderItem={(a) => (
                    <div key={a.id} className="text-sm py-3 border-b border-border last:border-0 space-y-1.5">
                      <p className="truncate font-medium text-foreground">
                        {a.actorRole} <span className="text-muted-foreground font-normal">— {a.eventType}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.tenantId ? <CopyableId value={a.tenantId} /> : "—"} · {formatPlatformTimestamp(a.createdAt, { dateOnly: true })}
                      </p>
                    </div>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/50 border-b border-border">
            <CardTitle className="text-base font-semibold">Top organisations by AI usage (this month)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-6">
              {summary && summary.aiUsage.topOrganisations.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No AI usage recorded yet this month.</p>
              )}
              {summary && (
                <TruncatedList
                  items={summary.aiUsage.topOrganisations}
                  renderItem={(org) => (
                    <div key={org.tenantId} className="flex items-center justify-between text-sm py-3 border-b border-border last:border-0">
                      <span className="font-medium text-foreground">{org.name}</span>
                      <span className="text-muted-foreground text-xs sm:text-sm">
                        {org.requestCount?.toLocaleString()} requests · ₹{org.estimatedCostUsd.toFixed(2)}
                      </span>
                    </div>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-muted/50 border-b border-border">
            <CardTitle className="text-base font-semibold">Top AI models (this month)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-6">
              {summary && summary.aiUsage.topModels.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No AI usage recorded yet this month.</p>
              )}
              {summary && (
                <TruncatedList
                  items={summary.aiUsage.topModels}
                  renderItem={(m) => (
                    <div key={m.modelName} className="flex items-center justify-between text-sm py-3 border-b border-border last:border-0">
                      <span className="font-medium text-foreground">{m.modelName}</span>
                      <span className="text-muted-foreground text-xs sm:text-sm">{m.requestCount?.toLocaleString()} requests</span>
                    </div>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/50 border-b border-border">
          <CardTitle className="text-base font-semibold">Payment collection</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6">
            <p className="text-sm text-muted-foreground">
              {summary?.billing.reason ?? "Loading…"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytesNumber(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}



/** Present, greyed, with a one-line reason — never a missing tile (Part 1.5: "a missing tile
 *  reads as an oversight; an empty tile with a reason reads as honesty"). */
function EmptyStatTile({ label, reason }: { label: string; reason?: string }) {
  return (
    <Card className="opacity-60" title={reason}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-neutral-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg text-neutral-400 italic">Not available</p>
        {reason && <p className="text-xs text-neutral-400 mt-1">{reason}</p>}
      </CardContent>
    </Card>
  );
}

function TruncatedList<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  if (!items || items.length === 0) return null;
  const showMore = items.length > 5;
  const displayed = expanded ? items : items.slice(0, 5);

  return (
    <div className="space-y-2">
      {displayed.map(renderItem)}
      {showMore && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="w-full text-xs text-neutral-500 mt-2">
          {expanded ? "Show less" : `Show more (${items.length - 5})`}
        </Button>
      )}
    </div>
  );
}
