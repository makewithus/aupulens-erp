"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { ChartOfAccountsGeneralPanel } from "@/components/finance/accounting/setup/GeneralPanel";

export default function Page() {
  return (
    <SetupPageShell title="Chart of Accounts – General" breadcrumbLabel="Chart of Accounts – General">
      <ChartOfAccountsGeneralPanel />
    </SetupPageShell>
  );
}
