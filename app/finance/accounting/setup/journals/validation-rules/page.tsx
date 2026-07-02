"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { ValidationRulesPanel } from "@/components/finance/accounting/setup/ValidationRulesPanel";

export default function Page() {
  return (
    <SetupPageShell title="Journals – Validation Rules" breadcrumbLabel="Journals – Validation Rules">
      <ValidationRulesPanel />
    </SetupPageShell>
  );
}
