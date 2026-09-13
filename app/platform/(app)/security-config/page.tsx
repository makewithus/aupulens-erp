"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeToConfirm } from "@/components/platform/TypeToConfirm";

interface SecurityConfig {
  alerts: {
    failedLoginThreshold: number;
    permissionFailureThreshold: number;
    permissionFailureWindowMinutes: number;
    largeDowngradeTierDrop: number;
    aiCostSpikeMultiplier: number;
    aiCostSpikeTrailingDays: number;
    massExportRecordThreshold: number;
  };
  sessionTimeoutHours: number;
  retention: { policyCount: number; manageUrl: string };
  autonomyGovernance: { available: false; reason: string };
}

/**
 * Phase 11 Part 1.6 (user decision, this session): "scoped to what exists —
 * PlatformAlertConfig thresholds, retention policies (extend the existing
 * UI rather than a second one), session timeout, and the kill-switch/
 * autonomy settings if they belong here." A concrete editor over the real
 * configuration objects, not an open-ended settings page.
 */
export default function SecurityConfigPage() {
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<SecurityConfig["alerts"] & { sessionTimeoutHours: number }>({
    failedLoginThreshold: 5,
    permissionFailureThreshold: 10,
    permissionFailureWindowMinutes: 60,
    largeDowngradeTierDrop: 2,
    aiCostSpikeMultiplier: 3,
    aiCostSpikeTrailingDays: 7,
    massExportRecordThreshold: 1000,
    sessionTimeoutHours: 8,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/platform/security-config");
      const body = await res.json();
      if (body.success) {
        setConfig(body.data);
        setForm({ ...body.data.alerts, sessionTimeoutHours: body.data.sessionTimeoutHours });
      } else {
        setError(body.message ?? "Failed to load security configuration.");
      }
    } catch {
      setError("Failed to load security configuration.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSubmitting(true);
    try {
      const { sessionTimeoutHours, ...alerts } = form;
      const res = await fetch("/api/platform/security-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts, sessionTimeoutHours, reason }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to save.");
        return;
      }
      setConfirmOpen(false);
      setReason("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const num = (v: number) => (Number.isFinite(v) ? v : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security Configuration</h1>
        <p className="text-sm text-neutral-500">
          Alert thresholds and session policy. GLOBAL_SUPER_ADMIN only, every change confirmed and
          audited.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-red-600">{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {!config && !error && <p className="text-sm text-neutral-500">Loading…</p>}

      {config && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session policy</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 max-w-md">
              <div className="space-y-1">
                <Label>Session timeout (hours)</Label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={form.sessionTimeoutHours}
                  onChange={(e) => setForm((f) => ({ ...f, sessionTimeoutHours: num(Number(e.target.value)) }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alert thresholds (source doc §28)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Failed login threshold</Label>
                <Input type="number" min={1} value={form.failedLoginThreshold} onChange={(e) => setForm((f) => ({ ...f, failedLoginThreshold: num(Number(e.target.value)) }))} />
              </div>
              <div className="space-y-1">
                <Label>Permission failure threshold</Label>
                <Input type="number" min={1} value={form.permissionFailureThreshold} onChange={(e) => setForm((f) => ({ ...f, permissionFailureThreshold: num(Number(e.target.value)) }))} />
              </div>
              <div className="space-y-1">
                <Label>Permission failure window (minutes)</Label>
                <Input type="number" min={1} value={form.permissionFailureWindowMinutes} onChange={(e) => setForm((f) => ({ ...f, permissionFailureWindowMinutes: num(Number(e.target.value)) }))} />
              </div>
              <div className="space-y-1">
                <Label>Large downgrade tier drop</Label>
                <Input type="number" min={1} value={form.largeDowngradeTierDrop} onChange={(e) => setForm((f) => ({ ...f, largeDowngradeTierDrop: num(Number(e.target.value)) }))} />
              </div>
              <div className="space-y-1">
                <Label>AI cost spike multiplier</Label>
                <Input type="number" min={1} step={0.1} value={form.aiCostSpikeMultiplier} onChange={(e) => setForm((f) => ({ ...f, aiCostSpikeMultiplier: num(Number(e.target.value)) }))} />
              </div>
              <div className="space-y-1">
                <Label>AI cost spike trailing days</Label>
                <Input type="number" min={1} value={form.aiCostSpikeTrailingDays} onChange={(e) => setForm((f) => ({ ...f, aiCostSpikeTrailingDays: num(Number(e.target.value)) }))} />
              </div>
              <div className="space-y-1">
                <Label>Mass export record threshold</Label>
                <Input type="number" min={1} value={form.massExportRecordThreshold} onChange={(e) => setForm((f) => ({ ...f, massExportRecordThreshold: num(Number(e.target.value)) }))} />
              </div>
            </CardContent>
          </Card>

          <div>
            <Button onClick={() => setConfirmOpen(true)}>Save changes</Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Retention policies</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-neutral-500">
                {config.retention.policyCount} polic{config.retention.policyCount === 1 ? "y" : "ies"} configured.
                Managed on its own dedicated page, not duplicated here.
              </p>
              <Link href={config.retention.manageUrl} className="text-sm underline">
                Manage retention policies →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-neutral-500">AI workflow kill-switch / autonomy governance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-neutral-400 italic">{config.autonomyGovernance.reason}</p>
            </CardContent>
          </Card>
        </>
      )}

      <TypeToConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save security configuration"
        consequence="This changes platform-wide alert thresholds and/or the admin session timeout, effective for every future admin login and every alert check from now on."
        confirmText="SAVE"
        reason={reason}
        onReasonChange={setReason}
        submitting={submitting}
        confirmLabel="Save"
        onConfirm={handleSave}
      />
    </div>
  );
}
