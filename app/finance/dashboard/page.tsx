import { redirect } from "next/navigation";

// Superseded by /finance/summary, the sidebar's actual "Dashboard" entry.
// This page was never linked from anywhere in the app and its own links
// to /finance/reports and /finance/tax pointed at routes that don't exist.
export default function FinanceDashboardRedirectPage() {
  redirect("/finance/summary");
}
