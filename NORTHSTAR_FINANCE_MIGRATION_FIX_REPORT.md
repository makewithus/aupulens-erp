# Northstar finance migration and reporting fixes

Completed October 15, 2026. Changes were tested against the supplied Northstar workbook in isolated local test databases. No existing organization data was edited, no deployment was made, and no production database was used.

## Root causes and fixes

- **Financial statements were empty:** migration excluded the workbook's `Journal Lines` sheet, while Profit & Loss and Balance Sheet reports read posted journal entries. The migration package now recognizes and groups source journal lines by `journal_id` into balanced posted journal entries, resolves their account codes to imported accounts, and validates missing accounts, malformed lines, duplicate line numbers, unsupported status, and debit/credit imbalance. The Balance Sheet presents cumulative unclosed P&L as derived retained earnings when source journals do not contain a closing entry.
- **Accounts could lose their statement classification:** mapping did not recognize the workbook's `account_type` source column. The Account schema now maps it to account type, and journal line resolution uses account codes from the imported chart of accounts.
- **Invoice information was not preserved:** migration mapping/import now retains Northstar's invoice amount, subtotal, tax, due date, currency, status, and reference fields.
- **Invoice totals could look stale after migration:** the Receivables and Sales invoice pages, as well as the financial statement pages, now bypass the tab cache and request fresh server data when opened. The list's total is still the tenant-wide invoice count; it is not a batch count.

The workbook contains 215 invoice rows, not 432. Its 432 figure in the screenshot is not enough to identify which records contributed to the live workspace count. In an isolated clean import, the application produced exactly 215 invoices and the tenant-scoped unique invoice-number index rejected a duplicate without changing that count. If a fresh uncached request in the affected organization still says 432, the other 217 are existing tenant records (or a data-integrity issue requiring a read-only audit); this change intentionally does not delete or hide them.

## Dataset reconciliation

The migration-ready package now includes 2,159 records: 860 master/transaction rows from the original seven migration sheets, plus 1,299 journal entries grouped from 3,193 `Journal Lines` rows. The workbook's P&L Annual, Balance Sheet, and Trial Balance sheets remain reference/reconciliation tabs and are not imported as transactions, which would double-count financial results. The isolated end-to-end test imports the package and reconciles the derived FY2025-26 P&L and March 31, 2026 Balance Sheet account balances against those reference sheets, including retained earnings derived from cumulative unclosed P&L.

## Verification

- `npx vitest run tests/migration tests/accounting tests/sales/invoiceMath.test.ts tests/sales/invoiceStatus.test.ts tests/sales/invoiceNumbering.test.ts tests/sales/salesInvoice.test.ts tests/lib/cachedFetch.test.ts` — 44 files passed, 275 tests passed, 7 skipped.
- `npm run build` — passed.
- ESLint on changed migration, report, invoice-list, and regression-test files — passed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

The count shown in an existing workspace should be checked after opening/reloading the uncached list. Any unexplained pre-existing duplicates require inspection of that organization's actual invoice identifiers before remediation; the importer now prevents creating another invoice with the same tenant-scoped invoice number.

## Post-preview journal dependency guard

The browser failure exposed a separate preview-to-import mismatch. Relationship validation accepted any non-invalid/non-failed Account record in the batch, including a skipped duplicate. The importer excludes skipped rows, so journal rows referencing a skipped account could validate and then fail during the final migration. The supplied workbook includes Account `6600` (Depreciation Expense), referenced by many journal entries; skipping that account is unsafe unless an equivalent account already exists in the organization.

The validator now only treats eligible batch records as relationship references. When a duplicate skip would orphan a journal, the duplicate decision is returned to review with a clear explanation. The Start Migration endpoint performs a final journal-account dependency check after duplicate decisions and before changing the batch to running; unknown references become visible invalid rows, and the batch writes no imported business data. AI Fix recognizes these importer-generated reference failures and requeues them through validation without asking the model to invent or edit account codes. Bulk-fix responses deduplicate identical messages.

Verification after this fix: `npx vitest run tests/migration` — **3 files passed, 70 tests passed, 7 skipped**, including the Northstar workbook end-to-end import and regression cases for skipped, chosen, absent, and stale journal-account references. TypeScript, ESLint, `git diff --check`, and `npm run build` passed.

## Confirmed batch ordering defect — October 16, 2026

A read-only inspection of batch `6ad12ea1471b6501a4eb46cd` confirmed 60 journal failures referencing `6600`. All 25 Accounts ultimately migrated, including `6600` via Merge / Update. The earlier skipped-account and failed-account explanations did not explain this batch: the journal job ran before the approved duplicate Account row. No records in this organization were modified during diagnosis.

The worker queried a limited chunk before sorting entity priorities. MongoDB could return `valid` journals before `duplicate` Accounts, so sorting that chunk could not restore dependency order. Validation now selects the earliest dependency stage across the whole batch before limiting rows; import does the same for both valid and approved duplicate rows. All Accounts finish before journals, and invoices finish before receipts, regardless of source order or chunk size.

Force Create also now retains every original source identifier in the batch identity map, so dependent records resolve to the newly created target even when unique target fields are suffixed. Start repeats target-schema validation using the actual Force Create values, including async Mongoose validation, before entering the running state. Employee dry runs no longer create departments. Concurrent first vendor bills reuse the winning supplier-accounting-partner insert when a unique-key race occurs.

Three focused regressions failed before the ordering fix and pass afterward: Merge / Update before journals, Force Create before journals with the correct target reference, and journal-first sheet order during validation. The full Northstar test now runs twice: clean workspace and existing Depreciation Expense account selected for update. Both reconcile Balance Sheet/P&L and preserve the expected invoice, receipt, stock, vendor-bill and journal counts.

Verification: migration suite **75 passed, 7 skipped**; additional pre-write assertions in the focused tests **3 passed**. TypeScript and changed-file ESLint passed. Existing failed batches remain available through Review Failed Rows and revalidation; the fix does not automatically rewrite already-imported journals or financial data.
