import { redirect } from "next/navigation";

// Superseded by the actively-maintained /finance/accounting/bank-reconciliation,
// which is what the sidebar links to. This page was only reachable via the
// now also-redirected /finance/dashboard.
export default function FinanceReconciliationRedirectPage() {
  redirect("/finance/accounting/bank-reconciliation");
}
