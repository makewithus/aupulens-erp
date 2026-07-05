import { redirect } from "next/navigation";

// Accounting's entry point is the Chart of Accounts view directly — no
// intermediate list of links (mirrors the same fix applied to /sales).
export default function AccountingPage() {
  redirect("/finance/accounting/chart-of-accounts");
}
