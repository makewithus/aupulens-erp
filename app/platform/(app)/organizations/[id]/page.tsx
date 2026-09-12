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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatInOrgTimezone, formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";

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
  const [accessGrant, setAccessGrant] = useState<{ active: boolean; adminName?: string; reason?: string; expiresAt?: string } | null>(null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideMaxUsers, setOverrideMaxUsers] = useState("");
  const [overrideMaxCompanies, setOverrideMaxCompanies] = useState("");
  const [overrideAiCredits, setOverrideAiCredits] = useState("");
  const [overrideModules, setOverrideModules] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [aiLimits, setAiLimits] = useState<{
    limit: {
      monthlyCreditsUsd: number | null;
      dailyCreditsUsd: number | null;
      maxRequestsPerMonth: number | null;
      maxTokensPerMonth: number | null;
      maxCostUsdPerMonth: number | null;
      atLimitBehavior: string;
    } | null;
    overage: {
      enabled: boolean;
      ratePerCreditUsd: number;
      softLimitUsd: number;
      hardLimitUsd: number;
      alertThresholds: number[];
    } | null;
  } | null>(null);
  const [aiLimitDialogOpen, setAiLimitDialogOpen] = useState(false);
  const [aiLimitForm, setAiLimitForm] = useState({
    monthlyCreditsUsd: "",
    dailyCreditsUsd: "",
    maxRequestsPerMonth: "",
    maxTokensPerMonth: "",
    maxCostUsdPerMonth: "",
    atLimitBehavior: "block",
  });
  const [overageForm, setOverageForm] = useState({
    enabled: false,
    ratePerCreditUsd: "",
    softLimitUsd: "",
    hardLimitUsd: "",
  });
  const [aiLimitReason, setAiLimitReason] = useState("");

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
    fetch(`/api/platform/organizations/${subdomain}/access-status`)
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setAccessGrant(body.data);
      });
  }, [subdomain]);

  useEffect(() => {
    if (!tabData[tab]) loadTab(tab);
    if (tab === "subscription") loadEntitlements();
    if (tab === "ai-usage") loadAiLimits();
  }, [tab]);

  async function loadAiLimits() {
    const res = await fetch(`/api/platform/organizations/${subdomain}/ai-limits`);
    const body = await res.json();
    if (body.success) setAiLimits(body.data);
  }

  function openAiLimitDialog() {
    const l = aiLimits?.limit;
    setAiLimitForm({
      monthlyCreditsUsd: l?.monthlyCreditsUsd != null ? String(l.monthlyCreditsUsd) : "",
      dailyCreditsUsd: l?.dailyCreditsUsd != null ? String(l.dailyCreditsUsd) : "",
      maxRequestsPerMonth: l?.maxRequestsPerMonth != null ? String(l.maxRequestsPerMonth) : "",
      maxTokensPerMonth: l?.maxTokensPerMonth != null ? String(l.maxTokensPerMonth) : "",
      maxCostUsdPerMonth: l?.maxCostUsdPerMonth != null ? String(l.maxCostUsdPerMonth) : "",
      atLimitBehavior: l?.atLimitBehavior ?? "block",
    });
    const o = aiLimits?.overage;
    setOverageForm({
      enabled: o?.enabled ?? false,
      ratePerCreditUsd: o?.ratePerCreditUsd != null ? String(o.ratePerCreditUsd) : "",
      softLimitUsd: o?.softLimitUsd != null ? String(o.softLimitUsd) : "",
      hardLimitUsd: o?.hardLimitUsd != null ? String(o.hardLimitUsd) : "",
    });
    setAiLimitReason("");
    setAiLimitDialogOpen(true);
  }

  async function handleSaveAiLimits() {
    setSubmitting(true);
    try {
      const num = (v: string) => (v.trim() ? Number(v) : null);
      const res = await fetch(`/api/platform/organizations/${subdomain}/ai-limits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: aiLimitReason,
          limit: {
            monthlyCreditsUsd: num(aiLimitForm.monthlyCreditsUsd),
            dailyCreditsUsd: num(aiLimitForm.dailyCreditsUsd),
            maxRequestsPerMonth: num(aiLimitForm.maxRequestsPerMonth),
            maxTokensPerMonth: num(aiLimitForm.maxTokensPerMonth),
            maxCostUsdPerMonth: num(aiLimitForm.maxCostUsdPerMonth),
            atLimitBehavior: aiLimitForm.atLimitBehavior,
          },
          overage: {
            enabled: overageForm.enabled,
            ratePerCreditUsd: overageForm.ratePerCreditUsd.trim() ? Number(overageForm.ratePerCreditUsd) : 0,
            softLimitUsd: overageForm.softLimitUsd.trim() ? Number(overageForm.softLimitUsd) : 0,
            hardLimitUsd: overageForm.hardLimitUsd.trim() ? Number(overageForm.hardLimitUsd) : 0,
          },
        }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to save AI limits.");
        return;
      }
      setAiLimitDialogOpen(false);
      await loadAiLimits();
    } finally {
      setSubmitting(false);
    }
  }

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

  function openOverrideDialog() {
    setOverrideMaxUsers(entitlements?.overrides?.maxUsers != null ? String(entitlements.overrides.maxUsers) : "");
    setOverrideMaxCompanies(
      entitlements?.overrides?.maxCompanies != null ? String(entitlements.overrides.maxCompanies) : "",
    );
    setOverrideAiCredits(
      entitlements?.overrides?.aiCreditsPerMonth != null ? String(entitlements.overrides.aiCreditsPerMonth) : "",
    );
    setOverrideModules((entitlements?.overrides?.modules ?? []).join(", "));
    setOverrideReason("");
    setOverrideDialogOpen(true);
  }

  async function handleSetOverride() {
    setSubmitting(true);
    try {
      const overrides: Record<string, unknown> = {};
      if (overrideMaxUsers.trim()) overrides.maxUsers = Number(overrideMaxUsers);
      if (overrideMaxCompanies.trim()) overrides.maxCompanies = Number(overrideMaxCompanies);
      if (overrideAiCredits.trim()) overrides.aiCreditsPerMonth = Number(overrideAiCredits);
      if (overrideModules.trim()) {
        overrides.modules = overrideModules.split(",").map((m) => m.trim()).filter(Boolean);
      }
      const res = await fetch(`/api/platform/organizations/${subdomain}/entitlement-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides, reason: overrideReason }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to set override.");
        return;
      }
      setOverrideDialogOpen(false);
      await loadEntitlements();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearOverride() {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/platform/organizations/${subdomain}/entitlement-override?reason=${encodeURIComponent(
          "cleared from Subscription tab",
        )}`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to clear override.");
        return;
      }
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
              <Badge
                variant={
                  overview.status === "suspended" || overview.status === "payment_hold"
                    ? "destructive"
                    : "secondary"
                }
              >
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

      {overview?.planAssignmentPending && (
        <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm">
          <p className="font-medium text-red-800 dark:text-red-200">
            Plan not assigned — the initial plan assignment attempted at creation failed.
          </p>
          <p className="text-xs text-red-700 dark:text-red-300">
            This organisation resolves entitlements via the legacy tier fallback in the meantime.
            Assign a plan from the Subscription tab to resolve this.
          </p>
        </div>
      )}

      {accessGrant?.active && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Elevated access session active — {accessGrant.adminName} ({accessGrant.reason})
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Expires {accessGrant.expiresAt ? formatPlatformTimestamp(accessGrant.expiresAt) : "—"}
          </p>
        </div>
      )}

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
                <Field label="Tax jurisdiction" value={overview.settings?.taxJurisdiction ?? "—"} />
                <Field label="Enabled modules" value={(overview.settings?.enabledModules ?? []).join(", ") || "—"} />
                <Field label="Created" value={formatInOrgTimezone(overview.createdAt, overview.settings?.timezone)} />
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Custom override (source doc §11)</CardTitle>
              <div className="flex gap-2">
                {entitlements?.overrides && (
                  <Button size="sm" variant="ghost" disabled={submitting} onClick={handleClearOverride}>
                    Clear override
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={openOverrideDialog} disabled={!entitlements}>
                  {entitlements?.overrides ? "Edit override" : "Add override"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-sm">
              {entitlements?.overrides ? (
                <div className="grid grid-cols-2 gap-4">
                  {entitlements.overrides.maxUsers != null && (
                    <Field label="Max users (override)" value={entitlements.overrides.maxUsers} />
                  )}
                  {entitlements.overrides.maxCompanies != null && (
                    <Field label="Max companies (override)" value={entitlements.overrides.maxCompanies} />
                  )}
                  {entitlements.overrides.aiCreditsPerMonth != null && (
                    <Field label="AI credits/mo (override)" value={entitlements.overrides.aiCreditsPerMonth} />
                  )}
                  {entitlements.overrides.modules && (
                    <Field label="Modules (override)" value={entitlements.overrides.modules.join(", ")} />
                  )}
                </div>
              ) : (
                <p className="text-neutral-500">
                  No custom override — this organisation resolves entirely from its base plan
                  ({entitlements ? PLAN_KEY_LABELS[entitlements.planKey as keyof typeof PLAN_KEY_LABELS] : "—"}).
                </p>
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
              <p className="text-xs text-neutral-400 italic">
                {(tabData.activity as any)?.moduleFilterNote}
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
                {(tabData["ai-usage"] as any).dataSource === "live" && (
                  <CardContent className="pt-0">
                    <p className="text-xs text-amber-600">
                      Computed live from raw usage records — the scheduled rollup hasn&apos;t run
                      recently (see the Scheduled Jobs panel on the main dashboard).
                    </p>
                  </CardContent>
                )}
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">AI limits &amp; overage (source doc §15/§16)</CardTitle>
              <Button size="sm" variant="outline" onClick={openAiLimitDialog}>
                Configure
              </Button>
            </CardHeader>
            <CardContent className="text-sm space-y-4">
              {aiLimits?.limit ? (
                <div className="grid grid-cols-2 gap-4">
                  {aiLimits.limit.monthlyCreditsUsd != null && (
                    <Field label="Monthly credits (₹)" value={aiLimits.limit.monthlyCreditsUsd} />
                  )}
                  {aiLimits.limit.dailyCreditsUsd != null && (
                    <Field label="Daily credits (₹)" value={aiLimits.limit.dailyCreditsUsd} />
                  )}
                  {aiLimits.limit.maxRequestsPerMonth != null && (
                    <Field label="Max requests/mo" value={aiLimits.limit.maxRequestsPerMonth} />
                  )}
                  {aiLimits.limit.maxTokensPerMonth != null && (
                    <Field label="Max tokens/mo" value={aiLimits.limit.maxTokensPerMonth} />
                  )}
                  {aiLimits.limit.maxCostUsdPerMonth != null && (
                    <Field label="Max cost/mo (₹)" value={aiLimits.limit.maxCostUsdPerMonth} />
                  )}
                  <Field label="At-limit behaviour" value={aiLimits.limit.atLimitBehavior} />
                </div>
              ) : (
                <p className="text-neutral-500">
                  No custom limit row — this organisation is governed only by its plan&apos;s tier cap
                  (default behaviour: BLOCK once exhausted).
                </p>
              )}
              <div className="border-t pt-3">
                {aiLimits?.overage?.enabled ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Overage" value="Enabled" />
                    <Field label="Rate / credit (₹)" value={aiLimits.overage.ratePerCreditUsd} />
                    <Field label="Soft limit (₹)" value={aiLimits.overage.softLimitUsd} />
                    <Field label="Hard limit (₹)" value={aiLimits.overage.hardLimitUsd} />
                  </div>
                ) : (
                  <p className="text-neutral-500">Overage is not enabled for this organisation.</p>
                )}
              </div>
            </CardContent>
          </Card>
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

      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom entitlement override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              Leave a field blank to leave it un-overridden — it will keep resolving from the base
              plan ({entitlements ? PLAN_KEY_LABELS[entitlements.planKey as keyof typeof PLAN_KEY_LABELS] : "—"}).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Max users</Label>
                <Input value={overrideMaxUsers} onChange={(e) => setOverrideMaxUsers(e.target.value)} placeholder="e.g. 999999 for unlimited" />
              </div>
              <div className="space-y-1">
                <Label>Max companies</Label>
                <Input value={overrideMaxCompanies} onChange={(e) => setOverrideMaxCompanies(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>AI credits / month</Label>
                <Input value={overrideAiCredits} onChange={(e) => setOverrideAiCredits(e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Modules (comma-separated, replaces the base plan&apos;s list)</Label>
                <Input value={overrideModules} onChange={(e) => setOverrideModules(e.target.value)} placeholder="admin, finance, sales" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason (required, audited)</Label>
              <Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!overrideReason.trim() || submitting} onClick={handleSetOverride}>
              {submitting ? "Saving…" : "Save override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiLimitDialogOpen} onOpenChange={setAiLimitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI limits &amp; overage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <p className="text-xs text-neutral-500">Leave a field blank to leave it un-set (governed by the plan&apos;s tier cap).</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Monthly credits (₹)</Label>
                <Input value={aiLimitForm.monthlyCreditsUsd} onChange={(e) => setAiLimitForm((f) => ({ ...f, monthlyCreditsUsd: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Daily credits (₹)</Label>
                <Input value={aiLimitForm.dailyCreditsUsd} onChange={(e) => setAiLimitForm((f) => ({ ...f, dailyCreditsUsd: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Max requests / month</Label>
                <Input value={aiLimitForm.maxRequestsPerMonth} onChange={(e) => setAiLimitForm((f) => ({ ...f, maxRequestsPerMonth: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Max tokens / month</Label>
                <Input value={aiLimitForm.maxTokensPerMonth} onChange={(e) => setAiLimitForm((f) => ({ ...f, maxTokensPerMonth: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Max cost / month (₹)</Label>
                <Input value={aiLimitForm.maxCostUsdPerMonth} onChange={(e) => setAiLimitForm((f) => ({ ...f, maxCostUsdPerMonth: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>At-limit behaviour</Label>
                <Select value={aiLimitForm.atLimitBehavior} onValueChange={(v) => setAiLimitForm((f) => ({ ...f, atLimitBehavior: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Block</SelectItem>
                    <SelectItem value="throttle">Throttle</SelectItem>
                    <SelectItem value="allow_with_overage">Allow with overage</SelectItem>
                    <SelectItem value="allow_and_log">Allow and log</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={overageForm.enabled} onCheckedChange={(v) => setOverageForm((f) => ({ ...f, enabled: Boolean(v) }))} />
                <Label className="font-normal">Overage enabled</Label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Rate / credit (₹)</Label>
                  <Input value={overageForm.ratePerCreditUsd} onChange={(e) => setOverageForm((f) => ({ ...f, ratePerCreditUsd: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Soft limit (₹)</Label>
                  <Input value={overageForm.softLimitUsd} onChange={(e) => setOverageForm((f) => ({ ...f, softLimitUsd: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Hard limit (₹)</Label>
                  <Input value={overageForm.hardLimitUsd} onChange={(e) => setOverageForm((f) => ({ ...f, hardLimitUsd: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Reason (required, audited)</Label>
              <Textarea value={aiLimitReason} onChange={(e) => setAiLimitReason(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiLimitDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!aiLimitReason.trim() || submitting} onClick={handleSaveAiLimits}>
              {submitting ? "Saving…" : "Save"}
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
