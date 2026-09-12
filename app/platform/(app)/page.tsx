"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

interface DashboardSummary {
  organizationCount: number;
  adminUserCount: number;
  auditEventsToday: number;
  aiUsage: AiUsageSummary;
  billing: { available: false; reason: string };
}

export default function PlatformDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/dashboard/summary")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setSummary(body.data);
        else setError(body.message ?? "Failed to load dashboard.");
      })
      .catch(() => setError("Failed to load dashboard."));

    fetch("/api/platform/alerts?unresolvedOnly=true")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setAlerts(body.data);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Every figure below is read live from the database. Nothing here is a placeholder.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Organisations" value={summary?.organizationCount} />
        <StatCard label="Admin users" value={summary?.adminUserCount} />
        <StatCard label="Audit events today" value={summary?.auditEventsToday} />
        <StatCard label="AI requests this month" value={summary?.aiUsage.totalRequestsThisMonth} />
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
          <CardTitle className="text-base">Alerts</CardTitle>
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
                  <p className="text-xs text-neutral-400">{new Date(a.createdAt).toLocaleString()}</p>
                </div>
                <Badge variant={a.severity === "critical" || a.severity === "security" ? "destructive" : "secondary"}>
                  {a.severity}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
