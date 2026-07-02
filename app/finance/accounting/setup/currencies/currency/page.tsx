"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { CurrencyPanel } from "@/components/finance/accounting/setup/CurrencyPanel";

export default function Page() {
  return (
    <SetupPageShell title="Currency" breadcrumbLabel="Currency">
      <CurrencyPanel />
    </SetupPageShell>
  );
}
