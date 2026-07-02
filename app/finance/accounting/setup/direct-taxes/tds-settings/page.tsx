"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { TdsSettingsPanel } from "@/components/finance/accounting/setup/TdsSettingsPanel";

export default function Page() {
  return (
    <SetupPageShell title="Income TDS Settings" breadcrumbLabel="Income TDS Settings">
      <TdsSettingsPanel />
    </SetupPageShell>
  );
}
