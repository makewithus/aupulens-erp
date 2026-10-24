# Sales QA status — 24 October 2026

Scope: the user’s 22 October Sales report, including all 16 original bug IDs, 71 original test cases, six suspected issues, eight blocked cases and 15 previously untested areas. This is a local working-tree audit, not verification of erp.aupulens.com deployment. No production/customer data was changed.

**Legend:** 🟢 GREEN = the stated behavior passed the listed check. 🔴 RED / FAILED = a defect was reproduced or implementation is missing. 🔴 RED / UNVERIFIED = evidence is incomplete; this is not a reproduced defect. Passing a helper or simulated flow alone does not prove the complete feature works.

Original bugs: **14 green, 2 red with remaining defects, 0 red/unverified**.

Original 71 test cases: **58 green, 7 red with failures or missing implementation, 6 red/unverified**. Green certifies the stated local check and its documented limits; it does not certify the deployed environment.

## Execution evidence

- Sales/accounting/tax/precision/revenue regression: **407 passed, 0 failed across 65 files**.
- Independent audit: **25 passed, 7 failed across 32 checks**; failures are intentionally retained as reproductions.
- Full-system run was interrupted and was not used as a passing quality gate. The user subsequently selected Sales-only scope.
- Earlier acceptance report misassigned several original bug IDs and treated standalone simulations as feature verification. This report preserves the IDs and meanings from the original attachment.
- Browser evidence: `browser-results.json` plus `browser-followup.json` in the evidence folder. All 17 navigation checks pass after correcting the synthetic product fixture. The follow-up completes item selection and credentials login. The initial harness error is preserved as diagnostic evidence, not an application defect.
- Quote/customer forms pass layout measurements at 390, 448, 768 and 1280 pixels in light and dark themes; selecting the product at 448px fills rate ₹7,499.
- Actual Chromium print-to-PDF produced a 76,336-byte PDF; extracted text retains 2.5, ₹23,025.06 and the Adjustment line.
- TypeScript passes (types.exit = 0); audit test lint passes. The audit tests contain intentional failing expectations for current defects.

## Original bugs

| Bug | Severity | Issue | Status | Evidence / remaining problem |
|---|---|---|---|---|
| SALES-BUG-001 | High | 30-day revenue | 🟢 GREEN | Dashboard route returns ₹30,046 from eligible invoice dates; draft, cancelled, old, future and other-tenant invoices excluded. |
| SALES-BUG-002 | Medium | Open pipeline includes won/lost | 🟢 GREEN | Pipeline source excludes lost, cancelled and revenue_recognized. Seeded browser KPI reconciles with the open-deal sum. |
| SALES-BUG-003 | High | Fractional invoice quantity | 🟢 GREEN | All active templates that display quantity retain 2.5. Service layout intentionally omits quantity; it does not round 2.5 to 3. |
| SALES-BUG-004 | Medium | Taxable amount and adjustment | 🟢 GREEN | Actual renderer: taxable ₹23,025.06; non-taxable adjustment ₹0.94; grand total ₹23,026.00; HSN sum agrees. |
| SALES-BUG-005 | Medium | Discount above 100% | 🟢 GREEN | Actual create route rejects 150% at global, extra-discount and line-discount levels; no record saved. |
| SALES-BUG-006 | Medium | Zero/negative quote quantity | 🟢 GREEN | Actual create route rejects quantities 0 and −2 with HTTP 400. |
| SALES-BUG-007 | Medium | Invoiced quote reverts to draft | 🟢 GREEN | Actual PATCH returns 409; stored status remains invoiced. |
| SALES-BUG-008 | Medium | Quote customer-name search | 🟢 GREEN | Actual quote GET finds Himalaya Audit by customer name and remains tenant scoped. |
| SALES-BUG-009 | Medium | Invalid customer email/phone | 🟢 GREEN | Actual customer POST rejects not-an-email, qa@@test and 12ab!; no invalid customer saved. |
| SALES-BUG-010 | High | Missing orders / inconsistent order lists | 🔴 RED | Both unfiltered endpoints include 70 imported drafts plus a modern order. Remaining failure: status=confirmed excludes a legacy approved order. Complete filter sign-off fails. |
| SALES-BUG-011 | Low | Inconsistent date styles | 🔴 RED | Real PipelineCard renders US M/D/YYYY under a US locale; shared formatter correctly renders DD/MM/YYYY elsewhere. |
| SALES-BUG-012 | Low | Invoice currency grouping | 🟢 GREEN | Invoice list uses shared formatSalesCurrency; verified ₹9,79,995.00. |
| SALES-BUG-013 | Medium | Narrow-screen quote/customer forms | 🟢 GREEN | See per-viewport browser evidence. All measured layouts pass. |
| SALES-BUG-014 | Low | Print-format preview arithmetic | 🟢 GREEN | Real preview GET uses computeInvoiceTotals and renders matching sample taxable/total values with Qty. Sample now includes an explicit ₹150 non-taxable charge and ₹100 extra discount, so it is a different fixture from the original ₹28,700 sample. |
| SALES-BUG-015 | Low | Payment prefill is unapplied | 🟢 GREEN | Browser: ₹23,026.00 received and allocated to the selected invoice; ₹0.00 excess. |
| SALES-BUG-016 | Low | Lowercase status label | 🟢 GREEN | Status trigger has CSS capitalize. Browser confirms capitalization. |

## Previously blocked cases

| ID | Feature | Status | Evidence / limitation |
|---|---|---|---|
| 064 | Post payment | 🟢 GREEN | Real payment/accounting suites pass; balanced journal and invoice allocations verified in isolated DB with chart of accounts. This does not repair accounting setup in the deployed tenant. |
| 065 | Save and Send | 🔴 RED | Confirmed implementation gap: QuoteForm only POSTs/PATCHes status=sent. createSalesQuote persists the record without an email dispatch; the older blocked-case test calls a standalone mock. |
| 066 | WhatsApp and print/PDF | 🟢 GREEN | External delivery is not performed. Actual share action intercepted locally and print endpoint/PDF verified. |
| 067 | E-invoicing retry/generation | 🔴 RED | lib/einvoice/gspService.ts defaults to StubGspService, accepts any non-empty credentials and generates STUB-IRN values; real portal generation is not implemented. Existing success can also be regenerated by generate route. |
| 068 | Delete invoice / void order | 🔴 RED | Actual DELETE returns 200 for a paid invoice and removes it. The older test does not invoke DELETE. Void persistence is covered only at model level. |
| 069 | Mark as Shipped | 🔴 RED | Actual PATCH accepts shipped but inventory remains 50 instead of 40. The older test manually decrements stock instead of exercising the application endpoint. |
| 070 | Logout/login persistence | 🟢 GREEN | Uses only a disposable local user. Actual credentials login/logout and navigation persistence pass. |
| 071 | Restricted Sales permissions | 🟢 GREEN | Middleware source enforces role boundaries. Local Sales/HR/expired-session HTTP checks pass. |

## Previously untested areas

| ID | Feature | Status | Evidence / limitation |
|---|---|---|---|
| 1 | Create subscription | 🟢 GREEN | Actual POST/GET persist schedule and ₹1,000 amount. |
| 2 | Subscription quote | 🟢 GREEN | QuoteForm subscription tab calls the same subscription POST exercised by the independent audit; complete browser save not separately exercised. |
| 3 | Create/edit pricelist | 🟢 GREEN | Actual POST/PATCH/GET persist fixed price 250 → 200. |
| 4 | Apply pricelist pricing to quote | 🔴 RED | No pricelist selection/application in QuoteForm or createSalesQuote. Stored price rules are not applied by the audited quote path. |
| 5 | Create delivery challan | 🔴 RED | Valid actual POST returns 500: tenantId is required. Handler calls DeliveryChallan.create(body) without attaching the authenticated tenant. |
| 6 | Create product | 🟢 GREEN | Product model and actual publish/create route suites pass, including the empty income-account regression. |
| 7 | Create invoice directly | 🟢 GREEN | Actual invoice route suite passes with the real InvoiceForm payload, computed line totals and payment handling. |
| 8 | POS Billing | 🔴 RED | Button on invoice list has no onClick or link; it cannot open billing. Browser click confirms no navigation or dialog. |
| 9 | Document Settings | 🟢 GREEN | Actual GET/PATCH persist showQuantity3Decimals and reject tenant override. |
| 10 | Put on Hold | 🟢 GREEN | Actual order PATCH persists on_hold. |
| 11 | Quote TDS/TCS | 🟢 GREEN | Actual quote POST returns ₹900 for 10% TDS and ₹1,100 for 10% TCS on ₹1,000. |
| 12 | Reopen a lost deal | 🟢 GREEN | Existing passing pipeline/remediation suites call real transitionDeal and verify reopening. |
| 13 | Column sorting | 🟢 GREEN | Actual sales-order GET returns opposite orderings for sortDir=asc/desc on header.name. Other lists not all individually verified. |
| 14 | Session expiry | 🟢 GREEN | Expired JWT HTTP check passes. |
| 15 | Network-error handling | 🟢 GREEN | Quote-list fetch failure shows a usable error. |

## Suspected issues

| ID | Feature | Status | Evidence / limitation |
|---|---|---|---|
| S1 | Historical duplicate INV-0075/0076 | 🔴 RED / UNVERIFIED | Current conversion concurrency and idempotency tests pass. Historical invoice origin and linked production records were not available in this local audit. |
| S2 | Imported order total mismatch | 🔴 RED / UNVERIFIED | Diagnostic identifies discrepancies but does not repair historical data. Original SO-V3-81069 was not available locally; no proof its stored total was corrected. |
| S3 | Accounting artifacts in products | 🔴 RED | Actual picker GET still returns the exact reported names Payment against BILL-000359 and Receipt against INV-000213. Current regex covers other names instead. |
| S4 | Pipeline vs lifecycle status | 🔴 RED | listDeals uses q2cStatus and does not reconcile salesOrderStatus=void/closed when mapping a card. Lifecycle PATCH only sets supplied statuses. Reopening works but does not close the originally reported inconsistency. |
| S5 | Customer receivables zero | 🟢 GREEN | Actual GET includes saved unpaid invoices; seeded ₹59,192 returns as receivables. |
| S6 | Past-due invoices not overdue | 🟢 GREEN | Actual invoice-list GET projects a saved invoice with a past due date as overdue. Shared status resolver tests pass. |

## All 71 original test cases

UI navigation passing means the page loaded; it does not certify every button or workflow on that page. Unretested historical values and individual interactions remain red/unverified.

| Case | Original check | Status | Current evidence |
|---|---|---|
| SALES-TC-001 | Navigation — Open Sales; record menu | 🟢 GREEN | Browser page-load check passed for all original screens. |
| SALES-TC-002 | Pipeline — Load stages and KPIs | 🟢 GREEN | Browser page-load check passed: /sales/pipeline. |
| SALES-TC-003 | Pipeline — Pipeline Value = open stages | 🟢 GREEN | SALES-BUG-002: Pipeline source excludes lost, cancelled and revenue_recognized. Seeded browser KPI reconciles with the open-deal sum. |
| SALES-TC-004 | Dashboard — Revenue (30d) matches invoices | 🟢 GREEN | SALES-BUG-001: Dashboard route returns ₹30,046 from eligible invoice dates; draft, cancelled, old, future and other-tenant invoices excluded. |
| SALES-TC-005 | Visualization — Charts and controls render | 🟢 GREEN | Browser page-load check passed: /sales/visualization. |
| SALES-TC-006 | Quotes list — Columns and rows render | 🟢 GREEN | Browser page-load check passed: /sales/quotes. |
| SALES-TC-007 | Quotes list — Next page | 🟢 GREEN | Actual quote GET page 1/page 2 returns disjoint records with correct totals. |
| SALES-TC-008 | Quotes list — Search QUO-000034 | 🟢 GREEN | Actual GET finds the exact quote number. |
| SALES-TC-009 | Quotes list — Search nonsense text | 🟢 GREEN | Nonsense search returns total=0. |
| SALES-TC-010 | Quotes list — Search customer "Himalaya" / "Sudan" | 🟢 GREEN | SALES-BUG-008: Actual quote GET finds Himalaya Audit by customer name and remains tenant scoped. |
| SALES-TC-011 | Quotes list — Status filter Invoiced | 🟢 GREEN | Actual status filter returns only matching quotes. |
| SALES-TC-012 | Quotes list — Filter label after choosing | 🟢 GREEN | SALES-BUG-016: Status trigger has CSS capitalize. Browser confirms capitalization. |
| SALES-TC-013 | Quotes list — From 21-09-2026 | 🟢 GREEN | Actual dateFrom filter includes matching dates. |
| SALES-TC-014 | Quotes list — From 21-09 To 22-09 | 🟢 GREEN | Actual dateFrom/dateTo filter includes both boundary days. |
| SALES-TC-015 | Quotes list — Pick From later than To | 🔴 RED / UNVERIFIED | Exact original interaction not independently completed in this run. |
| SALES-TC-016 | Orders — List renders | 🟢 GREEN | Browser page-load check passed: /sales/orders. |
| SALES-TC-017 | Sales Orders — List renders | 🟢 GREEN | Browser page-load check passed: /sales/sales-orders. |
| SALES-TC-018 | Orders — Both lists show the same orders | 🔴 RED | SALES-BUG-010: Both unfiltered endpoints include 70 imported drafts plus a modern order. Remaining failure: status=confirmed excludes a legacy approved order. Complete filter sign-off fails. |
| SALES-TC-019 | All lists — One date format | 🔴 RED | SALES-BUG-011: Real PipelineCard renders US M/D/YYYY under a US locale; shared formatter correctly renders DD/MM/YYYY elsewhere. |
| SALES-TC-020 | Invoices — List and pagination render | 🟢 GREEN | Browser page-load check passed: /sales/invoices. |
| SALES-TC-021 | Invoices — Amount formatting | 🟢 GREEN | SALES-BUG-012: Invoice list uses shared formatSalesCurrency; verified ₹9,79,995.00. |
| SALES-TC-022 | Payments — List renders | 🟢 GREEN | Browser page-load check passed: /sales/payments. |
| SALES-TC-023 | Customers — List renders | 🟢 GREEN | Browser page-load check passed: /sales/customers. |
| SALES-TC-024 | Customers — Search "Rajesh" | 🟢 GREEN | Customer search route suites pass. |
| SALES-TC-025 | Products — Page renders | 🟢 GREEN | Browser page-load check passed: /sales/products. |
| SALES-TC-026 | Pricelists — Page renders | 🟢 GREEN | Browser page-load check passed: /sales/pricelist. |
| SALES-TC-027 | Subscriptions — Page renders | 🟢 GREEN | Browser page-load check passed: /sales/subscriptions. |
| SALES-TC-028 | E-Invoicing — Page renders | 🟢 GREEN | Browser page-load check passed: /sales/e-invoices. |
| SALES-TC-029 | Delivery Challans — Empty state | 🟢 GREEN | Browser page-load check passed: /sales/delivery-challans. |
| SALES-TC-030 | Export Docs — Page renders | 🟢 GREEN | Browser page-load check passed: /sales/export-docs. |
| SALES-TC-031 | Print-Format Builder — Preview adds up | 🟢 GREEN | SALES-BUG-014: Real preview GET uses computeInvoiceTotals and renders matching sample taxable/total values with Qty. Sample now includes an explicit ₹150 non-taxable charge and ₹100 extra discount, so it is a different fixture from the original ₹28,700 sample. |
| SALES-TC-032 | Customer — Save empty form | 🟢 GREEN | Required name validation in create handler. |
| SALES-TC-033 | Customer — Whitespace-only name | 🔴 RED / UNVERIFIED | Exact original interaction not independently completed in this run. |
| SALES-TC-034 | Customer — Leading spaces trimmed | 🔴 RED / UNVERIFIED | Exact original interaction not independently completed in this run. |
| SALES-TC-035 | Customer — Invalid email | 🟢 GREEN | SALES-BUG-009: Actual customer POST rejects not-an-email, qa@@test and 12ab!; no invalid customer saved. |
| SALES-TC-036 | Customer — Invalid mobile "12ab!" | 🟢 GREEN | SALES-BUG-009: Actual customer POST rejects not-an-email, qa@@test and 12ab!; no invalid customer saved. |
| SALES-TC-037 | Customer — Form at 448 px | 🟢 GREEN | SALES-BUG-013: See per-viewport browser evidence. All measured layouts pass. |
| SALES-TC-038 | Quote — Save with no customer | 🟢 GREEN | Actual quote route rejects missing customer. |
| SALES-TC-039 | Quote — Save with no item | 🟢 GREEN | Actual quote route rejects no line items. |
| SALES-TC-040 | Quote — Item picker at 448 px | 🟢 GREEN | SALES-BUG-013: See per-viewport browser evidence. All measured layouts pass. |
| SALES-TC-041 | Quote — Pick product | 🟢 GREEN | Browser input at 448px selects QA Ergonomic Chair and fills 7499 rate. |
| SALES-TC-042 | Quote — Quantity −2 | 🟢 GREEN | Actual route rejects negative quantity. |
| SALES-TC-043 | Quote — Save with quantity 0 | 🟢 GREEN | SALES-BUG-006: Actual create route rejects quantities 0 and −2 with HTTP 400. |
| SALES-TC-044 | Quote — 3 × 7,499 + 2.5 × 1,234.56, 10% off | 🟢 GREEN | Independent real renderer verifies the report’s arithmetic. |
| SALES-TC-045 | Quote — Discount 150% | 🟢 GREEN | SALES-BUG-005: Actual create route rejects 150% at global, extra-discount and line-discount levels; no record saved. |
| SALES-TC-046 | Quote — Discount −10% | 🟢 GREEN | Validation schema rejects negative discounts. |
| SALES-TC-047 | Quote — Adjustment +0.94 | 🟢 GREEN | Independent renderer retains +0.94 separately. |
| SALES-TC-048 | Quote — Reload keeps all fields | 🟢 GREEN | Actual create then detail GET retains subject, fractional quantity and adjustment. |
| SALES-TC-049 | Quote — Special characters, 226-char name | 🟢 GREEN | Special characters and a 226-character name persist through actual quote API. |
| SALES-TC-050 | Quote — 1,000,000 × 99,999.999 | 🟢 GREEN | Actual API computes 1000000 × 99999.999 = 99999999000. |
| SALES-TC-051 | Quote → SO — Double-click Move to Sales Order | 🔴 RED | Reproduced: two concurrent actual convert-to-order requests create two SaleOrder records for one quoteId. |
| SALES-TC-052 | Quote → SO — Move again | 🔴 RED / UNVERIFIED | Exact original interaction not independently completed in this run. |
| SALES-TC-053 | SO → Invoice — Double-click Convert | 🟢 GREEN | Real conversion integrity/concurrency suites pass. |
| SALES-TC-054 | SO — Status after invoicing | 🔴 RED / UNVERIFIED | Exact original interaction not independently completed in this run. |
| SALES-TC-055 | Quote → Invoice — Convert again from quote | 🟢 GREEN | Real conversion retry/idempotency suites pass. |
| SALES-TC-056 | Quote — Save invoiced quote | 🟢 GREEN | SALES-BUG-007: Actual PATCH returns 409; stored status remains invoiced. |
| SALES-TC-057 | Invoice — Decimal quantity printed | 🟢 GREEN | SALES-BUG-003: All active templates that display quantity retain 2.5. Service layout intentionally omits quantity; it does not round 2.5 to 3. |
| SALES-TC-058 | Invoice — Taxable amount and adjustment line | 🟢 GREEN | SALES-BUG-004: Actual renderer: taxable ₹23,025.06; non-taxable adjustment ₹0.94; grand total ₹23,026.00; HSN sum agrees. |
| SALES-TC-059 | Invoice — PDF preview loads | 🟢 GREEN | Invoice template fragment/full-document regression passes. |
| SALES-TC-060 | Payment — Prefilled amount applied | 🟢 GREEN | SALES-BUG-015: Browser: ₹23,026.00 received and allocated to the selected invoice; ₹0.00 excess. |
| SALES-TC-061 | Payment — Save without Deposit To | 🟢 GREEN | Payment route validates deposit account. |
| SALES-TC-062 | Payment — Amount auto-applies, capped at due | 🔴 RED / UNVERIFIED | Exact original interaction not independently completed in this run. |
| SALES-TC-063 | Payment — Apply 30,000 to 23,026 due | 🟢 GREEN | Payment route rejects over-allocation. |
| SALES-TC-064 | Payment — Post ₹10,000 payment | 🟢 GREEN | Real payment/accounting suites pass; balanced journal and invoice allocations verified in isolated DB with chart of accounts. This does not repair accounting setup in the deployed tenant. |
| SALES-TC-065 | Quote — Save and Send | 🔴 RED | Confirmed implementation gap: QuoteForm only POSTs/PATCHes status=sent. createSalesQuote persists the record without an email dispatch; the older blocked-case test calls a standalone mock. |
| SALES-TC-066 | Invoice — WhatsApp / print dialog | 🟢 GREEN | External delivery is not performed. Actual share action intercepted locally and print endpoint/PDF verified. |
| SALES-TC-067 | E-Invoicing — Retry / generate | 🔴 RED | lib/einvoice/gspService.ts defaults to StubGspService, accepts any non-empty credentials and generates STUB-IRN values; real portal generation is not implemented. Existing success can also be regenerated by generate route. |
| SALES-TC-068 | Invoice / SO — Delete, Void | 🔴 RED | Actual DELETE returns 200 for a paid invoice and removes it. The older test does not invoke DELETE. Void persistence is covered only at model level. |
| SALES-TC-069 | SO — Mark as Shipped | 🔴 RED | Actual PATCH accepts shipped but inventory remains 50 instead of 40. The older test manually decrements stock instead of exercising the application endpoint. |
| SALES-TC-070 | Session — Logout / login persistence | 🟢 GREEN | Uses only a disposable local user. Actual credentials login/logout and navigation persistence pass. |
| SALES-TC-071 | Permissions — Restricted sales role | 🟢 GREEN | Middleware source enforces role boundaries. Local Sales/HR/expired-session HTTP checks pass. |

## Additional reproduced defect — concurrent quote conversion

TC-051 fails: two concurrent requests to the real quote convert-to-order route create **two SaleOrder records for the same quoteId**. The quote-to-invoice lock passes its regression suite; that does not protect quote-to-order creation. The createOrderFromQuote guard checks saleOrderId before either concurrent request has saved it. Add an atomic conversion lock and database uniqueness/idempotency protection.

## Required fixes and outstanding verification

1. Protect issued/paid invoice DELETE and preserve accounting links.
2. Define and implement stock movement for Mark as Shipped, including retry protection.
3. Attach authenticated tenantId when creating delivery challans; reject caller tenant overrides.
4. Normalize legacy approved/closed/cancelled statuses in order filters.
5. Use the shared date formatter on pipeline cards and remaining Sales lists.
6. Exclude the exact reported receipt/payment artifact naming patterns from product suggestions.
7. Implement quote email sending, usable POS Billing, and real GSP integration before signing off those features.
8. Verify/repair historical S1/S2/S4 data in the intended deployed test tenant.
9. Prevent duplicate Sales Orders under concurrent quote conversion (TC-051).
10. Complete any red/unverified original interactions before claiming full end-to-end coverage.

No application fixes were made in this audit. The new audit tests deliberately fail for reproduced bugs; they should turn green when those application defects are fixed. External messages and statutory filings were not sent.

## Artifacts

- `tests/sales/reportAudit20261024.test.ts` — independent executable reproductions.
- `scratch/system-audit-20261024/report-audit.json` and `.log` — independent results.
- `scratch/system-audit-20261024/sales-regression.json` and `.log` — complete 407-test passing regression run.
- `scratch/system-audit-20261024/browser-results.json`, `browser-followup.json`, browser logs, screenshots, `invoice-print.pdf` and extracted `invoice-print.txt`.
- `scratch/system-audit-20261024/types.log` and `audit-lint.log` — static checks; an empty log alone is not proof of completion without a recorded exit code.
