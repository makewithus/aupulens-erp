"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const ALL_MODULES = ["admin", "finance", "sales", "inventory", "hr", "manufacturing", "crm"];

interface PlanDetail {
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  active: boolean;
  features: {
    modules: string[];
    maxUsers: number;
    maxCompanies: number;
    storageGb: number;
    apiRequestsPerMonth: number;
    aiCreditsPerMonth: number;
    aiRequestsPerMonth: number;
    automationRunsPerMonth: number;
    documentLimitPerMonth: number;
    supportLevel: string;
  };
  impact: { explicitlyAssigned: number; legacyTier: string | null; implicitlyBridged: number };
}

export default function EditPlanPage() {
  const params = useParams<{ key: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/platform/plans/${params.key}`)
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setPlan(body.data);
        else setError(body.message ?? "Failed to load plan.");
      })
      .catch(() => setError("Failed to load plan."));
  }, [params.key]);

  function updateField<K extends keyof PlanDetail>(field: K, value: PlanDetail[K]) {
    setPlan((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateFeature<K extends keyof PlanDetail["features"]>(
    field: K,
    value: PlanDetail["features"][K],
  ) {
    setPlan((prev) => (prev ? { ...prev, features: { ...prev.features, [field]: value } } : prev));
  }

  function toggleModule(moduleName: string) {
    if (!plan) return;
    const has = plan.features.modules.includes(moduleName);
    updateFeature(
      "modules",
      has ? plan.features.modules.filter((m) => m !== moduleName) : [...plan.features.modules, moduleName],
    );
  }

  const totalImpact = plan ? plan.impact.explicitlyAssigned + plan.impact.implicitlyBridged : 0;

  async function handleSave() {
    if (!plan || !reason.trim() || (totalImpact > 0 && !confirmed)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/plans/${plan.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: plan.name,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          active: plan.active,
          features: plan.features,
          reason,
        }),
      });
      const body = await res.json();
      if (!body.success) {
        toast.error(body.message ?? "Save failed.");
        return;
      }
      toast.success("Plan saved successfully.");
      router.push("/platform/plans");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !plan) return <p className="text-sm text-red-600">{error}</p>;
  if (!plan) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/platform/plans" prefetch={true}>
          <Button variant="ghost" size="sm" type="button">
            ← Back to plans
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Edit {plan.name}</h1>
        <p className="text-sm text-neutral-500">
          Editing a plan&apos;s configuration changes every organisation resolved to it at once.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {totalImpact > 0 && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            This change affects {totalImpact} organisation{totalImpact === 1 ? "" : "s"}:{" "}
            {plan.impact.explicitlyAssigned} explicitly assigned to this plan
            {plan.impact.legacyTier
              ? `, plus ${plan.impact.implicitlyBridged} on the legacy "${plan.impact.legacyTier}" tier defaulting to it`
              : ""}
            .
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={plan.name} onChange={(e) => updateField("name", e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={plan.description} onChange={(e) => updateField("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Price / month (₹)</Label>
              <Input
                type="number"
                value={plan.priceMonthly}
                onChange={(e) => updateField("priceMonthly", Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Price / year (₹)</Label>
              <Input
                type="number"
                value={plan.priceYearly}
                onChange={(e) => updateField("priceYearly", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={plan.active} onCheckedChange={(v) => updateField("active", Boolean(v))} />
            <Label className="font-normal">Active (assignable to an organisation)</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <NumField label="Max users" value={plan.features.maxUsers} onChange={(v) => updateFeature("maxUsers", v)} />
            <NumField
              label="Max companies"
              value={plan.features.maxCompanies}
              onChange={(v) => updateFeature("maxCompanies", v)}
            />
            <NumField label="Storage (GB)" value={plan.features.storageGb} onChange={(v) => updateFeature("storageGb", v)} />
            <NumField
              label="API requests / month"
              value={plan.features.apiRequestsPerMonth}
              onChange={(v) => updateFeature("apiRequestsPerMonth", v)}
            />
            <NumField
              label="AI credits / month"
              value={plan.features.aiCreditsPerMonth}
              onChange={(v) => updateFeature("aiCreditsPerMonth", v)}
            />
            <NumField
              label="AI requests / month"
              value={plan.features.aiRequestsPerMonth}
              onChange={(v) => updateFeature("aiRequestsPerMonth", v)}
            />
            <NumField
              label="Automation runs / month"
              value={plan.features.automationRunsPerMonth}
              onChange={(v) => updateFeature("automationRunsPerMonth", v)}
            />
            <NumField
              label="Document limit / month"
              value={plan.features.documentLimitPerMonth}
              onChange={(v) => updateFeature("documentLimitPerMonth", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modules</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {ALL_MODULES.map((m) => (
            <div key={m} className="flex items-center gap-2">
              <Checkbox
                checked={plan.features.modules.includes(m)}
                onCheckedChange={() => toggleModule(m)}
              />
              <Label className="font-normal capitalize">{m}</Label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confirm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Reason (required)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this plan changing?" />
          </div>
          {totalImpact > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(Boolean(v))} />
              <Label className="font-normal">
                I understand this changes {totalImpact} organisation{totalImpact === 1 ? "" : "s"} immediately.
              </Label>
            </div>
          )}
          <Button
            onClick={handleSave}
            disabled={submitting || !reason.trim() || (totalImpact > 0 && !confirmed)}
          >
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
