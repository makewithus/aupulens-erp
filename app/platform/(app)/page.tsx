"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";

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
    fetch("/api/platform/dashboard/summary")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setSummary(body.data);
        else setError(body.message ?? "Failed to load dashboard.");
      })
      .catch(() => setError("Failed to load dashboard."));

    loadJobs();

    fetch("/api/platform/alerts?unresolvedOnly=true")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setAlerts(body.data);
      });
  }, []);

  const AI_ALERT_TYPES = ["ai_usage_threshold", "ai_cost_spike"];
  const aiAlerts = alerts.filter((a) => AI_ALERT_TYPES.includes(a.alertType));
  const securityAlerts = alerts.filter((a) => a.severity === "security");

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
        <p className="text-sm font-medium mb-2">Source doc §24 — the 18 named KPIs</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Organisations" value={summary?.kpis.totalOrganisations} />
          <StatCard label="Active Organisations" value={summary?.kpis.activeOrganisations} />
          <StatCard label="Trial Organisations" value={summary?.kpis.trialOrganisations} />
          <StatCard label="Suspended Organisations" value={summary?.kpis.suspendedOrganisations} />
          <StatCard label="Total Users" value={summary?.kpis.totalUsers} />
          <StatCard label="Active Users" value={summary?.kpis.activeUsers} />
          <StatCard label="Active Subscriptions" value={summary?.kpis.activeSubscriptions} />
          <StatCard label="Upgrades (this month)" value={summary?.kpis.upgrades} />
          <StatCard label="Downgrades (this month)" value={summary?.kpis.downgrades} />
          <StatCard label="AI Requests (this month)" value={summary?.kpis.aiRequestsThisMonth} />
          <StatCard label="AI Cost (this month)" value={summary ? Number(summary.kpis.aiCostThisMonth.toFixed(2)) : undefined} prefix="$" />
          <StatCard
            label="AI Credits Used"
            value={summary ? Number(summary.kpis.aiCreditsUsedThisMonth.toFixed(2)) : undefined}
            prefix="$"
          />
          <EmptyStatTile label="MRR" reason={summary?.kpis.unavailable.find((u) => u.field === "MRR")?.reason} />
          <EmptyStatTile label="ARR" reason={summary?.kpis.unavailable.find((u) => u.field === "ARR")?.reason} />
          <EmptyStatTile label="Storage Used" reason={summary?.kpis.unavailable.find((u) => u.field === "Storage Used")?.reason} />
          <EmptyStatTile label="API Usage" reason={summary?.kpis.unavailable.find((u) => u.field === "API Usage")?.reason} />
          <StatCard
            label="System Errors"
            value={summary?.kpis.systemErrorsCurrentlyFailing}
          />
          <StatCard label="Security Alerts" value={summary?.kpis.securityAlertsUnresolved} />
        </div>
        <p className="text-xs text-neutral-400 italic mt-2">
          &quot;AI Credits Used&quot; shows the same figure as AI Cost — this codebase denominates
          AI credits in currency, not a separate unit (see the AI limits editor&apos;s own
          &quot;Monthly credits (₹)&quot; field). &quot;System Errors&quot; counts scheduled jobs
          currently in a failed state, not a historical error count — SchedulerJobRun keeps only
          each job&apos;s latest run, not a log.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Admin users" value={summary?.adminUserCount} />
        <StatCard label="Audit events today" value={summary?.auditEventsToday} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="AI requests today" value={summary?.aiUsage.totalRequestsToday} />
        <StatCard label="AI requests last month" value={summary?.aiUsage.totalRequestsPreviousMonth} />
        <StatCard label="AI requests, all time" value={summary?.aiUsage.totalRequestsAllTime} />
        <StatCard label="Failed AI requests" value={summary?.aiUsage.failedRequests} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Estimated AI cost this month"
          value={summary ? Number(summary.aiUsage.estimatedCostUsd.toFixed(2)) : undefined}
          prefix="$"
        />
        <StatCard
          label="Average AI request cost"
          value={summary ? Number(summary.aiUsage.averageRequestCostUsd.toFixed(4)) : undefined}
          prefix="$"
        />
        <StatCard label="Total AI tokens this month" value={summary?.aiUsage.totalTokens} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled jobs</CardTitle>
          <p className="text-xs text-neutral-500">
            This project&apos;s Vercel plan does not support the cron schedules these jobs used to
            run on (docs/admin/CRON_INCIDENT.md) — they now run via this scheduler instead. A
            job overdue past 3× its own interval is flagged stale here and raises an alert.
          </p>
        </CardHeader>
        <CardContent>
          {jobsError && <p className="text-sm text-red-600">{jobsError}</p>}
          {jobs === null && !jobsError && <p className="text-sm text-neutral-500">Loading…</p>}
          {jobs && (
            <div className="space-y-2">
              {jobs.map((j) => (
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
              ))}
            </div>
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
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <p>{a.message}</p>
                  <p className="text-xs text-neutral-400">{formatPlatformTimestamp(a.createdAt)}</p>
                </div>
                <Badge variant={a.severity === "critical" || a.severity === "security" ? "destructive" : "secondary"}>
                  {a.severity}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Usage Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {aiAlerts.length === 0 && <p className="text-sm text-neutral-400 italic">No unresolved AI usage/cost alerts.</p>}
            <div className="space-y-2">
              {aiAlerts.map((a) => (
                <div key={a.id} className="text-sm border-b pb-2 last:border-0">
                  <p>{a.message}</p>
                  <p className="text-xs text-neutral-400">{formatPlatformTimestamp(a.createdAt)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {securityAlerts.length === 0 && <p className="text-sm text-neutral-400 italic">No unresolved security alerts.</p>}
            <div className="space-y-2">
              {securityAlerts.map((a) => (
                <div key={a.id} className="text-sm border-b pb-2 last:border-0">
                  <p>{a.message}</p>
                  <p className="text-xs text-neutral-400">{formatPlatformTimestamp(a.createdAt)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Errors</CardTitle>
          <p className="text-xs text-neutral-500">Scheduled jobs currently in a failed state — a subset of the Scheduled Jobs panel below.</p>
        </CardHeader>
        <CardContent>
          {jobs && jobs.filter((j) => j.lastRunStatus === "error").length === 0 && (
            <p className="text-sm text-neutral-400 italic">No jobs currently in a failed state.</p>
          )}
          <div className="space-y-2">
            {jobs?.filter((j) => j.lastRunStatus === "error").map((j) => (
              <div key={j.jobId} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <span>{j.jobId}</span>
                <span className="text-xs text-red-600 truncate max-w-xs">{j.lastError}</span>
              </div>
            ))}
          </div>
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
            <div className="space-y-2">
              {summary?.panels.recentOrganisations.map((o) => (
                <div key={o.id} className="text-sm border-b pb-2 last:border-0">
                  <p className="truncate">{o.name}</p>
                  <p className="text-xs text-neutral-400">{o.status} · {formatPlatformTimestamp(o.createdAt, { dateOnly: true })}</p>
                </div>
              ))}
            </div>
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
            <div className="space-y-2">
              {summary?.panels.recentSubscriptionChanges.map((e) => (
                <div key={e.id} className="text-sm border-b pb-2 last:border-0">
                  <p className="truncate">{e.tenantId} — {e.type}</p>
                  <p className="text-xs text-neutral-400">{formatPlatformTimestamp(e.occurredAt, { dateOnly: true })}</p>
                </div>
              ))}
            </div>
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
            <div className="space-y-2">
              {summary?.panels.recentAdminActions.map((a) => (
                <div key={a.id} className="text-sm border-b pb-2 last:border-0">
                  <p className="truncate">{a.actorRole} — {a.eventType}</p>
                  <p className="text-xs text-neutral-400">{a.tenantId ?? "—"} · {formatPlatformTimestamp(a.createdAt, { dateOnly: true })}</p>
                </div>
              ))}
            </div>
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
          <div className="space-y-2">
            {summary?.aiUsage.topOrganisations.map((org) => (
              <div key={org.tenantId} className="flex items-center justify-between text-sm">
                <span>{org.name}</span>
                <span className="text-neutral-500">
                  {org.requestCount} requests · ${org.estimatedCostUsd.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
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
          <div className="space-y-2">
            {summary?.aiUsage.topModels.map((m) => (
              <div key={m.modelName} className="flex items-center justify-between text-sm">
                <span>{m.modelName}</span>
                <span className="text-neutral-500">{m.requestCount} requests</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform billing (MRR / ARR)</CardTitle>
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

function StatCard({ label, value, prefix }: { label: string; value?: number; prefix?: string }) {
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
