"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { AccountMappingPanel } from "@/components/finance/accounting/setup/AccountMappingPanel";

export default function Page() {
  return (
    <SetupPageShell title="Account Mapping" breadcrumbLabel="Account Mapping" description="Map default accounts used across the accounting module.">
      <AccountMappingPanel />
    </SetupPageShell>
  );
}
