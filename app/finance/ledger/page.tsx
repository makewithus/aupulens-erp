import { redirect } from "next/navigation";

// Superseded by the actively-maintained /finance/accounting/ledger, which
// is what the sidebar links to. This page was only reachable via the now
// also-redirected /finance/dashboard.
export default function FinanceLedgerRedirectPage() {
  redirect("/finance/accounting/ledger");
}
