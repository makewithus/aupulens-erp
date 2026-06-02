# Aupulens ERP Phase 1 System Audit

Audit date: 2026-06-01
Repository root: `/home/krrish/Desktop/Aupulens-ERP/Aupulens-ERP-main`

This report documents the current architecture, module status, production-readiness risks, and remediation plan before large functional refactors.

## 1. Architecture Overview

### Runtime and stack

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, Shadcn-style UI primitives.
- Backend: Next.js API routes under `app/api`.
- Database: MongoDB via Mongoose models in `models`.
- Authentication: NextAuth v5 credentials provider, JWT session strategy.
- Authorization: middleware-level page gating plus per-route role checks.
- State management: Zustand stores in `store`.
- Desktop shell: Electron in `electron`.
- AI integrations: Google Gemini endpoints in several assistant routes.

### Main folders

- `app`: module pages and API routes.
- `app/api`: backend route handlers grouped by module.
- `components`: dashboard, accounting, finance, manufacturing, auth, UI primitives.
- `models`: Mongoose schemas for ERP documents and master data.
- `lib`: DB connection, tenant helper, logger, constants, utilities.
- `store`: client-side auth, tenant, and theme stores.
- `config/sidebar`: navigation definitions by role/module.
- `electron`: desktop shell.
- `amastermds` and `hrmodule.md`: existing feature/design notes.

### API route groups

- `accounting`: chart of accounts, Odoo-style invoices, invoice-from-order.
- `crm`: leads, opportunities, lead conversion, opportunity-to-customer conversion.
- `finance`: invoices, bills, expenses, assets, journal entries, transactions, reports, reconciliation, banking imports/statements, AI.
- `sales`: customers, products, pricelists, quotations, sale orders, legacy orders, proforma invoices, delivery challans, dashboards.
- `inventory`: stock, stock levels, warehouse, stock moves, stock transfers, manufacturing operations, batch, reports, analytics.
- `manufacturing`: BOM, shipments, freight, air freight, customs, HS codes, products, tracking, dashboards.
- `hr`: employees, departments, attendance, leave, payroll, summary, AI.
- `admin`: dashboard, tasks, reports, vendors, AI, accounting repair route.
- `master-admin`: tenant organization management.
- `auth`, `tenant`, `profile`, `users`, `activity-logs`, `debug`.

### Core models

- Accounting/finance: `Account`, `JournalEntry`, `Invoice`, `Transaction`, `Expense`, `Asset`, `BankStatement`, `BankReconciliation`, `PeriodClosing`, `Bill`.
- Sales/CRM: `Lead`, `Opportunity`, `Customer`, `Product`, `Pricelist`, `SaleOrder`, `SalesOrder`, `SalesQuotation`, `ProformaInvoice`, `DeliveryChallan`, `Order`.
- Inventory/manufacturing: `Stock`, `StockMove`, `StockTransfer`, `Warehouse`, `Batch`, `InventoryItem`, `BillOfMaterial`, `ManufacturingOrder`.
- Procurement/vendor: `Vendor`, plus vendor bills represented as `Invoice` with `moveType: "in_invoice"`.
- HR: `Employee`, `Department`, `Attendance`, `LeaveRequest`, `Payroll`.
- Platform: `User`, `Organization`, `ActivityLog`, `Task`, `ChatHistory`, `Project`.

## 2. Baseline Checks

### TypeScript

Command: `npx tsc --noEmit --pretty false`

Status: passing as of 2026-06-01 remediation pass.

Resolved error groups:

- Finance routes were aligned to the current `Invoice` schema (`name`, `partnerId`, `amountTotal`, `currencyId`, `state`, `paymentState`).
- Mongoose model exports were typed as stable `Model<T>` exports instead of broad cached-model unions.
- Finance chat routes were moved to the current NextAuth v5 `auth()` helper.
- Missing UI runtime dependency `framer-motion` was added.
- Server/session nullability issues were narrowed.
- `Stock` typing now includes reservation metadata used by inventory logic.
- UI chart, loading, and skeleton type mismatches were corrected.

### ESLint

Command: `npm run lint`

Status: passing as of 2026-06-01 remediation pass.

Resolved error groups:

- React effect dependency warnings were resolved in inventory/manufacturing pages and background animation components.
- Random render-time skeleton and animation values were replaced with deterministic placeholders.
- Empty UI interfaces were converted to type aliases.
- Electron CommonJS files now have an explicit lint override.
- The ESLint config was made compatible with Next 15 flat-config usage.

### Build configuration

`next.config.ts` no longer suppresses TypeScript or ESLint failures during production builds.

Command: `npm run build`

Status: passing with strict Next validation enabled.

### Dependency audit

Command: `npm audit --json`

Status: 0 vulnerabilities after safe package upgrades and transitive overrides.

Security dependency fixes:

- Upgraded `next` to `15.5.18`.
- Upgraded `next-auth` to `5.0.0-beta.31`.
- Upgraded `mongoose` to patched `8.24.0`.
- Added `baseline-browser-mapping` dev dependency to remove stale lint/build warnings.
- Added npm overrides for vulnerable transitive `brace-expansion` and `postcss` versions.
- Kept `eslint-config-next` aligned to `15.5.18`.

## 3. Authentication, Authorization, and Tenant Isolation

### Current implementation

- Credentials login in `auth.ts` validates email/password, tenant id, account status, organization active state, and role-specific auth portal.
- JWT session carries `id`, `role`, and `tenantId`.
- `middleware.ts` gates page routes by role and extracts tenant from subdomain into `x-tenant-id`.
- Most API routes call `auth()` and use `session.user.tenantId`.
- `lib/tenant-db.ts` attempts to provide tenant-aware model wrappers, but it is not consistently used.

### Fixed in remediation

- Activity logging now writes `tenantId`, and the activity log API filters by tenant.
- Tenant-owned API update/delete/read handlers were converted away from raw `findById`, `findByIdAndUpdate`, and `findByIdAndDelete` patterns. Remaining raw ID lookups are limited to master-admin tenant administration routes.
- User identity is now tenant-scoped at the schema and API level. `User.email` and `User.employeeId` use tenant compound uniqueness, registration creates users with `tenantId`, and credentials login searches inside the selected tenant before password validation.
- Public registration is limited to tenant bootstrap unless `ALLOW_PUBLIC_REGISTRATION=true`, preventing arbitrary admin creation in existing organizations.
- Tenant admins can no longer update another user's `tenantId`, `_id`, password, or created metadata through the user update API, and role updates reject non-tenant roles such as `master-admin`.
- The guarded `/api/debug/fix-indices` maintenance route now includes an explicit user index migration path: drop legacy global `email_1` / `employeeId_1` indexes and ensure tenant-scoped compound replacements.

### Remaining risks

- API authorization is still inconsistent. Some routes only check authentication, and granular role/permission enforcement is incomplete.
- Debug/admin repair APIs under `/api/debug` and `/api/admin/fix-accounting` are now guarded by maintenance access and hidden in production unless `ALLOW_MAINTENANCE_ROUTES=true`.
- Role-based permissions exist as a `permissions` field, but granular permission enforcement is not implemented.
- Existing databases that already created global unique indexes for `users.email` or `users.employeeId` must run the guarded index maintenance route during a controlled maintenance window before duplicate emails/employee IDs can be reused across different tenants.

## 4. Finance and Accounting Audit

### Completed or partially implemented

- Chart of accounts model supports account code, name, type, internal group, tenant, reconcile flag.
- Journal entry model supports journal header, voucher status, lines, totals, tenant, posting status, approval fields.
- Accounting invoice routes can create invoices and generate journal entries on approval/posting.
- Vendor bills are represented as `Invoice` records with `moveType: "in_invoice"` and AP-specific PO match fields.
- Expenses can create journal entries when posted.
- Payroll can create salary expense/payable and salary disbursement journal entries.
- Assets can create depreciation entries.
- Bank statements and reconciliation models/routes exist.
- Profit and Loss, Balance Sheet, and the generic finance report route now derive from posted journal entries instead of operational invoice/product totals.
- AR/AP aging now derives from posted receivable/payable journal lines and uses journal-line maturity dates where available.
- Journal-entry create/update flows now validate debit total equals credit total before posting and treat posted entries as immutable except through reversal-style workflows.
- Customer receipt and vendor payment actions now create posted receipt/payment journal entries, reduce invoice/bill residuals, and update payment state from the accounting workflow.
- Finance invoice/bill APIs now accept legacy receivable/payable UI payloads while persisting to the current `Invoice` schema.
- Finance summary, analytics, visualization, and finance AI endpoints now use posted journal lines for cash flow, income/expense series, ledger history, and category breakdowns.
- Journal creation for live accounting flows is now centralized through `lib/accounting/posting.ts`, which standardizes voucher numbering, posted status synchronization, ledger timestamps, rounded debit/credit lines, and balanced-line validation.
- Invoice, bill, payment, expense, asset depreciation, payroll, stock-move, and guarded accounting-repair workflows now create journal entries through the shared posting helper.

### Critical accounting gaps

- Finance is closer to the source of truth for reports, but operational workflows still do not consistently post every transaction through a central journal service.
- `Transaction` remains a legacy parallel ledger-like model. Core finance dashboards no longer depend on it, but the model and API should be retired or converted to a compatibility view.
- Journal posting now has a shared application service, but it still needs database-level safeguards, transaction/session support, reversal helpers, and full adoption for every future posting path.
- Payment workflow is partially implemented. Direct invoice/bill payment actions create double-entry journal entries and update residuals, but there is not yet a full bank-payment allocation/reconciliation UI for partial and multi-document payments.
- Sales invoices and finance invoices are split across `/api/accounting/invoices` and `/api/finance/invoices`, so workflow ownership remains unclear.
- AP bill posting now posts payable accrual before payment, but the purchase/procurement workflow still needs PO/GRN/Bill matching and unpaid-bill controls.
- Tax lines, bank transfer, and reversal workflows are not fully modeled. COGS/GRNI inventory accounting now exists for the `StockMove` accounting step, but `StockTransfer` and manufacturing flows still need unification.
- The chart of accounts is not hierarchical yet; there is no parent account field or seeded tenant COA.

## 5. Sales and CRM Audit

### Completed or partially implemented

- Customers/companies are modeled in Odoo-style `Customer`.
- Products, pricelists, quotations, sale orders, proforma invoices, delivery challans, and invoice-from-order routes exist.
- `SaleOrder` has `q2cStatus` fields for quote-to-cash flow and invoice linking.
- Sale order routes include some transition logic and fulfillment/revenue recognition metadata.
- Q2C sale-order transitions now write universal `DOCUMENT_STATUS` values instead of legacy `sent` / `sale` / `cancel` strings that conflict with the current schema.
- Sale order names are now tenant-scoped in the schema, with the guarded index repair route able to migrate the old global sale-order name index.
- CRM now has tenant-scoped `Lead` and `Opportunity` models with notes, follow-ups, owner assignment, stage/status transitions, and conversion links.
- Backend CRM APIs now support Lead creation/update/list/delete, Lead -> Opportunity conversion, Opportunity creation/update/list/delete, and Opportunity -> Customer conversion with existing-customer reuse by email.

### Missing or broken

- There is still no standalone `Contact` model; contacts are represented through `Customer` contact fields and CRM lead/opportunity contact fields.
- CRM backend workflow exists, but the sales UI still needs first-class Lead and Opportunity screens wired to the new `/api/crm` endpoints.
- There are duplicate sales document concepts: `SaleOrder`, `SalesOrder`, `Order`, `SalesQuotation`, and `ProformaInvoice` use different schemas and field names.
- Sales document status values are partly migrated to universal document statuses. The primary Q2C sale-order transition route is fixed, but older pages/routes may still expect legacy values such as sent/sale/done/cancel or paid/unpaid.
- Invoice generation from sale order creates a draft invoice, but fulfillment, delivery, inventory, payment, and revenue recognition are not reliably chained.
- PDF/print support exists for sales invoices, but it depends on invoice data consistency.

## 6. Inventory Audit

### Completed or partially implemented

- `Stock` provides stock ledger entries.
- `StockTransfer` supports incoming/outgoing/internal operations with QC, GRN, pick/pack/dispatch fields.
- `StockMove` supports a staged move workflow with valuation/accounting metadata.
- `Warehouse`, `Batch`, inventory analytics, stock pages, receipt/delivery screens, returns, and stock levels endpoints exist.
- `StockMove` now creates posted accounting entries on the Accounting Created step: incoming moves debit Inventory and credit GRNI, outgoing moves debit COGS and credit Inventory, and valuation must be positive before posting.

### Missing or broken

- Inventory has two competing movement engines: `StockTransfer` and `StockMove`.
- `Stock` has only `warehouse` as a string, so warehouse-level balances are weak and not referentially safe.
- `availableStock` matches `product` against a string instead of an ObjectId; availability checks can be incorrect.
- Reservations are represented as `Stock` rows with `type: "out"` and `isReserved: true`; the TypeScript interface now includes this field, but the reservation model remains operationally fragile.
- Outgoing transfer posts stock-out only when moving from `posted` to `closed`; this makes "posted" not mean inventory has actually moved.
- Incoming `StockTransfer` receipts still update stock without GL posting; `StockMove` receipt/issue accounting is implemented but the two movement engines are not yet unified.
- Inventory valuation is partially authoritative for `StockMove`; product standard cost and `StockTransfer` valuation still need reconciliation to GL.
- No negative stock prevention or transactional guarantees around stock posting.

## 7. Procurement Audit

### Completed or partially implemented

- Vendor model and vendor UI/API exist under admin.
- Vendor bills exist through `Invoice` with `moveType: "in_invoice"`.
- Incoming stock receipt flow creates GRN-like numbers.

### Missing

- No Purchase Order model/API/page was found.
- No dedicated Goods Receipt model linked to PO/bill; `StockTransfer` has GRN fields but no PO matching foundation.
- Vendor payment workflow is not fully modeled as a bank/payment voucher.
- Procurement -> stock receipt -> vendor bill -> vendor payment is incomplete.

## 8. Manufacturing Audit

### Completed or partially implemented

- BOM and manufacturing order models exist.
- Manufacturing order has Plan-to-Produce statuses.
- Component consumption and finished goods stock updates exist in the manufacturing PATCH route.

### Missing or broken

- Manufacturing stock movements write `Stock` rows directly, not through a unified inventory movement service.
- There is no manufacturing accounting for WIP, raw material consumption, finished goods capitalization, or variance.
- No transactional posting guarantees around component issue and finished good receipt.
- Component reservation/shortage checking is mostly metadata and not fully enforced.

## 9. HR Audit

### Completed or partially implemented

- Employees, departments, attendance, leave, payroll, lifecycle statuses, and payroll status transitions exist.
- Attendance locking and payroll computation are implemented.
- Payroll creates accounting entries for salary expense and salary payable, then salary payable and bank.

### Missing or broken

- Payroll accounting now blocks status transition when salary expense or disbursement journal creation fails.
- Payroll posts gross salary payable but disburses net salary, leaving statutory deductions/payables unmodeled.
- Attendance uses fixed 26 working days instead of calendar/holiday policy.
- Employee lifecycle transitions are defined in constants but not consistently enforced in APIs.

## 10. Reporting Audit

### Current reports

- Profit and Loss route reads posted journal entries.
- Balance Sheet route reads posted journal entries and validates the accounting equation with current-year earnings.
- Generic finance report route reads posted journal entries for balance sheet, income statement, and cash-flow style summaries.
- Aged receivable/payable route reads posted journal entries and allocates unapplied credits against oldest open items.
- Finance dashboard/analytics/visualization routes read posted journal entries for cash flow, income/expense, debit/credit, and category data.
- Admin report generator builds HTML from invoices, stock transfers, assets, etc.
- Finance ledger/voucher UI exists around journal entries.

### Remaining required correction

All financial reports must be generated from posted `JournalEntry.lineIds`, not operational documents. The remaining non-ledger reports cannot guarantee:

- Debit total equals credit total.
- Assets equals liabilities plus equity.
- AR/AP balances reconcile to invoices unless source workflows write maturity/reconciliation metadata to journal lines.
- Inventory value reconciles to GL.
- Payroll and expense accruals are included consistently.

## 11. Database Audit

### Positive findings

- Most tenant-owned models include `tenantId` and indexes.
- Several models define useful compound indexes, such as employee code per tenant and department code per tenant.
- Mongoose timestamps are widely used.

### Risks

- Many uniqueness constraints are global instead of tenant-scoped: examples include sale order names, stock move references, bill numbers, delivery challan numbers. User email and employee ID have been converted to tenant-scoped compound indexes in the schema, but existing MongoDB deployments need legacy index cleanup.
- Raw `findById`, `findByIdAndUpdate`, or `findByIdAndDelete` usage has been removed from tenant-owned API routes; master-admin tenant administration still uses global ID operations intentionally.
- Cached Mongoose model deletion was removed from the reviewed models; exports now use stable cached models with explicit typing.
- Operational documents store references as strings or mixed types in important areas (`warehouse`, pricelist/payment terms, vendor ids, stock references).
- No migration framework or seed scripts were found.
- No orphan-record checks or data integrity jobs were found.

## 12. API Audit

### Current strengths

- Most API routes perform at least session authentication.
- Many list routes include tenant filters.
- Some workflow APIs validate status transitions.

### Risks

- No centralized API guard for auth, role, tenant, validation, rate limiting, and error response format.
- Input validation is mostly manual and shallow; `zod` is installed but not broadly used.
- No rate limiting on login, AI routes, report generation, or mutation-heavy endpoints.
- Many APIs return raw error messages to clients.
- Some routes log sensitive operational data to console.
- Debug and repair routes now return 404 in production unless explicitly enabled with `ALLOW_MAINTENANCE_ROUTES=true`; enabled maintenance routes still require an allowed authenticated role.

## 13. Performance Audit

### Risks

- Dashboard/report routes perform broad collection scans and in-memory reductions.
- Several pages call multiple fetches on mount with no request de-duplication or caching strategy.
- Reports are generated from operational documents and products instead of indexed ledger balances.
- AI routes are large and mix prompt handling, data retrieval, and external calls.
- No pagination exists on several list endpoints.
- Console logging in dashboard/report routes can degrade production performance and leak data.

## 14. Testing Audit

Vitest has been added as the project test harness with an initial accounting-focused suite.

Current automated coverage:

- Journal line totals, balance detection, and posting validation.
- Shared journal posting payload normalization for posted vouchers.
- Invoice/bill payment-state derivation for paid, partial, overdue, and not-paid cases.
- CRM lead/opportunity transition rules and probability clamping.

Required coverage still absent for:

- Multi-tenant access isolation.
- Role and permission enforcement.
- Journal entry balancing and immutability.
- Invoice/payment/AP/AR workflows.
- Inventory receipt/delivery/transfer valuation.
- Manufacturing component/finished-goods accounting.
- HR attendance/payroll accounting.
- Financial reports and accounting invariants.

## 15. Production Readiness Status

Current status: not production-ready.

Cleared readiness gates:

- TypeScript check passes.
- ESLint passes.
- Production build passes with strict TypeScript/ESLint validation.
- Dependency audit reports 0 vulnerabilities.
- Tenant-owned API routes no longer use raw ID updates/deletes without tenant filters in the reviewed route set.
- Core financial reports now read posted journal entries.
- Direct customer receipt and vendor payment actions now post balanced journal entries.
- Finance dashboards and analytics no longer rely on the legacy `Transaction` collection for cash flow and income/expense metrics.
- Debug and accounting repair endpoints are production-hidden behind a shared maintenance guard.
- Stock Move accounting now posts balanced Inventory/GRNI or COGS/Inventory journal entries from move valuation.
- User registration, login lookup, owner creation, and employee/user uniqueness are now tenant-scoped, and public registration is blocked for non-empty tenants unless explicitly enabled.
- All direct `JournalEntry.create` / `new JournalEntry` usage in application and maintenance routes has been replaced by the shared accounting posting service.
- Vitest is configured and the first accounting/CRM invariant tests pass.
- Lead -> Opportunity -> Customer backend workflow is implemented through tenant-scoped CRM APIs.

Remaining blockers:

- Finance posting is still split between invoices, transactions, products, assets, and journal entries in several operational workflows.
- Tenant isolation still needs automated tests and a centralized API guard.
- Critical workflows are incomplete or duplicated across sales, procurement, inventory, manufacturing, and HR; CRM backend workflow exists but still needs UI integration.
- Automated tests exist but remain narrow.
- Some admin/operational reports do not yet reconcile from accounting records.
- Debug and repair endpoints are still present but production-hidden; they should eventually move to a signed maintenance job or migration framework.
- Tenant-scoped user uniqueness requires the guarded MongoDB index maintenance route to be run for existing databases that already have global unique `email_1` or `employeeId_1` indexes.

## 16. Prioritized Remediation Plan

### P0 - Stabilize build and tenant/security boundaries

1. Fix Mongoose model export typing and stale schema/interface mismatches. Status: completed for the audited model set.
2. Add missing runtime dependencies or remove unused UI components. Status: completed for `framer-motion`.
3. Fix NextAuth v5 API usage. Status: completed for the finance chat routes found during audit.
4. Patch tenant leaks in update/delete/read endpoints. Status: completed for reviewed tenant-owned API routes.
5. Fix activity logging tenant writes and filtering. Status: completed.
6. Disable or harden debug/repair routes for production. Status: completed with maintenance guard.
7. Remove production build bypasses after checks pass. Status: completed.
8. Fix tenant-scoped user onboarding, login lookup, and user uniqueness. Status: completed at application/schema level; existing database indexes still require migration.

### P1 - Accounting engine

1. Create a central journal posting service. Status: completed for discovered direct journal creation paths.
2. Enforce balanced journal entries before create/post. Status: completed in shared posting service and journal-entry routes.
3. Make posted entries immutable outside reversal entries. Status: partially complete in journal-entry update routes; reversal workflow still needed.
4. Seed hierarchical tenant chart of accounts.
5. Move all financial reports to posted journal lines.
6. Standardize invoice, bill, receipt, payment, expense, payroll, asset, and inventory posting through the journal service.

### P2 - Inventory engine

1. Choose one canonical movement engine or create a service that wraps `StockTransfer`, `StockMove`, and `Stock`.
2. Enforce ObjectId product/warehouse references.
3. Add transaction-safe posting for stock receipt, issue, transfer, reservation release, and adjustment. Status: partially complete for `StockMove` accounting.
4. Connect inventory valuation to GL using Inventory, GRNI, and COGS accounts. Status: partially complete for `StockMove`.

### P3 - Workflow completion

1. Implement CRM Lead and Opportunity entities and conversion to Customer. Status: backend complete; UI integration pending.
2. Implement Purchase Orders and proper PO/GRN/Bill matching.
3. Complete customer receipt and vendor payment flows.
4. Complete manufacturing WIP and finished goods accounting.
5. Tighten HR lifecycle and payroll statutory deduction accounting.

### P4 - Testing and deployment readiness

1. Add unit tests for accounting and inventory services.
   Status: started for accounting journal validation, posting payloads, and payment-state derivation.
2. Add API integration tests for tenant/role isolation.
3. Add workflow tests for sales, procurement, inventory, manufacturing, HR, and finance.
4. Add report reconciliation tests.
5. Add production deployment checklist and environment validation.

## 17. Remediation Log - 2026-06-01

### Root causes addressed

- TypeScript instability came from stale schema assumptions, broad Mongoose cached-model inference, and incomplete dependency/auth migrations.
- Lint/build instability came from render-time nondeterminism, stale flat-config imports, and suppressed production validation.
- Security audit noise came from outdated direct dependencies and vulnerable transitive lockfile versions.
- Exposed maintenance endpoints were a production data-disclosure and mutation risk.
- Tenant isolation defects came from direct ID-based mutations that bypassed `tenantId` filters.
- User onboarding defects came from creating users without `tenantId`, looking up credentials by global email, and enforcing global unique user email/employee IDs in a multi-tenant system.
- Financial report inconsistency came from reports reading operational documents instead of posted accounting entries.
- CRM workflow incompleteness came from using sale-order Q2C status as a partial stand-in for first-class lead/opportunity records.

### Fixes implemented

- Restored strict build gates by removing Next build bypasses.
- Converted model exports and route handlers enough for strict TypeScript to pass.
- Added accounting report helpers that aggregate posted journal lines by account group.
- Updated P&L, Balance Sheet, and generic finance report APIs to use posted journal entries.
- Updated AR/AP aging to use posted receivable/payable journal lines, with credit allocation against oldest open items.
- Added journal-line maturity/source metadata and populated it during invoice and bill posting.
- Added a payment posting helper that creates receipt/payment vouchers from posted invoices and vendor bills.
- Changed finance invoice and bill payment APIs to post journals and recalculate residual/payment state instead of only flipping status fields.
- Allowed AP bills to post to the ledger before payment so unpaid payables appear in ledger aging.
- Added ledger reporting helpers for posted cash flow, debit/credit series, income/expense series, and account-group category breakdowns.
- Updated finance summary, analytics, visualization, and AI endpoints to use posted accounting entries instead of the legacy `Transaction` collection for core financial metrics.
- Added a shared maintenance guard and applied it to debug/accounting repair endpoints so they are inaccessible in production unless explicitly enabled.
- Added inventory accounting posting for the `StockMove` Accounting Created step, including account resolution, valuation validation, and balanced journal creation.
- Added `lib/accounting/posting.ts` as the shared journal-entry posting path for voucher numbering, posted status synchronization, ledger timestamps, and debit/credit validation.
- Refactored invoice, bill, payment, expense, asset depreciation, payroll, stock move, and accounting repair journal creation to use the shared posting helper.
- Changed payroll accounting failures from log-and-continue to blocking API errors so HR payroll status cannot advance without the corresponding ledger entry.
- Fixed the guarded accounting repair route to allocate invoice gross totals across line accounts so repaired invoice/bill entries remain balanced even when tax is present.
- Converted user email and employee ID uniqueness to tenant-scoped compound indexes in the Mongoose schema.
- Updated credentials login to resolve standard users by `email + tenantId` and master-admin users only through the master portal.
- Updated public registration to always assign a tenant, optionally create a tenant organization, and block additional public admin creation once a tenant already has users unless explicitly enabled.
- Hardened master-admin tenant creation by normalizing subdomains, validating DNS-safe slugs, and creating the owner in the normalized tenant.
- Hardened user create/update APIs with tenant-scoped duplicate checks and blocked tenant/identity metadata mutation through user updates.
- Extended the guarded index repair route to migrate legacy global user indexes to tenant-scoped user email and employee ID indexes.
- Fixed Q2C sale-order transitions to use universal document statuses and converted sale-order names to tenant-scoped uniqueness.
- Added tenant-scoped CRM `Lead` and `Opportunity` models with notes, follow-ups, owner assignment, status/stage transition rules, and conversion references.
- Added `/api/crm/leads`, `/api/crm/leads/[id]`, `/api/crm/leads/[id]/convert`, `/api/crm/opportunities`, `/api/crm/opportunities/[id]`, and `/api/crm/opportunities/[id]/convert`.
- Implemented Lead -> Opportunity and Opportunity -> Customer conversion, including existing-customer reuse by email and source-lead customer backfill.
- Added Vitest plus initial accounting tests for balanced journal validation, posting payload normalization, and payment-state derivation.
- Added CRM workflow tests for lead/opportunity transitions and probability normalization.
- Added journal-entry validation for balanced debit/credit totals before posting.
- Strengthened posted journal immutability in journal-entry update routes.
- Tenant-scoped tenant-owned API mutations and activity logs.
- Upgraded `next`, `next-auth`, and `mongoose`, added a current browser-baseline package, and pinned safe transitive dependency overrides.
- Kept `eslint-config-next` aligned with Next 15 and adapted ESLint flat config through `FlatCompat`.

### Validation evidence

- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 3 test files / 11 tests.
- `npm audit --json`: 0 vulnerabilities.
- `npm run build`: passed on Next.js 15.5.18 with strict lint/type validation.

### Remaining high-priority work

- Extend the shared journal posting service with reversal entries, Mongoose transaction/session support, and manufacturing/WIP posting patterns.
- Add database transactions/session support around document status changes plus journal creation, so operational documents and ledger entries commit atomically.
- Complete bank-payment allocation UI, multi-document payment matching, and reconciled-line marking.
- Retire or quarantine the legacy `Transaction` API/model after remaining consumers are converted.
- Unify `StockTransfer` and `StockMove` so all inventory receipts, issues, transfers, and adjustments post through one stock and accounting service.
- Wire CRM Lead and Opportunity UI screens to the new backend workflow.
- Add Purchase Order and PO -> GRN -> Bill -> Payment matching.
- Unify inventory movement and valuation posting with GL.
- Add automated tests for accounting invariants, tenant isolation, and end-to-end module workflows.
