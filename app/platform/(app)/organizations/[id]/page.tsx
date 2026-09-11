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
  PLAN_KEY_LABELS,
  PLAN_KEY_VALUES,
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
  const [entitlements, setEntitlements] = useState<any>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [targetPlan, setTargetPlan] = useState<string>("");
  const [planReason, setPlanReason] = useState("");

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
    if (tab === "subscription") loadEntitlements();
  }, [tab]);

  async function loadEntitlements() {
    const res = await fetch(`/api/platform/organizations/${subdomain}/plan`);
    const body = await res.json();
    if (body.success) setEntitlements(body.data);
  }

  async function handleAssignPlan() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/platform/organizations/${subdomain}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: targetPlan, reason: planReason, effective: "immediately" }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Plan assignment failed.");
        return;
      }
      setPlanDialogOpen(false);
      setPlanReason("");
      await loadEntitlements();
    } finally {
      setSubmitting(false);
    }
  }

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

        <TabsContent value="subscription" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Current plan</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setPlanDialogOpen(true)}>
                Assign plan
              </Button>
            </CardHeader>
            <CardContent className="text-sm">
              {entitlements ? (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Plan" value={PLAN_KEY_LABELS[entitlements.planKey as keyof typeof PLAN_KEY_LABELS]} />
                  <Field label="Source" value={entitlements.source} />
                  <Field label="Max users" value={entitlements.limits.maxUsers} />
                  <Field label="AI credits / month" value={entitlements.limits.aiCreditsPerMonth} />
                  <Field label="Modules" value={entitlements.modules.join(", ")} />
                </div>
              ) : (
                <p className="text-neutral-500">Loading…</p>
              )}
            </CardContent>
          </Card>
          <div>
            <p className="text-sm font-medium mb-2">History</p>
            <SimpleTable
              rows={(tabData.subscription as any[]) ?? []}
              columns={["type", "tier", "occurredAt"]}
              loading={loading && tab === "subscription"}
            />
          </div>
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

        <TabsContent value="ai-usage" className="space-y-4">
          {loading && tab === "ai-usage" && <p className="text-sm text-neutral-500 py-4">Loading…</p>}
          {tabData["ai-usage"] && (
            <>
              <Card>
                <CardContent className="pt-6 grid grid-cols-2 gap-4 text-sm">
                  <Field label="Plan" value={(tabData["ai-usage"] as any).planKey} />
                  <Field label="Monthly allocation" value={(tabData["ai-usage"] as any).allocation} />
                  <Field label="Used" value={(tabData["ai-usage"] as any).used} />
                  <Field label="Remaining" value={(tabData["ai-usage"] as any).remaining} />
                </CardContent>
              </Card>
              <div>
                <p className="text-sm font-medium mb-2">Feature breakdown (this month)</p>
                <SimpleTable
                  rows={(tabData["ai-usage"] as any).featureBreakdown}
                  columns={["feature", "requestCount", "inputTokens", "outputTokens", "estimatedCostUsd", "errorCount"]}
                  loading={false}
                />
              </div>
            </>
          )}
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

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>New plan</Label>
              <Select value={targetPlan} onValueChange={setTargetPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_KEY_VALUES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {PLAN_KEY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason (required, audited)</Label>
              <Textarea value={planReason} onChange={(e) => setPlanReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!targetPlan || !planReason.trim() || submitting} onClick={handleAssignPlan}>
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
