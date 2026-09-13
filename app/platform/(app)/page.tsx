"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";
import { formatShortId } from "@/lib/platform/formatting/idFormatter";
import { CopyableId } from "@/components/platform/CopyableId";

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Platform Dashboard</h1>
          <p className="text-sm text-neutral-500">
            Every figure below is read live from the database. Nothing here is a placeholder.
          </p>
        </div>
        <div className="py-12 flex justify-center items-center">
          <p className="text-neutral-500 animate-pulse">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Dashboard</h1>
        <p className="text-sm text-neutral-500">
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
          <StatCard label="Total Organisations" value={summary?.kpis.totalOrganisations?.toLocaleString()} />
          <StatCard label="Active Organisations" value={summary?.kpis.activeOrganisations?.toLocaleString()} />
          <StatCard label="Trial Organisations" value={summary?.kpis.trialOrganisations?.toLocaleString()} />
          <StatCard label="Suspended Organisations" value={summary?.kpis.suspendedOrganisations?.toLocaleString()} />
          <StatCard label="Total Users" value={summary?.kpis.totalUsers?.toLocaleString()} />
          <StatCard label="Active Users" value={summary?.kpis.activeUsers?.toLocaleString()} />
          <StatCard label="Active Subscriptions" value={summary?.kpis.activeSubscriptions?.toLocaleString()} />
          <StatCard label="Upgrades (this month)" value={summary?.kpis.upgrades?.toLocaleString()} />
          <StatCard label="Downgrades (this month)" value={summary?.kpis.downgrades?.toLocaleString()} />
          <StatCard label="AI Requests (this month)" value={summary?.kpis.aiRequestsThisMonth?.toLocaleString()} />
          <StatCard label="AI Cost (this month)" value={summary ? Number(summary.kpis.aiCostThisMonth.toFixed(2)).toLocaleString("en-IN") : undefined} prefix="₹" />
          <StatCard
            label="AI Credits Used"
            value={summary ? Number(summary.kpis.aiCreditsUsedThisMonth.toFixed(2)).toLocaleString("en-IN") : undefined}
            prefix="₹"
          />
          <StatCard label="MRR (contracted)" value={summary?.kpis.contractedMrr?.toLocaleString("en-IN")} prefix="₹" />
          <StatCard label="ARR (contracted)" value={summary?.kpis.contractedArr?.toLocaleString("en-IN")} prefix="₹" />
          <StatCard label="Storage Used" value={summary ? formatBytesNumber(summary.kpis.storageUsedBytesTotal) : undefined} />
          <EmptyStatTile label="API Usage" reason={summary?.kpis.unavailable.find((u) => u.field === "API Usage")?.reason} />
          <StatCard
            label="System Errors"
            value={summary?.kpis.systemErrorsCurrentlyFailing?.toLocaleString()}
          />
          <StatCard label="Security Alerts" value={summary?.kpis.securityAlertsUnresolved?.toLocaleString()} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Admin users" value={summary?.adminUserCount?.toLocaleString()} />
        <StatCard label="Audit events today" value={summary?.auditEventsToday?.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="AI requests today" value={summary?.aiUsage.totalRequestsToday?.toLocaleString()} />
        <StatCard label="AI requests last month" value={summary?.aiUsage.totalRequestsPreviousMonth?.toLocaleString()} />
        <StatCard label="AI requests, all time" value={summary?.aiUsage.totalRequestsAllTime?.toLocaleString()} />
        <StatCard label="Failed AI requests" value={summary?.aiUsage.failedRequests?.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Estimated AI cost this month"
          value={summary ? Number(summary.aiUsage.estimatedCostUsd.toFixed(2)).toLocaleString("en-IN") : undefined}
          prefix="₹"
        />
        <StatCard
          label="Average AI request cost"
          value={summary ? Number(summary.aiUsage.averageRequestCostUsd.toFixed(4)).toLocaleString("en-IN") : undefined}
          prefix="₹"
        />
        <StatCard label="Total AI tokens this month" value={summary?.aiUsage.totalTokens?.toLocaleString()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsError && <p className="text-sm text-red-600">{jobsError}</p>}
          {jobs === null && !jobsError && <p className="text-sm text-neutral-500">Loading…</p>}
          {jobs && (
            <TruncatedList
              items={jobs}
              renderItem={(j) => (
                <div key={j.jobId} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {j.jobId} <span className="text-xs text-neutral-400 font-normal">({j.scheduleLabel})</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      Last run: {j.lastRunAt ? formatPlatformTimestamp(j.lastRunAt) : "never"}
                      {j.lastRunStatus === "error" && <span className="text-red-600"> — failed: {j.lastError}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {j.isStale && <Badge variant="destructive">Stale</Badge>}
                    {!j.isStale && j.isDue && <Badge variant="secondary">Due</Badge>}
                    <Button size="sm" variant="outline" disabled={runningJobId === j.jobId} onClick={() => handleRunNow(j.jobId)}>
                      {runningJobId === j.jobId ? "Running…" : "Run now"}
                    </Button>
                  </div>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts (all)</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 && (
            <p className="text-sm text-neutral-400 italic">No unresolved alerts.</p>
          )}
          <TruncatedList
            items={alerts}
            renderItem={(a) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <p>{a.message}</p>
                  <p className="text-xs text-neutral-400">{formatPlatformTimestamp(a.createdAt)}</p>
                </div>
                <Badge variant={a.severity === "critical" || a.severity === "security" ? "destructive" : "secondary"}>
                  {a.severity}
                </Badge>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Usage Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {aiAlerts.length === 0 && <p className="text-sm text-neutral-400 italic">No unresolved AI usage/cost alerts.</p>}
            <TruncatedList
              items={aiAlerts}
              renderItem={(a) => (
                <div key={a.id} className="text-sm border-b pb-2 last:border-0">
                  <p>{a.message}</p>
                  <p className="text-xs text-neutral-400">{formatPlatformTimestamp(a.createdAt)}</p>
                </div>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {securityAlerts.length === 0 && <p className="text-sm text-neutral-400 italic">No unresolved security alerts.</p>}
            <TruncatedList
              items={securityAlerts}
              renderItem={(a) => (
                <div key={a.id} className="text-sm border-b pb-2 last:border-0">
                  <p>{a.message}</p>
                  <p className="text-xs text-neutral-400">{formatPlatformTimestamp(a.createdAt)}</p>
                </div>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Errors</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs && jobs.filter((j) => j.lastRunStatus === "error").length === 0 && (
            <p className="text-sm text-neutral-400 italic">No jobs currently in a failed state.</p>
          )}
          {jobs && (
            <TruncatedList
              items={jobs.filter((j) => j.lastRunStatus === "error")}
              renderItem={(j) => (
                <div key={j.jobId} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <span>{j.jobId}</span>
                  <span className="text-xs text-red-600 truncate max-w-xs">{j.lastError}</span>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Organisations</CardTitle>
          </CardHeader>
          <CardContent>
            {summary && summary.panels.recentOrganisations.length === 0 && (
              <p className="text-sm text-neutral-400 italic">No organisations yet.</p>
            )}
            {summary && (
              <TruncatedList
                items={summary.panels.recentOrganisations}
                renderItem={(o) => (
                  <div key={o.id} className="text-sm border-b pb-2 last:border-0">
                    <p className="truncate">
                      {o.name} <span className="text-xs text-neutral-400">(<CopyableId value={o.id} />)</span>
                    </p>
                    <p className="text-xs text-neutral-400">{o.status} · {formatPlatformTimestamp(o.createdAt, { dateOnly: true })}</p>
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Subscription Changes</CardTitle>
          </CardHeader>
          <CardContent>
            {summary && summary.panels.recentSubscriptionChanges.length === 0 && (
              <p className="text-sm text-neutral-400 italic">No subscription changes recorded yet.</p>
            )}
            {summary && (
              <TruncatedList
                items={summary.panels.recentSubscriptionChanges}
                renderItem={(e) => (
                  <div key={e.id} className="text-sm border-b pb-2 last:border-0">
                    <div className="truncate flex items-center gap-1"><CopyableId value={e.tenantId} /> <span>— {e.type}</span></div>
                    <p className="text-xs text-neutral-400">{formatPlatformTimestamp(e.occurredAt, { dateOnly: true })}</p>
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Global Admin Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {summary && summary.panels.recentAdminActions.length === 0 && (
              <p className="text-sm text-neutral-400 italic">No admin actions recorded yet.</p>
            )}
            {summary && (
              <TruncatedList
                items={summary.panels.recentAdminActions}
                renderItem={(a) => (
                  <div key={a.id} className="text-sm border-b pb-2 last:border-0">
                    <p className="truncate">{a.actorRole} — {a.eventType}</p>
                    <p className="text-xs text-neutral-400">{a.tenantId ? <CopyableId value={a.tenantId} /> : "—"} · {formatPlatformTimestamp(a.createdAt, { dateOnly: true })}</p>
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top organisations by AI usage this month</CardTitle>
        </CardHeader>
        <CardContent>
          {summary && summary.aiUsage.topOrganisations.length === 0 && (
            <p className="text-sm text-neutral-400 italic">No AI usage recorded yet this month.</p>
          )}
          {summary && (
            <TruncatedList
              items={summary.aiUsage.topOrganisations}
              renderItem={(org) => (
                <div key={org.tenantId} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <span>{org.name}</span>
                  <span className="text-neutral-500">
                    {org.requestCount?.toLocaleString()} requests · ₹{org.estimatedCostUsd.toFixed(2)}
                  </span>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top AI models this month</CardTitle>
        </CardHeader>
        <CardContent>
          {summary && summary.aiUsage.topModels.length === 0 && (
            <p className="text-sm text-neutral-400 italic">No AI usage recorded yet this month.</p>
          )}
          {summary && (
            <TruncatedList
              items={summary.aiUsage.topModels}
              renderItem={(m) => (
                <div key={m.modelName} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <span>{m.modelName}</span>
                  <span className="text-neutral-500">{m.requestCount?.toLocaleString()} requests</span>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment collection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500">
            {summary?.billing.reason ?? "Loading…"}
          </p>
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

function StatCard({ label, value, prefix }: { label: string; value?: number | string; prefix?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-neutral-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">
          {value !== undefined ? `${prefix ?? ""}${value}` : "—"}
        </p>
      </CardContent>
    </Card>
  );
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
