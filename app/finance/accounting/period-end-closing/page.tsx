"use client";

import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";
import { BookLock, CheckCircle2 } from "lucide-react";

const BENEFITS = [
  "Track and complete checklists.",
  "Lock accounting periods to prevent unauthorised modifications.",
  "Complete account reconciliation.",
  "Ensure your books are ready for reporting and audits.",
];

export default function PeriodEndClosingPage() {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Financial Closure"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "Accounting" }, { label: "Period End Closing" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <AccountingSubNav />

        <div className="flex flex-col items-center text-center py-12 space-y-4">
          <div className="h-20 w-20 rounded-full bg-blue-600/10 flex items-center justify-center">
            <BookLock className="h-10 w-10 text-blue-600" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Financial Closure</h1>
            <span className="text-xs font-semibold bg-green-600/15 text-green-600 px-2.5 py-1 rounded-full">Coming Soon</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Simplify financial closure by reconciling accounts, reviewing transactions, verifying reports, and locking periods to keep
            your books accurate and audit-ready.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground mb-4">KEY BENEFITS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span className="text-sm">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
