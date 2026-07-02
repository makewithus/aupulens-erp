"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccountingSettings } from "./useAccountingSettings";
import { useAccountingCurrencyStore } from "@/store/useAccountingCurrencyStore";

const APPROVER_ROLES = ["finance", "admin"];

export function ApprovalsPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const { baseCurrencySymbol, fetchCurrency } = useAccountingCurrencyStore();
  useEffect(() => {
    fetchCurrency();
  }, [fetchCurrency]);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(0);
  const [approverRole, setApproverRole] = useState("finance");

  useEffect(() => {
    if (settings?.journals) {
      setEnabled(settings.journals.approvalsEnabled);
      setThreshold(settings.journals.approvalThresholdAmount);
      setApproverRole(settings.journals.approverRole);
    }
  }, [settings]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center space-x-2">
        <Checkbox id="approvalsEnabled" checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />
        <label htmlFor="approvalsEnabled" className="text-sm">
          Require approval before journal entries can be posted
        </label>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Approval Threshold Amount ({baseCurrencySymbol})</label>
        <Input type="number" min={0} value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)} className="w-40" />
        <p className="text-xs text-muted-foreground">Entries at or above this amount require approval. Set to 0 to require approval on all entries.</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Approver Role</label>
        <Select value={approverRole} onValueChange={setApproverRole}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPROVER_ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        disabled={saving}
        onClick={() => save("journals", { approvalsEnabled: enabled, approvalThresholdAmount: threshold, approverRole })}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
