# Sales Invoice — Seed Data & Verification Guide

This documents the seeded demo data for the Sales → Invoices feature and how to verify
the feature end to end when you can't drive a live browser session.

## Tenant

All seed data below lives on **`default-tenant`** (Organization "Aupulens Corporate HQ").
That is the tenant with pre-existing demo customers/products from earlier sessions, so
the invoice seed reuses them rather than creating a parallel demo tenant.

## How to (re)seed

```bash
npm run seed:invoices
# equivalent to: npx tsx scripts/seed-invoices.ts
```

Requires `MONGODB_URI` in `.env` (same one the app uses). The script is idempotent for
setup steps (bank accounts, signature, coupon, customers, prefix normalization) and
**destructive only for `SalesInvoice` documents on `default-tenant`** — it deletes all
existing invoices for that tenant and recreates the 10 below. It does not touch any
other tenant's invoices.

What it does, in order:
1. Sets `Organization.settings.state/gstin/addressLine1/2` for `default-tenant` to a
   Maharashtra-based seller profile (needed so CGST/SGST-vs-IGST has a seller state to
   compare against).
2. Calls `ensureDefaultPrefixes()` (the same helper the `/api/sales/document-prefixes`
   GET route now calls on every request) so all 8 document types have a default prefix,
   and normalizes the pre-existing "INV" prefix row to "INV-".
3. Resets the tenant's invoice numbering `Counter` so numbers restart at `INV-0001`.
4. Creates 2 `BankAccount` rows (HDFC + ICICI current accounts) if none exist.
5. Adds one signature image to `DocumentSettings.signatures` if empty.
6. Creates a `WELCOME10` coupon if none exists.
7. Fills in `address_tab.state_name` on the 3 pre-existing customers (Apex Global Corp →
   Maharashtra, Zenith Services LLC → Karnataka, Alpha Distributing → Delhi) and creates
   2 new customers (Meridian Business Solutions → Maharashtra, Coastal Retail Traders →
   Gujarat) — 5 customers total, split across "same state as seller" and "different
   state" so both CGST/SGST and IGST paths are exercised.
8. Deletes the 5 old invoices and inserts 10 new ones, computed through the real
   `computeInvoiceTotals()` / `generateInvoiceNumber()` / `resolveInvoiceStatus()`
   libraries (not hand-computed numbers) so the seed can never drift from production
   math.

Verify a render pass separately (renders all 10 through the actual template engine used
by the PDF route, without needing a browser or auth session):

```bash
npx tsx scripts/verify-invoice-pdfs.ts
```

## The 10 seeded invoices

| # | Number | Customer | State (Place of Supply) | Template | Status | What it exercises |
|---|--------|----------|--------------------------|----------|--------|--------------------|
| 1 | INV-0001 | Apex Global Corp | Maharashtra (same as seller) | Modern | Paid | CGST+SGST split, per-line % discount, marked-fully-paid single payment, bank account, signature |
| 2 | INV-0002 | Zenith Services LLC | Karnataka | Vintage | Saved (unpaid) | IGST split, per-line % discount |
| 3 | INV-0003 | Meridian Business Solutions | Maharashtra | Classic | Partially paid | CGST+SGST, taxable + non-taxable additional charges, 2 split payments (< total) |
| 4 | INV-0004 | Apex Global Corp | Tamil Nadu (place-of-supply override) | Elegant | Saved | IGST despite Maharashtra customer master data — place of supply overrides customer state; TDS 10% |
| 5 | INV-0005 | Alpha Distributing | Delhi | MRP + Discount | Saved | IGST, extra discount %, TCS 1%, two different HSN codes (multi-row HSN summary) |
| 6 | INV-0006 | Coastal Retail Traders | Gujarat | Service | Draft | Draft save/resume fidelity (minimal required fields only) |
| 7 | INV-0007 | Zenith Services LLC | Karnataka | genZ | Saved | Round-off on a fractional unit price (₹1199.50), file attachment |
| 8 | INV-0008 | Meridian Business Solutions | Maharashtra | Landscape | Paid | CGST+SGST, fully paid via 2 split payments summing exactly to the total, bank account |
| 9 | INV-0009 | Alpha Distributing | Delhi | Bill To - Ship To | Saved | IGST, e-Waybill + e-Invoice toggles, WELCOME10 coupon applied, signature |
| 10 | INV-0010 | Coastal Retail Traders | Gujarat | Legend | Overdue | Due date in the past with zero payments → server-resolved "overdue" status, bank account |

Between them the 10 invoices cover: all 3 payment-status branches (paid /
partially_paid / draft) plus overdue, CGST+SGST vs IGST (including a place-of-supply
override that disagrees with the customer's own state), per-line and extra/global
discounts in both `%` and `₹` modes, taxable vs non-taxable additional charges,
TDS and TCS, round-off, multi-HSN summaries, split payments, a coupon, an attachment,
and 10 of the 14 template categories (Modern, Vintage, Classic, Elegant, MRP + Discount,
Service, genZ, Landscape, Bill To - Ship To, Legend).

## The 14 template categories (all implemented, `lib/invoiceTemplates/definitions.ts`)

Modern, Vintage, MRP + Discount, Elegant, Service, Landscape, Evergreen, Elegant with
Images, Classic, Compact, Bill To - Ship To, Legend, Service 2, genZ.

Every category renders through the single `renderInvoiceTemplate()` engine
(`lib/invoiceTemplates/render.ts`), branching on the template's config flags rather than
14 hand-duplicated files. `npx tsx scripts/verify-invoice-pdfs.ts` renders all seeded
invoices through this exact function and reports any that throw or produce suspiciously
empty output.

## How to create one invoice manually (UI walkthrough)

1. Sign in to `default-tenant` and go to **Sales → Invoices → New Invoice**
   (`/sales/invoices/new`).
2. Header: pick a prefix (defaults to "INV-"), or use "+ Add custom prefix" to create
   and select a new one inline.
3. Select an existing customer (or "+ Create Customer" to add one inline) and a Place of
   Supply — it auto-fills from the customer's state the first time, but you can change
   it (e.g. to prove IGST vs CGST/SGST).
4. In Products & Services: search for an existing product (e.g. "Enterprise Cloud
   Subscription") or "Add new Product?" inline. Set Qty, HSN, Tax %, and a discount
   (choose `%` or `₹` per line). Totals recompute live.
5. Optionally: "Apply discount(%) to all items?", "+ Additional Charges" (mark
   taxable/non-taxable), toggle "Show description" for a per-line description row.
6. Notes / Terms & Conditions boxes: type directly, or click "Draft with AI" to have the
   tenant's AI service propose text (assistive only — nothing saves until you click
   Save).
7. Toggle Create E-Waybill / Create E-Invoice as needed; attach up to 5 files; apply a
   coupon if one exists (e.g. `WELCOME10` after seeding).
8. Right panel: set Extra Discount (₹ or %), toggle Round Off (on by default), tick
   TDS/TCS with a rate if applicable, pick a Bank Account, add one or more payments
   (Notes/Amount/Date/Mode) or "Mark as fully paid", and pick a Signature.
9. Click the palette icon next to "Save and Print" to pick a template (14 available),
   then either **Save as Draft** (skips required-field checks, resumable later) or
   **Save →** / **Save and Print** (validates customer + at least one named line item —
   an empty product name shows an inline "Fill Product Name" error).
10. From the invoice detail page you can view the rendered PDF (iframe), share via
    WhatsApp (`wa.me` deep link), edit, or delete.

## Verifying Document Settings actually affect rendering

`/sales/document-settings` is one scrollable page with a tab bar that scroll-jumps
between sections. Toggle any Display/Layout/Branding control, then re-open a seeded
invoice's PDF (or rerun `verify-invoice-pdfs.ts`) — the change should be visible (e.g.
turning on "Show HSN/SAC Summary" adds the HSN grid; changing the accent color recolors
headers/totals; margins change the `@page` box). See `tests/sales/invoiceTemplates.test.ts`
for the automated version of this check (each toggle asserted to change the HTML).

## Known deferred items (unchanged from the prior session, see `docs/_context/MEMORY.md`)

- Real GSTN/IRP e-Waybill/e-Invoice government API integration is out of scope — the
  toggles persist on the invoice but don't call a live government API.
- WhatsApp sharing is a `wa.me` deep link to the hosted PDF, not the WhatsApp Business API.
- Purchase/Quotation template categories are wired end-to-end but have no seeded
  templates yet (only the 14 Invoice-category templates exist).
