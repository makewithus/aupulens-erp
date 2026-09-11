"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ApiMonitoringSummary {
  apiKeyCount: number;
  apiUsageCount: number;
  hasExternalApi: boolean;
  note?: string;
}

export default function ApiMonitoringPage() {
  const [summary, setSummary] = useState<ApiMonitoringSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/api-monitoring")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setSummary(body.data);
        else setError(body.message ?? "Failed to load.");
      })
      .catch(() => setError("Failed to load."));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">API Monitoring</h1>
        <p className="text-sm text-neutral-500">External, key-authenticated API usage.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">API keys issued</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary?.apiKeyCount ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">API requests logged</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary?.apiUsageCount ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {summary?.note && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-neutral-400 italic">{summary.note}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
