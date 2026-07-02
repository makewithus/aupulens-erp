"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { CustomFieldsPanel } from "@/components/finance/accounting/setup/CustomFieldsPanel";

export default function Page() {
  return (
    <SetupPageShell title="Journals – Custom Fields" breadcrumbLabel="Journals – Custom Fields">
      <CustomFieldsPanel appliesTo="journal" />
    </SetupPageShell>
  );
}
