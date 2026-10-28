'use client';

import { ShieldCheck } from "lucide-react";

export default function ComplianceCenterPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-10 h-10 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">Compliance Center</h1>
          <p className="text-muted-foreground">Repository and security compliance results.</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold">No live compliance results available</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This workspace does not have a compliance scan or verified requirements dataset connected. Completion, access control, and database status are not reported here until they can be read from a current source.
        </p>
      </div>
    </div>
  );
}
