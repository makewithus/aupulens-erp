import { redirect } from "next/navigation";

// The Sales module has exactly one entry point: the tabbed interface
// (Customers | Quotes | Subscriptions | Sales Orders | Invoices | Payments),
// defaulting to Customers — no intermediate list/landing page.
export default function SalesPage() {
  redirect("/sales/customers");
}
