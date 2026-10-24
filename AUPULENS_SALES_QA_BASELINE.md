# Aupulens ERP — Sales Module QA Baseline

**Date**: 23 October 2026  
**Status**: BASELINE ESTABLISHED — IN PROGRESS  
**Active Git Branch**: `main`  
**Safe Test Environment**: Localhost isolated MongoDB on port `27183` (`QA_DISPOSABLE_MONGO_PORT=27183`, dbpath `/tmp/aupulens-qa-mongo`). No shared or production databases contacted.

---

## 1. Baseline Git Status & Working Tree Protection

- **Branch**: `main` (clean tracking branch from origin/main: `660d1080`)
- **Tracked Modifications Preserved**:
  - 43 uncommitted tracked files from prior AI assistant, memory, session indicator, and accounting isolation work.
  - All existing changes verified and preserved. No resets, cleanups, commits, or pushes will be performed without explicit authorization.
- **Untracked Artifacts Preserved**:
  - `AUPULENS_AI_*` reports, `scratch/`, `public/logo-white.png`, `lib/ai/commandAccess.ts`, `lib/sales/createQuote.ts`, `lib/sales/invoiceEligibility.ts`, `lib/sales/quoteValidation.ts`, `tests/ai/*`.
- **Git Diff & Whitespace**:
  - `git diff --check` passed cleanly with 0 errors.

---

## 2. Test Environment & Suite Baseline

- **Runtime & Framework**: Next.js 15.5.18, React 19, TypeScript 5, Node.js, Vitest 4.1.8.
- **Database**: Dedicated isolated MongoDB daemon on `127.0.0.1:27183` (PID: 283317).
  - Configured via `QA_DISPOSABLE_MONGO_PORT=27183` with dynamic per-suite test database naming (`tests/setup/disposableMongo.ts`).
  - Production database protection: Active. Ports other than disposable port are rejected by test harness.
- **Initial Sales Suite Baseline**:
  - Command: `QA_DISPOSABLE_MONGO_PORT=27183 npx vitest run tests/sales/`
  - Result: **20 test files passed (100%), 176 tests passed (100%), 0 failed, 0 skipped**.
  - Duration: 20.63s.
- **Lint Baseline**:
  - Command: `npx eslint lib/sales/ app/api/sales/ app/sales/ components/sales/ --max-warnings=0`
  - Result: **0 errors, 0 warnings**.

---

## 3. Discovered Code Paths for 16 Confirmed Bugs

| Bug ID | Severity | Title | Discovered Primary Code Paths |
|---|---|---|---|
| **SALES-BUG-001** | HIGH | Sales Dashboard 30-day revenue 9x inflated | `app/api/sales/summary/route.ts`, `lib/sales/dashboard.ts`, `app/sales/dashboard/page.tsx` |
| **SALES-BUG-002** | MEDIUM | Open pipeline value includes won/lost deals | `app/api/sales/pipeline/route.ts`, `app/api/crm/reports/pipeline-trend/route.ts`, `app/sales/pipeline/page.tsx` |
| **SALES-BUG-003** | HIGH | Invoice quantity prints incorrectly (2.5 -> 3) | `app/api/sales/invoices/[id]/pdf/route.ts`, `app/sales/invoices/print/[id]/page.tsx`, `lib/sales/templates/`, `components/sales/invoices/` |
| **SALES-BUG-004** | HIGH | Invoice taxable amount & adjustment incorrect | `lib/sales/invoiceMath.ts`, `app/api/sales/invoices/route.ts`, `app/api/sales/invoices/[id]/route.ts`, `components/sales/invoices/` |
| **SALES-BUG-005** | MEDIUM | Discount above 100% accepted | `lib/sales/invoiceMath.ts`, `lib/sales/quoteValidation.ts`, `app/api/sales/quotes/route.ts`, `app/api/sales/invoices/route.ts`, `components/sales/quotes/QuoteForm.tsx` |
| **SALES-BUG-006** | MEDIUM | Zero quantity accepted | `app/api/sales/quotes/route.ts`, `app/api/sales/invoices/route.ts`, `lib/sales/quoteValidation.ts`, `components/sales/quotes/QuoteForm.tsx` |
| **SALES-BUG-007** | MEDIUM | Saving invoiced quote resets status to Draft | `app/api/sales/quotes/[id]/route.ts`, `components/sales/quotes/QuoteForm.tsx` |
| **SALES-BUG-008** | MEDIUM | Quote search ignores customer names | `app/api/sales/quotes/route.ts`, `app/sales/quotes/page.tsx` |
| **SALES-BUG-009** | MEDIUM | Invalid customer email & phone accepted | `app/api/sales/customers/route.ts`, `app/api/sales/customers/[id]/route.ts`, `app/sales/customers/popup/CustomerPopup.tsx`, `models/sales/Customer.ts` |
| **SALES-BUG-010** | HIGH | Sales Orders missing from both order lists | `app/api/sales/orders/route.ts`, `app/api/sales/sales-orders/route.ts`, `app/sales/orders/page.tsx`, `app/sales/sales-orders/page.tsx`, `models/sales/SaleOrder.ts` |
| **SALES-BUG-011** | LOW | Sales lists use inconsistent date formats | `lib/utils/formatDate.ts` (or shared date utility), list components across sales pages |
| **SALES-BUG-012** | LOW | Invoice list amounts lack Indian digit grouping | `lib/utils/currency.ts` / `formatCurrency`, `app/sales/invoices/page.tsx`, `app/sales/quotes/page.tsx` |
| **SALES-BUG-014** | LOW | Print-Format Builder sample invoice math | `app/sales/print-format-builder/page.tsx`, `lib/sales/templates/` |
| **SALES-BUG-015** | LOW | Record Payment does not apply prefilled amount | `app/sales/payments/new/page.tsx`, `components/sales/payments/PaymentForm.tsx`, `app/api/sales/payments/route.ts` |
| **SALES-BUG-016** | LOW | Quote status filter shows lowercase label | `app/sales/quotes/page.tsx`, status filter dropdown options |

---

## 4. Discovered Code Paths for Unresolved Findings (S1–S6)

- **S1 (Duplicate invoices INV-0075 / INV-0076)**: `models/sales/SalesInvoice.ts`, `app/api/sales/invoices/route.ts`, `app/api/sales/quotes/[id]/convert-to-invoice/route.ts`.
- **S2 (Imported order SO-V3-81069 mismatch)**: `app/api/sales/sales-orders/import/execute/route.ts`, `models/sales/SaleOrder.ts`.
- **S3 (Accounting entries in product suggestions)**: `app/api/sales/products/route.ts`, `models/inventory/Product.ts`.
- **S4 (Pipeline stage & order status disagree)**: `app/api/sales/pipeline/transition/route.ts`, `lib/sales/pipelineDeals.ts`.
- **S5 (Customer receivables show zero)**: `app/api/sales/customers/[id]/route.ts`, `app/api/sales/summary/route.ts`, customer balances.
- **S6 (Past-due invoices not marked Overdue)**: `app/api/sales/invoices/route.ts`, `lib/sales/invoiceEligibility.ts`, status resolution.

---

## 5. Execution Plan

1. **Phase 2 Implementation**:
   - Fix High Severity Financial & Order Bugs: `SALES-BUG-003`, `SALES-BUG-004`, `SALES-BUG-001`, `SALES-BUG-010`.
   - Fix Medium Severity Validation & Lifecycle Bugs: `SALES-BUG-002`, `SALES-BUG-005`, `SALES-BUG-006`, `SALES-BUG-007`, `SALES-BUG-008`, `SALES-BUG-009`, `SALES-BUG-013`.
   - Fix Low Severity Formatting & Builder Bugs: `SALES-BUG-011`, `SALES-BUG-012`, `SALES-BUG-014`, `SALES-BUG-015`, `SALES-BUG-016`.
2. **Phase 3 Investigation**: Rigorous audit of S1–S6 and documented product decisions.
3. **Phase 4 Execution**: Automated test suites for all 15 previously untested scenarios.
4. **Phase 5 & 6**: Cross-cutting regression testing and responsive browser verification.
5. **Phase 7 & 8**: Full verification, TypeScript checks, and documentation generation.
