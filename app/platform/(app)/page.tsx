"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardSummary {
  organizationCount: number;
  adminUserCount: number;
  auditEventsToday: number;
  aiUsage: { available: false; reason: string };
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
        <EmptyStateCard
          label="AI usage"
          reason={summary?.aiUsage.reason}
        />
      </div>

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

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-neutral-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}

function EmptyStateCard({ label, reason }: { label: string; reason?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-neutral-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-400 italic">{reason ?? "Loading…"}</p>
      </CardContent>
    </Card>
  );
}
