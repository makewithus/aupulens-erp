"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAccountingSettings } from "./useAccountingSettings";

export function TdsSettingsPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const [enabled, setEnabled] = useState(false);
  const [defaultSectionCode, setDefaultSectionCode] = useState("");
  const [thresholdAmount, setThresholdAmount] = useState(0);

  useEffect(() => {
    if (settings?.tds) {
      setEnabled(settings.tds.enabled);
      setDefaultSectionCode(settings.tds.defaultSectionCode || "");
      setThresholdAmount(settings.tds.thresholdAmount);
    }
  }, [settings]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center space-x-2">
        <Checkbox id="tdsEnabled" checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />
        <label htmlFor="tdsEnabled" className="text-sm">
          Enable TDS deduction on eligible transactions
        </label>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default TDS Section</label>
        <Input value={defaultSectionCode} onChange={(e) => setDefaultSectionCode(e.target.value)} placeholder="194C" className="w-40" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Threshold Amount (₹)</label>
        <Input type="number" value={thresholdAmount} onChange={(e) => setThresholdAmount(Number(e.target.value) || 0)} className="w-40" />
        <p className="text-xs text-muted-foreground">TDS applies only when the transaction amount exceeds this threshold.</p>
      </div>
      <Button disabled={saving} onClick={() => save("tds", { enabled, defaultSectionCode, thresholdAmount })}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
