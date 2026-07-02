"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { TaxRatesPanel } from "@/components/finance/accounting/setup/TaxRatesPanel";

export default function Page() {
  return (
    <SetupPageShell title="Tax Rates" breadcrumbLabel="Tax Rates">
      <TaxRatesPanel type="gst" />
    </SetupPageShell>
  );
}
