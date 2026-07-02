"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { TaxSettingsPanel } from "@/components/finance/accounting/setup/TaxSettingsPanel";

export default function Page() {
  return (
    <SetupPageShell title="Tax Settings" breadcrumbLabel="Tax Settings">
      <TaxSettingsPanel />
    </SetupPageShell>
  );
}
