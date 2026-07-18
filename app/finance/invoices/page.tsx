import { redirect } from "next/navigation";

// Superseded by /sales/invoices, the actively-developed customer-invoice
// experience built during the Sales Module Revamp (numbering, prefixes,
// payments integration, e-invoicing, PDF templates). This page was an
// older, parallel "out_invoice" CRUD (models/Invoice.ts via
// /api/accounting/invoices) that was never reconciled with it - a real
// duplicate, not a different feature. Note: /finance/bills (in_invoice)
// and /finance/receivables both still legitimately use the same
// underlying Invoice model/API and are untouched by this redirect.
export default function FinanceInvoicesRedirectPage() {
  redirect("/sales/invoices");
}
