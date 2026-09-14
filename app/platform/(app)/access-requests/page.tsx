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
    try {
      const res = await fetch("/api/platform/access-requests");
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        if (body.success) setRequests(body.data);
        else setError(body.message ?? "Failed to load access requests.");
      } catch (err) {
        setError(`Failed to load data (Server Error: ${res.status}). Response: ${text.slice(0, 50)}`);
      }
    } catch (err: any) {
      setError(err.message);
    }
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
    <div className="space-y-6 max-w-3xl mx-auto p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Organisation Access</h1>
        <p className="text-sm text-muted-foreground">
          Time-boxed, reason-required, fully audited access to a specific organisation&apos;s
          data. Every grant expires automatically (4 hours) and defaults to read-only.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-md font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/50 border-b border-border">
          <CardTitle className="text-base font-semibold">Request access</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Organisation subdomain</Label>
                <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-full" placeholder="e.g. acme-corp" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read-only</SelectItem>
                    <SelectItem value="write">Write (requires additional privilege)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Reason (required, audited)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="resize-none" placeholder="Explain why you need access to this tenant..." />
            </div>
            <Button onClick={handleRequest} disabled={submitting || !tenantId || !reason.trim()}>
              {submitting ? "Submitting…" : "Request access"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/50 border-b border-border">
          <CardTitle className="text-base font-semibold">Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6 space-y-2">
            {requests.length === 0 && <p className="text-sm text-muted-foreground italic">No access requests yet.</p>}
            {requests.map((r) => (
              <div key={r.id} className="border-b border-border py-4 last:border-0 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{r.tenantId} <span className="text-muted-foreground font-normal ml-2">— {r.requestedScope}</span></span>
                  <Badge variant={r.status === "approved" ? "default" : r.status === "denied" ? "destructive" : "secondary"} className="rounded-md">
                    {r.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{r.reason}</p>
                {r.expiresAt && <p className="text-xs text-muted-foreground">Expires: {formatPlatformTimestamp(r.expiresAt)}</p>}
                <div className="flex gap-2 pt-2">
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleApprove(r.id)}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeny(r.id)}>Deny</Button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => handleEnd(r.id)}>End session</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
