"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { CustomFieldsPanel } from "@/components/finance/accounting/setup/CustomFieldsPanel";

export default function Page() {
  return (
    <SetupPageShell title="Chart of Accounts – Custom Fields" breadcrumbLabel="Chart of Accounts – Custom Fields">
      <CustomFieldsPanel appliesTo="account" />
    </SetupPageShell>
  );
}
