'use client';

import { Activity } from "lucide-react";

export default function SystemHealthCenter() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="w-8 h-8 text-muted-foreground" /> System Health Center
        </h1>
        <p className="text-muted-foreground mt-1">Backend operations and integration status.</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold">Live health monitoring is not connected</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No health-check source is configured for this page, so subsystem status, failure counts, and check times cannot be verified.
        </p>
      </div>
    </div>
  );
}
