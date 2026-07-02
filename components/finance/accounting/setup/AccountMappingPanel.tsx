"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountPicker, type PickerAccount } from "@/components/finance/accounting/AccountPicker";
import { useAccountingSettings } from "./useAccountingSettings";

const FIELDS: { key: string; label: string }[] = [
  { key: "defaultReceivableAccountId", label: "Default Receivable Account" },
  { key: "defaultPayableAccountId", label: "Default Payable Account" },
  { key: "roundingAccountId", label: "Rounding Account" },
  { key: "defaultBankAccountId", label: "Default Bank Account" },
  { key: "defaultCashAccountId", label: "Default Cash Account" },
];

export function AccountMappingPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const [accounts, setAccounts] = useState<PickerAccount[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/finance/accounting/accounts?view=active")
      .then((r) => r.json())
      .then((d) => setAccounts((d.accounts || []).map((a: any) => ({ _id: a._id, accountName: a.accountName, accountCode: a.accountCode }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (settings?.chartOfAccounts) {
      const m: Record<string, string> = {};
      for (const f of FIELDS) {
        const v = settings.chartOfAccounts[f.key];
        if (v) m[f.key] = typeof v === "string" ? v : v._id;
      }
      setMapping(m);
    }
  }, [settings]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 max-w-md">
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-2">
          <label className="text-sm font-medium">{f.label}</label>
          <AccountPicker
            accounts={accounts}
            value={mapping[f.key]}
            onChange={(id) => setMapping({ ...mapping, [f.key]: id })}
            placeholder="Select an account"
          />
        </div>
      ))}
      <Button disabled={saving} onClick={() => save("chartOfAccounts", mapping)}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
