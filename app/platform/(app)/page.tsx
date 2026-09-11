"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AiUsageSummary {
  available: true;
  totalRequestsThisMonth: number;
  totalRequestsToday: number;
  totalRequestsPreviousMonth: number;
  estimatedCostUsd: number;
  failedRequests: number;
  topOrganisations: { tenantId: string; name: string; requestCount: number; estimatedCostUsd: number }[];
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/dashboard/summary")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setSummary(body.data);
        else setError(body.message ?? "Failed to load dashboard.");
      })
      .catch(() => setError("Failed to load dashboard."));
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
        <StatCard label="Failed AI requests" value={summary?.aiUsage.failedRequests} />
        <StatCard
          label="Estimated AI cost this month"
          value={summary ? Number(summary.aiUsage.estimatedCostUsd.toFixed(2)) : undefined}
          prefix="$"
        />
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
