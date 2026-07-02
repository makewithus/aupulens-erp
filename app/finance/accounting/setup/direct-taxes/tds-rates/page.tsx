"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { TaxRatesPanel } from "@/components/finance/accounting/setup/TaxRatesPanel";

export default function Page() {
  return (
    <SetupPageShell title="Income TDS Rates" breadcrumbLabel="Income TDS Rates">
      <TaxRatesPanel type="tds" />
    </SetupPageShell>
  );
}
