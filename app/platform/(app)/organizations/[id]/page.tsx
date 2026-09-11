"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ORGANIZATION_STATUS_LABELS,
  ORGANIZATION_STATUS_TRANSITIONS,
  ORGANIZATION_TYPE_LABELS,
  OrganizationStatus,
} from "@/lib/constants/statuses";

const TABS = ["overview", "users", "subscription", "activity", "audit", "ai-usage", "billing"] as const;

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const subdomain = params.id;

  const [tab, setTab] = useState<(typeof TABS)[number]>("overview");
  const [overview, setOverview] = useState<any>(null);
  const [tabData, setTabData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadTab(t: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/organizations/${subdomain}?tab=${t}`);
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to load.");
        return;
      }
      if (t === "overview") setOverview(body.data);
      setTabData((prev) => ({ ...prev, [t]: body.data }));
    } catch {
      setError("Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTab("overview");
  }, [subdomain]);

  useEffect(() => {
    if (!tabData[tab]) loadTab(tab);
  }, [tab]);

  async function handleStatusChange() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/platform/organizations/${subdomain}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus, reason }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Status change failed.");
        return;
      }
      setStatusDialogOpen(false);
      setReason("");
      await loadTab("overview");
    } finally {
      setSubmitting(false);
    }
  }

  const availableTransitions = overview
    ? ORGANIZATION_STATUS_TRANSITIONS[overview.status as OrganizationStatus] ?? []
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/platform/organizations")}>
            ← Back to organisations
          </Button>
          <h1 className="text-2xl font-semibold mt-1">{overview?.name ?? subdomain}</h1>
          {overview && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={overview.status === "suspended" ? "destructive" : "secondary"}>
                {ORGANIZATION_STATUS_LABELS[overview.status as OrganizationStatus]}
              </Badge>
              <span className="text-sm text-neutral-500">{overview.subdomain}</span>
            </div>
          )}
        </div>
        {availableTransitions.length > 0 && (
          <Button variant="outline" onClick={() => setStatusDialogOpen(true)}>
            Change status
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="ai-usage">AI Usage</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {overview && (
            <Card>
              <CardContent className="pt-6 grid grid-cols-2 gap-4 text-sm">
                <Field label="Type" value={overview.organizationType ? ORGANIZATION_TYPE_LABELS[overview.organizationType] : "—"} />
                <Field label="Tier" value={overview.tier} />
                <Field label="Max users" value={overview.maxUsers} />
                <Field label="AI calls / month" value={overview.aiCallsPerMonth} />
                <Field label="Country" value={overview.settings?.country ?? "—"} />
                <Field label="Currency" value={overview.settings?.currency ?? "—"} />
                <Field label="Enabled modules" value={(overview.settings?.enabledModules ?? []).join(", ") || "—"} />
                <Field label="Created" value={new Date(overview.createdAt).toLocaleString()} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="users">
          <SimpleTable
            rows={(tabData.users as any[]) ?? []}
            columns={["name", "email", "role", "status"]}
            loading={loading && tab === "users"}
          />
        </TabsContent>

        <TabsContent value="subscription">
          <SimpleTable
            rows={(tabData.subscription as any[]) ?? []}
            columns={["type", "tier", "occurredAt"]}
            loading={loading && tab === "subscription"}
          />
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-6 space-y-2">
              <p className="text-xs text-neutral-400 italic">
                {(tabData.activity as any)?.definitionNote}
              </p>
              <SimpleTable
                rows={(tabData.activity as any)?.entries ?? []}
                columns={["activity", "userName", "timestamp"]}
                loading={loading && tab === "activity"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <SimpleTable
            rows={(tabData.audit as any[]) ?? []}
            columns={["eventType", "severity", "actorRole", "createdAt"]}
            loading={loading && tab === "audit"}
          />
        </TabsContent>

        <TabsContent value="ai-usage">
          <EmptyStateCard data={tabData["ai-usage"] as any} />
        </TabsContent>

        <TabsContent value="billing">
          <EmptyStateCard data={tabData.billing as any} />
        </TabsContent>
      </Tabs>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change organisation status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>New status</Label>
              <Select value={targetStatus} onValueChange={setTargetStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a status" />
                </SelectTrigger>
                <SelectContent>
                  {availableTransitions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORGANIZATION_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason (required, audited)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!targetStatus || !reason.trim() || submitting} onClick={handleStatusChange}>
              {submitting ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function SimpleTable({
  rows,
  columns,
  loading,
}: {
  rows: any[];
  columns: string[];
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-neutral-500 py-4">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-neutral-500 py-4">No records.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            {columns.map((c) => (
              <th key={c} className="py-2 pr-4 font-medium capitalize">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {columns.map((c) => (
                <td key={c} className="py-2 pr-4">
                  {typeof row[c] === "object" ? JSON.stringify(row[c]) : String(row[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyStateCard({ data }: { data?: { available: boolean; reason: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-neutral-500">Not yet available</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-400 italic">{data?.reason ?? "Loading…"}</p>
      </CardContent>
    </Card>
  );
}
