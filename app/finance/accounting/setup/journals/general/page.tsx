"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { JournalsGeneralPanel } from "@/components/finance/accounting/setup/GeneralPanel";

export default function Page() {
  return (
    <SetupPageShell title="Journals – General" breadcrumbLabel="Journals – General">
      <JournalsGeneralPanel />
    </SetupPageShell>
  );
}
