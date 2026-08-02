# Manual Testing Guide — Reported Issues

**Purpose:** This is a click-by-click guide for testing each reported issue directly in the live app (admin panel), without needing to read code. For every issue: exact navigation steps, what "working" should look like, and what the reported bug looks like — so you can confirm whether it's actually broken and capture the exact error text/screenshot needed to fix it.

## Round 2 update — everything in Issue #9 was re-investigated end-to-end

After the first round of fixes, QA reported that the entire Issue #9 cluster (Inventory Orders, Finance revenue, Receivables duplicates, Customer Advances, P&L, Q2C Pipeline, and payment recording) was still broken. Each part was re-diagnosed from scratch (not just re-tested) and had a genuine, previously-undiscovered root cause — summarized below, with what to check for in each part further down:

- **Inventory Orders ("still unusable"):** the auto-generated order number shown in the "New Order" dialog was only ever a *preview* — the backend never actually consumed the counter on submit, so the very same number was suggested every time and the **second order ever created always failed with a 409 conflict**. Fixed: the server now always atomically assigns the number and ignores whatever the form sends; verified by creating three orders back-to-back.
- **Finance revenue stuck at zero:** invoices created *before* the previous round's GL-posting fix shipped had never been retroactively posted to the ledger — the fix was forward-only. Backfilled 38 historical invoices across all tenants; P&L and Balance Sheet now reflect them (verified: trial balance balances, non-zero revenue).
- **Receivables shows a paid invoice again + duplicate payment:** the server never checked an allocation against what an invoice actually still owed — only against the payment's own total. A second submission (double-click, stale tab, unrefreshed list) against an already-settled invoice was silently accepted in full. Fixed: the server now rejects any allocation that exceeds the invoice's real remaining balance, with a clear error naming the invoice.
- **Customer Advances not clearing:** the invoice form's "Mark as fully paid" checkbox only ever changed the status label — it never created a payment or touched the ledger, so Accounts Receivable stayed booked in full forever (confirmed on 11 real invoices). Fixed: using that checkbox now automatically records a real, ledger-correct payment for whatever isn't already covered by real payments; the 11 already-affected invoices were backfilled.
- **P&L never updating:** same root cause as "Finance revenue stuck at zero" above — fixed by the same backfill.
- **Q2C Pipeline "doesn't work, no update":** the pipeline board only ever read from a completely separate record type that the real Quotes → Invoices workflow never created or touched — so the board was permanently empty/frozen no matter what you did in Quotes/Invoices. Fixed: converting a quote to an invoice now creates/advances its pipeline card automatically, and fully paying that invoice advances it to "Revenue Recognized."
- **Payment recording error + duplicate + still overdue:** this was the same root cause as the Receivables duplicate-payment bug above — the "SalesInvoice Validation Failed" error text was from testing against a build that predated the earlier lineTotal fix. With both fixes in place, a genuine duplicate submission is now cleanly rejected before anything is recorded, instead of silently succeeding twice.

**Note on the historical-data backfills:** the backfill scripts were run against whichever MongoDB database this environment's `.env` connects to. If the production/Vercel deployment uses a *different* database, someone with access to it will need to run `npx tsx scripts/migrate-backfill-invoice-gl-postings.ts` and `npx tsx scripts/migrate-backfill-marked-fully-paid-payments.ts` against that database too — this cannot be confirmed from here.

**How to use this:**
1. Log in as an admin user on your tenant subdomain.
2. Follow each issue's steps in order — don't skip steps, some bugs only appear after a specific sequence (e.g. "after multiple clicks").
3. For every issue, note: (a) did it reproduce exactly as described, (b) any error message text verbatim (open browser DevTools → Console/Network tab if possible and copy the red error), (c) screenshot if visual.
4. Where a step says "Expected" vs "Bug looks like" — if you see the "Bug looks like" behavior, the issue is still open.

---

## Issue #1 — Quotation creation / send / proforma invoice (P3)

**Where:** Sales → Quotes (`/sales/quotes`)

**Part A — Quotation not visible after creating**
1. Sidebar → **Sales** → **Orders** section → **Quotes**.
2. Click **New** (top-right) → **Quote**.
3. Fill in a Customer, add one line item, click **Save as Draft**.
4. You'll land back on... check: does the new quotation appear immediately in the **Quotes** list, or is it missing until you refresh the page / navigate away and back?
   - **Expected:** New quotation appears in the list immediately, no refresh needed.
   - **Bug looks like:** List doesn't show the new row until you hit F5 or switch to another module (e.g. Finance) and come back to Quotes.

**Part B — Sending the quotation**
1. Instead of "Save as Draft," repeat quote creation and this time click the blue **Save and Send** button (there is no separate "Send" button — Save and Send does both in one action).
2. Watch what happens on a single click.
   - **Expected:** One click saves and sends (e.g. shows a success toast, status changes to "sent").
   - **Bug looks like:** Nothing happens on first click, or you have to click it 2-3 times before it registers / shows a toast.
3. Open DevTools → Network tab before clicking, so you can see if repeated clicks are firing repeated POST requests (useful evidence either way).

**Part C — "Proforma invoice" / Convert to Invoice**
> ⚠️ Note: We checked the current codebase and there is **no "Proforma Invoice" feature anywhere** in this app (no sidebar link, no page, no button with that name). The closest matching real feature is **Convert to Invoice** on the quote's edit page. Please test that flow below and tell us the *exact* error text — this will tell us whether "proforma invoice" refers to this Convert-to-Invoice action, or whether you're looking at an older/different build.
1. From the Quotes list, click on the quotation row you just sent — this opens the **Edit Quote** page.
2. Scroll to the bottom action bar and click **Convert to Invoice**.
3. Observe the result.
   - **Expected:** A new Sales Invoice is created and you're taken to it (or shown a success message), quote status becomes "invoiced."
   - **Bug looks like:** An error toast/banner appears — copy the exact text (e.g. does it literally say "failed to confirm invoice"?). Also check: does clicking Convert to Invoice a second time on the same quote correctly block you with a "already converted" style error, or does it silently create a duplicate invoice?

---

## Issue #2 — Accounting logic / Journal Type field (P0)

**Where:** Finance → Journal Entries (`/finance/accounting/journal-entries`)

1. Sidebar → **Finance** → **Accounting** section → **Journal Entries**.
2. Click **New Entry** (top-right).
3. In the modal titled **New Journal Entry**, look at the fields present.
   - **Note:** In the current build, there is **no visible "Journal Type" dropdown** in this form at all — the fields are: Entry Name, Date, Reference, then a line table of Account / Partner / Label / Debit / Credit. If you still see a manual "Journal Type" selector, screenshot it — that tells us there's a second/older journal-entry entry point somewhere we haven't found yet.
4. Test the semantic-validation gap directly: add a line debiting **Salary Expense** (or any Expense-type account) and credit it against **Capital** (an Equity-type account) instead of Cash/Bank.
   - **Expected (once fixed):** System should warn or block this pairing ("Expense should typically be offset by Cash/Bank/Payable, not Capital").
   - **Current/bug behavior:** As long as Debit = Credit numerically, the entry saves via **Post Entry** with no warning about the nonsensical account pairing — confirm this is still the case.
5. Also check **Chart of Accounts** (`/finance/accounting/chart-of-accounts`) to see the full list of ledgers available for selection, so you can judge which pairings are "nonsensical" for your own bookkeeping (e.g. Income vs Asset mismatches) when giving us the "Smart Rule" pairing table.

---

## Issue #5 — Product creation modal + publish error (P2)

**Where:** Sales → Products (`/sales/products`)

**Part A — Modal closing on outside click**
1. Sidebar → **Sales** → **Catalog** section → **Products**.
2. Click **New Product**. A modal titled **Create New Product** opens.
3. Click anywhere *outside* the modal (on the dark backdrop) — do NOT click Cancel/X.
   - **Expected (already fixed in current code per our check):** Modal should stay open; outside clicks and Escape key are ignored while creating/editing.
   - If it still closes for you, note exactly where you clicked and whether any data was lost — this would mean there's a regression or a different code path than what we reviewed.

**Part B — Publish Product → Internal Server Error**
1. In the same **Create New Product** modal, fill in all required fields (name, price, etc.).
2. Click **Publish Product** (bottom of modal, not "Save as Draft").
3. Observe the result.
   - **Expected:** Product is created, modal closes, product appears in the Products list with "Published"/active status.
   - **Bug looks like:** A red "Internal Server Error" (500) message appears, product is NOT created. Open DevTools → Network tab, click Publish Product again, find the failed request (red, status 500) and copy the full response body — this is the single most useful piece of evidence for this bug.

**Part C — Draft products appearing in Quotation/Invoice**
1. Create a product and this time click **Save as Draft** instead of Publish.
2. Confirm in the Products list that it shows a "Draft" status badge.
3. Go create a new Quotation (`/sales/quotes/new`) or new Invoice (`/sales/invoices/new`) and open the item/product picker on a line item.
   - **Expected:** Draft products should NOT appear in this picker — only published/active products.
   - **Bug looks like:** The draft product you just created shows up and can be added to the quotation/invoice line items.

---

## Issue #6 — Quotation taxation (TDS/TCS dropdown) (P0)

**Where:** Sales → Quotes → New Quote (`/sales/quotes/new`)

1. Start a new quote, add at least one line item so the totals panel populates on the right.
2. In the totals panel, find the tax radio options: **None / TDS / TCS**.
3. Click **TDS** (or **TCS**).
4. A dropdown labeled **"Select a Tax"** should appear below it. Click to open it.
   - **Expected:** Dropdown lists actual tax rates (e.g. "TDS 194C - 1%") that you can select, and selecting one applies the deduction to the total.
   - **Bug looks like:** Dropdown opens but is empty / nothing happens when you click an option / total doesn't change.
5. If empty, check whether tax rates exist at all: navigate to wherever tax rates are configured in Finance (search Finance sidebar for "Tax" or check Chart of Accounts / Settings area) — an empty dropdown could mean either (a) the dropdown is broken, or (b) no tax rates have been configured yet for this tenant. Please note which one it looks like (empty list vs. broken click) since the fix differs.

---

## Issue #7 — Quotation → Invoice discount mismatch (P0)

**Where:** Sales → Quotes → New Quote, then Convert to Invoice

**Part A — Discount on the quote itself**
1. Create a new quote, add a line item.
2. In the totals panel, find the **Discount** field (this is the "extra discount" — on the Quote screen it's just labeled "Discount"). Enter `10` and switch the unit toggle to **%**.
3. Confirm the Total updates correctly for a 10% discount. Save and Send the quote.
4. Open the sent quote (Edit Quote page) and confirm the displayed total still correctly reflects 10% discount.

**Part B — Convert to Invoice and check the mismatch**
1. On the same quote's Edit page, click **Convert to Invoice**.
2. Open the resulting invoice.
   - **Expected:** Invoice shows the same 10% discount, correctly calculated.
   - **Bug looks like:** Total is different, and the discount field/badge shows **"₹10"** (flat rupee amount) instead of **"10%"**.
3. Click **Edit** on this invoice (opens the invoice edit form).
   - Check the **Extra Discount** field (note: on the Invoice form this field is literally labeled **"Extra Discount"**, unlike the Quote form's plain "Discount" — different label, same concept).
   - **Bug looks like:** Extra Discount shows **0** by default when the page first loads, even though the invoice was created with a 10% discount from the quote. Then note: does manually typing the discount back in fix the total correctly? (Per the report, yes — confirm this still holds.)
   - Also confirm: does the Extra Discount field show **10 with ₹ selected** (instead of 10 with % selected) — i.e. the unit toggle defaulted to rupee instead of percent, which is the root of the mismatch?

**Part C — Payments section dropdowns on the invoice**
> ⚠️ Not the **Payments** tab in the top nav (that's a list of standalone payment records). This is a small sub-section *inside the invoice edit form itself*.
1. Click the **Invoices** tab (top nav) → open any invoice, or click **New Invoice**.
2. On the invoice form, scroll the right-hand totals panel down past Subtotal → Extra Discount → Taxable Amount → GST → Round Off. Below that is a compact **Payments** sub-section with an inline dropdown showing placeholder text **"Select Bank"**.
3. Click it.
   - **Expected:** Lists your configured bank accounts.
   - **Bug looks like:** Dropdown opens but shows nothing / no options.
4. A little further down in the same panel is **Select Signature** (defaults to "None").
   - Same check — does it list configured signatures, or is it empty/non-functional?
5. If both are empty, check whether you've actually added any Bank Accounts (Finance → Chart of Accounts or Banking) or Signatures anywhere in Settings/Document Settings first — an empty dropdown due to no data configured is a different bug than a dropdown that's broken even with data present. Please note which applies.

---

## Issue #8 — Payment recording (P0)

**Where:** Sales → Payments → New (`/sales/payments/new`), and via Sales → Invoices

**Part A — "Deposit To" showing all ledgers**
1. Sidebar/tab-nav → **Sales** → **Payments** tab → **+ New Payment** (or navigate to `/sales/payments/new` directly).
2. Click the **Deposit To** dropdown.
   - **Expected:** Should only list bank/cash-type accounts you've actually added (e.g. your real bank accounts), NOT the full Chart of Accounts.
   - **Bug looks like:** The default seeded **"Bank Current Account"** ledger shows up even though you never explicitly added it, and/or non-bank ledgers (Expense, Income, etc.) appear in the list too. Note exactly which accounts show up here vs. what you've configured under Chart of Accounts as bank-type.

**Part B — Recording payment against a pending/overdue invoice**
1. Sidebar → **Sales** → **Orders** section → **Invoices**.
2. Open any invoice that is **Overdue** or **Saved** (unpaid) status.
3. Look for a green **Record Payment** button (should appear on the invoice detail page for unpaid/overdue/partially-paid invoices).
   - **Expected:** Button is visible, clicking it opens the Record Payment form pre-filled with that customer and invoice already selected/auto-applied.
   - **Bug looks like:** No such button appears at all, OR it appears but doesn't pre-fill the customer/invoice, OR clicking it takes you to a blank/generic payment form with no reference to the invoice you came from.
4. Also check the same flow from **Finance → Receivables** (`/finance/receivables`) — there's a second "Record Payment" entry point there pointing at the same invoice. Confirm both entry points behave consistently (or both fail the same way).

---

## Issue #9 — Orders, Finance sync, Balance Sheet, P&L, Q2C Pipeline (P1)

This issue has several independent parts — test each separately. All parts below were re-diagnosed and fixed in Round 2 (see summary at the top of this document for the root cause of each).

**Part A — Inventory → Orders → New Order**
1. Sidebar → **Inventory** → **Operations** section → **Orders**.
2. Click **New Order**. A dialog titled **"Create New Order"** opens.
3. The **Order Number** field is now read-only (greyed out) and shows a preview of the next number — it's no longer editable, since editing it used to silently break the numbering.
4. Fill in Customer Name (free-text with autocomplete), warehouse, delivery date, and at least one item with a unit price, then click **Create Order**.
   - **Expected:** Modal closes automatically, no error, and the new order appears in the Orders list with a real order number (e.g. `ORD-0002`).
5. **Critical regression check — repeat step 2-4 to create a *second* order back-to-back.**
   - **Expected:** The second order gets the *next* number (e.g. `ORD-0003`), not a conflict.
   - **Bug looked like (fixed):** Previously, the second order (and every one after the first) always failed with "That order number is already in use," because the number shown in the dialog was only ever a preview that never actually got consumed. If you still see this, it's a genuine regression — capture the exact error and which order number it collided with.

**Part B — Invoice paid status not reflecting in Finance**
1. Go to **Sales → Invoices**, open an unpaid invoice, click **Record Payment**, complete the payment (mark it as paid).
2. Go to **Finance → Dashboard** (`/finance/summary`) — check the Cashflow figure updates.
3. On the same dashboard, check **Revenue** and other headline figures.
   - **Expected now:** Revenue reflects the invoice, both for this new payment and for older invoices you may have paid in earlier testing (historical data was backfilled).
   - Still zero? Note whether it's *only* older invoices that are affected (a sign the backfill didn't reach this database — see the note at the top of this document) or *also* brand-new ones you just created (a genuine new regression).
4. Go to **Finance → Receivables** (`/finance/receivables`) and search for the same invoice you just paid.
   - **Expected now:** The invoice no longer appears in the unpaid/receivable list, and attempting to record a second payment against it (e.g. re-opening the Record Payment form with the same invoice pre-filled and submitting again) is now rejected with a clear error naming the invoice and how much is actually still outstanding (₹0.00), instead of silently succeeding a second time.
   - **Bug looked like (fixed):** Previously the same invoice could be paid twice with no server-side check.

**Part C — Customer Advances showing stale balance**
1. Pick a customer whose full due amount you've now cleared (paid) via Part B, **or** specifically test the "Mark as fully paid" checkbox on an invoice's edit form for a customer who was never actually paid through Record Payment.
2. Go to **Finance → Accounting → Balance Sheet** (`/finance/accounting/balance-sheet`).
3. Look under the **Liabilities** card → **"Current & Long-Term Liabilities"** section for a line item named **"Customer Advances"** (account code 2150).
   - **Expected now:** Ticking "Mark as fully paid" on an invoice now automatically records a real payment behind the scenes (visible in **Sales → Payments** as mode "Marked as Fully Paid") that correctly relieves Accounts Receivable — it's no longer a purely cosmetic status flip. This should stop new stray balances from appearing.
   - The 11 pre-existing invoices we found in this state (across several tenants) were already backfilled with a matching real payment — check the Payments list for entries with mode "Marked as Fully Paid" if you want to confirm.
   - **Still stuck for a case not covered above?** Note the exact rupee figure, which customer, and how the due was actually cleared (Record Payment vs. the checkbox) — that combination is the key clue.

**Part D — Profit & Loss not updating**
1. Go to **Finance → Accounting → Profit & Loss** (`/finance/accounting/profit-loss`).
2. Check whether the revenue from the invoice you paid in Part B shows up anywhere on this statement.
   - **Expected now:** Figures reflect both new activity and previously-existing (backfilled) invoices; the trial balance should also balance (total debits = total credits) if you check the Balance Sheet's validation figures.
   - Note the date range filter on the page (if any) and make sure it covers today's date — a wrong default date range would look like "not updating" but actually be a filter issue; please note which one it looks like.

**Part E — Q2C Pipeline not updating**
1. Sidebar → **Sales** → **Pipeline** section → **Q2C Pipeline** (`/sales/pipeline`).
2. Create a new quote, send it, then **Convert to Invoice** (steps in Issue #1), then come back to this pipeline page.
   - **Expected now:** A new card appears immediately in the **"Invoice Posted"** column, named after the quote number, with the customer and amount shown.
3. Now fully pay that invoice (Record Payment for the full amount) and refresh the pipeline page.
   - **Expected now:** The same card moves to the **"Revenue Recognized"** column.
   - **Bug looked like (fixed):** Previously the board only ever reflected manual drag/click actions on the board itself — real quotes/invoices/payments never appeared or moved a card at all, so the board looked permanently empty or frozen regardless of real activity.
   - Note: the board's own manual "move to next stage" buttons (for tracking a deal through Lead/Opportunity/Discount-Approval stages by hand, before a quote exists) still work as before — this fix is additive, not a replacement.

**Part F — Invoice payment recording error + duplicate + still shows overdue**
1. Open an overdue invoice, click **Record Payment**.
2. In the payment form, enter the amount supposedly still due and submit.
   - **Expected:** Payment recorded successfully, invoice status updates to "Paid" (or "Partially Paid"), no error.
3. Now deliberately try to reproduce the original report: submit the exact same payment a second time (or double-click Save quickly).
   - **Expected now:** The second attempt is rejected with a clear 400 error (e.g. "Invoice INV-XXXX only has ₹0.00 outstanding...") and nothing new is recorded — check the Payments list and the invoice's payment history to confirm only one payment exists.
   - **Bug looked like (fixed):** Previously this could show a "SalesInvoice Validation Failed" error while still silently posting a duplicate payment in the background, leaving the invoice stuck on "Overdue" despite being paid (twice). If you still see the exact "SalesInvoice Validation Failed" text, capture it verbatim and which field it names — that would indicate a different, not-yet-found issue rather than this one.

---

## What to send back after testing

For each issue/part above, a short note is enough:
- ✅ Fixed / works as expected, or
- ❌ Still broken — with: the exact click sequence that triggered it, any error text (verbatim, from the toast or DevTools Network tab), and a screenshot if visual.

This lets us jump straight to the specific broken flow instead of re-searching the whole app.
