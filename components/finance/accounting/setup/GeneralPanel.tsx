"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAccountingSettings } from "./useAccountingSettings";

export function ChartOfAccountsGeneralPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [codeLength, setCodeLength] = useState(4);

  useEffect(() => {
    if (settings?.chartOfAccounts) {
      setAutoGenerate(settings.chartOfAccounts.autoGenerateAccountCode);
      setCodeLength(settings.chartOfAccounts.defaultAccountCodeLength);
    }
  }, [settings]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center space-x-2">
        <Checkbox id="autoGen" checked={autoGenerate} onCheckedChange={(v) => setAutoGenerate(!!v)} />
        <label htmlFor="autoGen" className="text-sm">
          Automatically generate account codes for new accounts
        </label>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default Account Code Length</label>
        <Input type="number" min={2} max={10} value={codeLength} onChange={(e) => setCodeLength(Number(e.target.value) || 4)} className="w-32" />
      </div>
      <Button
        disabled={saving}
        onClick={() => save("chartOfAccounts", { autoGenerateAccountCode: autoGenerate, defaultAccountCodeLength: codeLength })}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

export function JournalsGeneralPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const [prefix, setPrefix] = useState("JNL");
  const [allowBackdated, setAllowBackdated] = useState(true);

  useEffect(() => {
    if (settings?.journals) {
      setPrefix(settings.journals.defaultJournalPrefix);
      setAllowBackdated(settings.journals.allowBackdatedEntries);
    }
  }, [settings]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 max-w-md">
      <div className="space-y-2">
        <label className="text-sm font-medium">Default Journal Number Prefix</label>
        <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-40" />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="backdated" checked={allowBackdated} onCheckedChange={(v) => setAllowBackdated(!!v)} />
        <label htmlFor="backdated" className="text-sm">
          Allow back-dated journal entries
        </label>
      </div>
      <Button disabled={saving} onClick={() => save("journals", { defaultJournalPrefix: prefix, allowBackdatedEntries: allowBackdated })}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
