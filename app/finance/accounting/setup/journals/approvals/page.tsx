"use client";

import { SetupPageShell } from "@/components/finance/accounting/setup/SetupPageShell";
import { ApprovalsPanel } from "@/components/finance/accounting/setup/ApprovalsPanel";

export default function Page() {
  return (
    <SetupPageShell title="Journals – Approvals" breadcrumbLabel="Journals – Approvals">
      <ApprovalsPanel />
    </SetupPageShell>
  );
}
