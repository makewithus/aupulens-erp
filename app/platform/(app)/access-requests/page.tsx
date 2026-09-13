"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccessRequestRow {
  id: string;
  adminUserId: string;
  tenantId: string;
  reason: string;
  requestedScope: string;
  status: string;
  grantedAt?: string;
  expiresAt?: string;
  endedAt?: string;
  createdAt: string;
}

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("read");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/platform/access-requests");
    const body = await res.json();
    if (body.success) setRequests(body.data);
    else setError(body.message ?? "Failed to load access requests.");
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRequest() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, reason, requestedScope: scope }),
      });
      const body = await res.json();
      if (!body.success) {
        toast.error(body.message ?? "Failed to submit request.");
        return;
      }
      toast.success("Access requested successfully.");
      setTenantId("");
      setReason("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: string) {
    const res = await fetch(`/api/platform/access-requests/${id}/approve`, { method: "POST" });
    const body = await res.json();
    if (!body.success) {
      toast.error(body.message ?? "Failed to approve request.");
      return;
    }
    toast.success("Request approved.");
    await load();
  }

  async function handleDeny(id: string) {
    const res = await fetch(`/api/platform/access-requests/${id}/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Denied from admin console." }),
    });
    const body = await res.json();
    if (!body.success) {
      toast.error(body.message ?? "Failed to deny request.");
      return;
    }
    toast.success("Request denied.");
    await load();
  }

  async function handleEnd(id: string) {
    const res = await fetch(`/api/platform/access-requests/${id}/end`, { method: "POST" });
    const body = await res.json();
    if (!body.success) {
      toast.error(body.message ?? "Failed to end session.");
      return;
    }
    toast.success("Session ended.");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organisation Access</h1>
        <p className="text-sm text-neutral-500">
          Time-boxed, reason-required, fully audited access to a specific organisation&apos;s
          data. Every grant expires automatically (4 hours) and defaults to read-only.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Request access</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Organisation subdomain</Label>
              <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read-only</SelectItem>
                  <SelectItem value="write">Write (requires additional privilege)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reason (required, audited)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <Button onClick={handleRequest} disabled={submitting || !tenantId || !reason.trim()}>
            {submitting ? "Submitting…" : "Request access"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Requests</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 && <p className="text-sm text-neutral-400 italic">No access requests yet.</p>}
          {requests.map((r) => (
            <div key={r.id} className="border-b pb-3 last:border-0 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.tenantId} — {r.requestedScope}</span>
                <Badge variant={r.status === "approved" ? "default" : r.status === "denied" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
              </div>
              <p className="text-neutral-500">{r.reason}</p>
              {r.expiresAt && <p className="text-xs text-neutral-400">Expires: {formatPlatformTimestamp(r.expiresAt)}</p>}
              <div className="flex gap-2 pt-1">
                {r.status === "pending" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleApprove(r.id)}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeny(r.id)}>Deny</Button>
                  </>
                )}
                {r.status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => handleEnd(r.id)}>End session</Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
