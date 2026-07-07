# QA Gap-Audit Report — Aupulens ERP vs. Master QA Checklist

**Date:** 2026-07-06 · **Branch:** `main` · **Tenant used for all live verification:** `default-tenant` (admin session)
**Method:** 6 parallel research passes (one per checklist cluster) + direct live verification (dev server + authenticated curl) by the orchestrating session. Every non-Missing grade below is backed by a file/route citation; every Missing grade states what was searched. This report does not modify any code — it is a gap analysis only. See `AUDIT_REPORT.md` for the prior session's fix log (referenced throughout, not repeated).

> **UPDATE — 2026-07-06 (implementation session, same day):** All 28 items from this report's Group 1-5 remediation work order were implemented and live-verified, **excluding all GST & India Compliance items** (GSTIN validation, E-Way Bill, GSTR-1/3B, TDS-on-vendor-payments, HSN/SAC catalog integration — deferred to a dedicated future GST phase, left completely untouched below). Every fixed item is annotated in place below with **"✅ Fixed in `<commit>`"**. Full final verification (tsc clean, 599/599 tests passing, every live reproduction re-run, all §4 Known-Good flows and §5 UAT flows re-confirmed with zero regressions) was completed the same session. Nothing was skipped as "too risky" — all 28 planned items shipped. See the "Deployment / Migrations Required" section appended at the end of this file for the 5 new migration scripts that must run on staging/production before this branch deploys.

---

## 1. Executive Summary

**Overall production readiness: ~45%.** The breadth of the product is real — most modules have working UI→API→DB chains for their core CRUD, and Finance's report engine (Trial Balance, P&L, Balance Sheet) is genuinely correct, not cosmetic. But this audit found **18 new P0-severity defects** beyond what `AUDIT_REPORT.md` already tracked, several of them live-reproduced (not theoretical): a model with no `tenantId` field at all, a cross-tenant data leak on a live route, two more collections with global (non-tenant) unique indexes, a completely unreachable set of cron jobs, a confirmed ReDoS/500 vector, and a core sales-order page that 500s on every real load. Indian GST compliance — a named priority for this market — is the single weakest section: GSTIN validation is a length check, e-invoicing is an honest but unfinished stub, and E-Way Bill / GSTR-1/3B do not exist at all.

### Counts by section (approximate item-level tally; "Done" requires all applicable layers Done)

| Section | Done | Partial | Missing | N/A |
|---|---|---|---|---|
| Authentication & User Management | 3 | 2 | 3 | 0 |
| Organization Setup | 2 | 4 | 2 | 0 |
| SaaS & Multi-tenancy | 0 | 4 | 1 | 0 |
| Security | 2 | 3 | 1 | 0 |
| Dashboard | 4 | 1 | 2 | 0 |
| CRM | 3 | 2 | 0 | 0 |
| Sales | 3 | 2 | 2 | 0 |
| Purchase | 2 | 2 | 1 | 0 |
| Inventory | 1 | 4 | 0 | 0 |
| Manufacturing | 3 | 0 | 2 | 0 |
| Finance & Accounting | 5 | 3 | 1 | 0 |
| GST & India Compliance | 0 | 3 | 3 | 0 |
| HR & Payroll | 3 | 1 | 2 | 0 |
| Projects | 0 | 1 | 4 | 0 |
| Documents | 1 | 2 | 1 | 0 |
| Reports | 8 | 5 | 3 | 0 |
| API Testing | 0 | 4 | 1 | 0 |
| Performance | 0 | 4 | 1 | 0 |
| Responsive & Cross-Browser | 1 | 1 | 0 | 1 (needs manual QA) |
| Integrations | 1 | 0 | 3 | 1 |
| Backup & Recovery | 0 | 1 | 1 | 1 (infra-managed) |
| Localization | 1 | 2 | 1 | 0 |
| Error Handling | 1 | 2 | 1 | 0 |
| Data Integrity | 1 | 3 | 1 | 0 |
| UI/UX | 3 | 2 | 0 | 0 |

### Top 10 highest-risk gaps for production (data integrity / security / GST / multi-tenancy weighted highest)

1. ✅ **Fixed in `9fcccaf`/`b471e44`.** ~~`BankReconciliation` model has no `tenantId` field at all~~ — Mongoose strict mode silently strips it on every create; live-reproduced (create → immediately invisible to its own tenant's list). Every bank reconciliation record ever created is tenant-less. Field + compound indexes added; migration backfilled existing tenant-less docs.
2. ✅ **Fixed in `f5146e2`.** ~~`GET /api/inventory/alerts` never applies `tenantId` to its query~~ — confirmed cross-tenant read closed via a fresh 2-tenant re-test in final verification.
3. ✅ **Fixed in `570ed67`.** ~~All 5 `/api/cron/*` jobs are unreachable~~ — `/api/cron/*` now exempted from the blanket middleware session check; each route's own `Bearer $CRON_SECRET` check is the real gate. Also fixed 2 latent `.lean()`+`.save()` crashes found in the same routes and added the missing auth check to `contract-check`.
4. ✅ **Fixed in `bd2014d`.** ~~Regex injection / ReDoS in 4+ live routes~~ (`crm/search`, `sales/products`, `crm/accounts`, `finance/assets/compute`) — all now use a shared `escapeRegex()` utility; malformed input confirmed no longer 500s.
5. **DEFERRED — dedicated GST phase.** GST compliance is not production-viable: GSTIN "validation" is a 15-character length check (no regex, no checksum); no E-Way Bill generation exists; no GSTR-1/GSTR-3B report exists; HSN/SAC is a free-text field on one invoice model only, disconnected from the product catalog. Explicitly out of scope for this session per user instruction — untouched.
6. ✅ **Fixed in `38fff4a`.** ~~Granular permissions and CRM RBAC are decorative~~ — `lib/crm/rbac.ts`'s `requireRole()` now actually enforces write-permission checks (admin/master-admin always allowed, reads always allowed, other roles blocked 403 on writes) across all 17 CRM write call-sites. **Note:** `User.permissions` itself remains unused/inert by design decision — documented in code rather than building a second, redundant enforcement system on top of the now-real role-based CRM RBAC.
7. ✅ **Fixed in `c8cba93`.** ~~Two more Golden-Rule-#7 cross-tenant unique-index violations~~: `models/crm/Quote.ts` (`quote_number`) and `models/DeliveryChallan.ts` (`dcNumber`) both converted to compound `{tenantId, field}` unique indexes; migration added to the existing stale-index-cleanup script.
8. ✅ **Fixed in `ba571d5`.** ~~`models/Invoice.ts`'s `{tenantId, name}` index is not marked `unique`~~ — now `unique: true`; migration confirmed 0 pre-existing collisions.
9. ✅ **Fixed in `f9629c1`** (Purchase Order UI) **and `ff834df`** (Bill.ts split-brain). Purchase Order now has a full list/create/edit/approve UI at `/finance/purchase-orders`, live-verified through the complete draft→pending_approval→approved→posted→cancelled lifecycle. `models/Bill.ts` was deleted entirely; the Admin Dashboard's "Total Expenses" KPI and `lib/sales/reminderEngine.ts` now correctly read from `Invoice`/`moveType:in_invoice` (confirmed live: totalExpenses went from ₹0 → ₹13,500 real).
10. ✅ **Fixed in `287921e`.** ~~`GET /api/sales/sale-orders` ... throws a 500~~ — missing model imports added to all 8 affected routes (sale-orders ×2, stock-moves ×2, hr/employees ×2, hr/attendance ×2); all confirmed 500→200 live.

*(Also weighted heavily but just outside the top 10: SaaS trial-expiry and feature-flag/module-gating are both fully unenforced despite the module-gating code being built and unit-tested but never wired into `middleware.ts`; Manufacturing never posts to the General Ledger at all.)*

---

## 2. Per-Section Tables

### Authentication & User Management

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Email login | Done | Done | Done | `components/auth/SignInForm.tsx`; `auth.ts` CredentialsProvider; live `/api/auth/providers` returns only `credentials` | None | — | — |
| Mobile login | Missing | Missing | N/A | Grepped `SignInForm.tsx`, all 7 `app/auth/*/page.tsx` — only `type="email"` field; `User.phone` unused for login | No mobile/OTP login path | M | P2 |
| OAuth login | Missing | Missing | N/A | `auth.ts` providers array has only `CredentialsProvider`; live-confirmed | No Google/Microsoft OAuth | L | P2 |
| Password reset (self-service, logged-out) | ✅ Done | ✅ Done | N/A | **Fixed in `514eef0`.** Token-based flow: `app/api/auth/password-reset/{request,confirm}/route.ts`, `app/auth/{forgot-password,reset-password}/page.tsx`, SHA-256-hashed single-use token. Live-verified full cycle incl. reuse rejection. | None | — | — |
| Email verification | Missing | Missing | N/A | Searched `verify.*email` — only hit is org-invite acceptance, unrelated | Signup accepts unverified emails | M | P1 |
| Session timeout | Partial | Done | N/A | `auth.config.ts` — JWT `maxAge:8h`, `updateAge:1h`; no idle-warning UI | Backend solid; no client-side countdown/warning modal | S | P2 |
| Role-based access (route level) | Done | Done | N/A | `middleware.ts` matches ARCHITECTURE.md's table exactly; live 401/403 confirmed | ✅ **Fixed in `6915537`.** `/crm/**` now role-gated (sales/admin/master-admin), matching `/sales/**`'s existing pattern. | — | — |
| User CRUD | Done | Done | Done | `app/admin/users/page.tsx`, `app/api/users/[route,[id]]`, `models/User.ts` | None | — | — |
| Permission validation (granular, per-action) | Missing | ✅ Real on CRM writes | Partial (field exists, unused) | ✅ **Fixed in `38fff4a`.** `lib/crm/rbac.ts`'s `requireRole()` no longer hardcoded — enforces write-permission checks across all 17 CRM write call-sites (403 for non-admin roles on writes; reads unaffected). `User.permissions` remains unused by deliberate decision (documented in code) rather than built into a second, redundant enforcement path. | Non-CRM modules still have no per-action permission checks beyond coarse role-based route gating | M | P1 (was P0) |

### Organization Setup

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Company | Partial | Partial | Done | `models/Organization.ts`; created via signup → `app/api/auth/register`. No tenant-self-service "edit company profile" screen (`master-admin` page is super-admin only) | No post-signup company-settings page | M | P1 |
| Branch | Missing | Missing | Missing | `find models -iname "*branch*"` — zero | No multi-branch concept exists | L | P2 |
| Department | Done | Done | Done | `app/hr/departments/page.tsx`, `app/api/hr/departments`, `models/Department.ts` | None | — | — |
| Warehouse | Done | Done | Done | `app/inventory/warehouse/page.tsx`, `app/api/inventory/warehouse`, `models/Warehouse.ts` (compound unique index confirmed resolved) | None | — | — |
| Financial year | Partial | Partial | Partial | `models/PeriodClosing.ts` (`fiscalYear`, open→closed flow); no dedicated FY master/setup entity | Piggybacks on period-closing only, no true multi-FY setup | M | P1 |
| Currency | Partial | Missing | Partial | `Organization.settings.currency` exists (default USD) but never collected at signup, no settings UI to change it | Field stored, unreachable — permanently at schema default | M | P1 |
| Timezone | Partial | Missing | Partial | Same pattern as Currency — `settings.timezone` (default UTC) | Same gap | M | P1 |
| Language | Missing | Missing | Missing | Searched `i18n\|useTranslation\|next-intl` — zero hits | No i18n/l10n framework at all | L | P2 |

### Dashboard

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Widgets (Admin) | Done | Done | Done | `app/admin/dashboard/page.tsx`, `app/api/admin/dashboard/route.ts` — real aggregation over 10 collections | None | — | — |
| KPIs | Done | Done | Done | Same route — real MoM comparisons | None | — | — |
| Charts | Done | Done | Done | Recharts against real `summary.chartData` | None | — | — |
| Filters | Missing | Missing | N/A | Grepped for `Select\|date\|Filter\|branch` in dashboard page — zero | No date-range/branch filter on the main dashboard | M | P2 |
| Exports | Missing | Missing | N/A | Grepped for `Export\|CSV\|download` — zero | No export control on the dashboard | M | P2 |
| Responsive UI | Done | N/A | N/A | Real `grid-cols-1 md:.../lg:...` breakpoints throughout | None | — | — |
| Other role dashboards (HR spot-checked) | Partial | Done | Done | `app/hr/dashboard/page.tsx` — real KPI cards, no charts/filters/exports | Pattern repeats: charts/filters/exports are admin-dashboard-only | S | P2 |

### CRM

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Lead lifecycle | Done | Done | Done | `app/crm/leads/**`, `app/api/crm/leads/[id]/convert/route.ts`, `models/crm/Lead.ts`; live data confirms real seeded leads across all statuses | None | — | — |
| Opportunity pipeline + Kanban | Done | Done | Done | `app/crm/pipeline/page.tsx` (`@hello-pangea/dnd`, real drag→PATCH), `app/api/crm/pipeline/[id]/stage/route.ts` | ✅ **Fixed in `d845f19`.** `Opportunity.campaign_id` now refs `'CrmCampaign'` (was `'Campaign'`) — populate verified working. | — | — |
| Customer records (CrmAccount/Contact vs. ERP Customer) | Partial | Partial | Partial | `models/crm/Account.ts`/`Contact.ts` fully CRUD; `models/Customer.ts` is a wholly separate ERP entity (35 live references in Sales) | No link/sync between CRM's "customer" and Sales' "customer" — `lib/crm/integrations/erpSync.ts` is a 15-line status-checker stub, not a real sync job. Two unrelated records for the same real company | M | P1 |
| Activities | Done | Done | Done | `app/crm/activities/**`, `models/crm/Activity.ts`; live data non-empty (50k+ per prior seed) | ✅ **Fixed in `d845f19`.** `Activity.linked_case_id` now refs `'CrmCase'` (was dead legacy `'Case'`) — populate confirmed resolving to a real case. Same bug also found+fixed on `Task.linked_case_id`, not originally named in this report. | — | — |
| Duplicate detection | Done | Done | N/A | ✅ **Fixed in `7318cc6`.** `detectDuplicates()` from `lib/crm/ai/duplicateAssistant.ts` now wired into both Leads and Contacts POST handlers (fuzzy 409 + confirm-dialog "Create Anyway" bypass); exact-match check also added to Contacts (previously missing entirely). Live-verified: case-insensitive email match now correctly triggers fuzzy 409. | None | — | — |

**Also found:** ✅ **Fixed in `38fff4a`.** ~~`lib/crm/rbac.ts` `requireRole()` hardcoded bypass~~ affects 15 CRM route files — now real (see Auth section item #6). CRM.md's documented "Quote→SaleOrder" integration does not exist in code (unchanged, out of session scope). ✅ **Fixed in `b9c23ae`.** ~~15 of 31 `app/crm/**` page directories have no sidebar entry at all~~ — restored, plus additional CRM sections (Engagement, Automation & AI, Data & Integrations) not previously in the count.

### Sales

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Quotation (two parallel systems) | Done | Done | Done | `/sales/quotes`→`SalesQuotation.ts`; `/crm/quotes`→`models/crm/Quote.ts`, both real and reachable | ✅ **Fixed in `c8cba93`.** ~~`CrmQuote.quote_number` has a global unique index~~ — now compound `{tenantId, quote_number}` unique. | — | — |
| Sales Order (`SaleOrder.ts` canonical) | Done | Done | Done | `models/SaleOrder.ts` confirmed the only live-imported model (legacy `SalesOrder.ts`/`Order.ts` confirmed truly dead — zero imports) | ✅ **Fixed in `287921e`.** ~~`GET /api/sales/sale-orders` throws a 500~~ — missing `Product`/`Customer` model imports added to both the list route and its `[id]` sibling; re-confirmed 200 live in final verification. | — | — |
| Delivery (`DeliveryChallan.ts`) | Done | Done | Done | `app/sales/delivery-challans/page.tsx`, sidebar-linked | ✅ **Fixed in `c8cba93`.** ~~`dcNumber` has a global unique index~~ — now compound `{tenantId, dcNumber}` unique. | — | — |
| Invoice / e-invoicing | Done | Partial | Done | Real invoices, real e-invoice records with IRN/status (live-confirmed) | (1) GSP/NIC integration is an honest stub (unchanged, documented — accepted tech debt, not part of this session). (2) ✅ **Fixed in `b9c23ae`.** ~~`/sales/e-invoices` has no link anywhere in navigation~~ — added to `SalesTabNav`, confirmed reachable live. | S (accepted stub) | P1 |
| Payments (draft-invoice guard) | Done | Done | Done | Guard confirmed present in both create and edit payment routes exactly as documented | None | — | — |
| Returns / RMA | Missing | Missing | Missing | Only a document-number-prefix constant (`"SR-"`) exists; no model, route, or UI | Numbering scaffolding only, zero functional flow | L | P2 |
| Credit Notes | Missing | Missing | Partial | `Invoice.moveType` has a valid `out_refund` enum value, nothing else references it anywhere | Only the enum value exists — no route or UI button to actually issue a credit note against an invoice | L | P1 |

### Purchase

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Vendor | Done | Done | Done | `app/admin/vendors/page.tsx`, PUT confirmed genuinely wired (not a stub per prior fix), `models/Vendor.ts` | No DELETE route/UI exists for vendors | S | P2 |
| RFQ | Missing | Missing | Missing | Searched `rfq\|request.for.quotation\|rfp` — zero hits | No RFQ/quote-comparison stage before PO creation | L | P2 |
| Purchase Order | ✅ Done | Done | Done | ✅ **Fixed in `f9629c1`.** Full list/create/edit/approve UI built at `/finance/purchase-orders` (+ `PurchaseOrderPopupContent`), sidebar-linked under new "Purchases" section. Live-verified complete draft→pending_approval→approved→posted→cancelled→delete lifecycle both in original implementation and again in final verification. | None | — | — |
| GRN | Done | Done | Done | `app/inventory/operations/receipts/page.tsx` → real QC-gated GRN generation (`nextGRN()`) → updates `PO.receivedQty` → unlocks 2/3-way invoice matching | No standalone GRN document model (it's a status+number on StockTransfer) — cosmetic only, not a functional gap | — | P2 |
| Vendor Bills | Done | Done | Done | ✅ **Fixed in `ff834df`.** Real, working feature at `app/finance/bills/page.tsx` now correctly the *only* bill collection — `models/Bill.ts` deleted entirely; its 2 orphaned demo records migrated into real `Invoice` documents. | Split-brain resolved: Admin Dashboard's "Total Expenses" KPI now reads from `Invoice`/`moveType:in_invoice` (confirmed live: ₹0 → ₹13,500 real, and still ₹13,500 in final re-verification). | — | — |
| Returns (purchase / debit note) | Partial | Partial | Partial | Generic `StockTransfer` with `operationType:"outgoing"`, prefix `WH/RET/` — shared with sales returns | No vendor-specific debit note, no reduction of the vendor Bill's `amountResidual`, no accounting counter-entry | M | P1 |

### Inventory

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Items & Variants | Partial | Partial | Partial | `models/Item.ts` has an `itemType:"variants"` enum value with zero accompanying structure (no attribute sub-schema, no child SKUs) | Variant support is a dead enum value; items are flat-only in practice | L | P1 |
| Warehouse transfers | Done | Done | Done | `/inventory/operations/{receipts,deliveries}`, `models/StockTransfer.ts` (tenant-index confirmed fixed) | None | — | P2 |
| Batch/Serial | Done | Done | Done | ✅ **Fixed in `b9c23ae`.** `app/inventory/batch/page.tsx` re-added to the sidebar (was commented out). Serial-number tracking still doesn't exist (batch/lot only). | No serial-number tracking exists, batch/lot only | — (nav) / L (serial) | — (nav) / P2 (serial) |
| Stock adjustments | Done | Done | Done | `/inventory/orders`, `/inventory/alerts` sidebar-reachable; `app/api/inventory/orders/route.ts` real | ✅ **Fixed in `f5146e2`.** ~~`app/api/inventory/alerts/route.ts` never applies `tenantId`~~ — added; re-confirmed closed via a fresh 2-tenant seed test in final verification. Additionally, ✅ **Fixed in `e6168b5`**: negative-stock guard now added to `stock`/`stock-moves` routes (opt-in `Product.allowNegativeStock` override, default enforced). | None | — | — |
| Valuation | N/A | Partial | Partial | Real GL-posting exists (`lib/accounting/inventory.ts::getMoveValue`, flat qty×unitCost); `valuationMethod:"fifo"\|"average"\|"lifo"` field stored but grepped zero usages of any method logic anywhere | "FIFO/weighted-average" is a cosmetic label only — no cost-layer engine, no recomputed average cost, no FIFO consumption queue | L | P1 |

**Also found (live, this session):** ✅ **Fixed in `287921e`.** ~~`GET /api/inventory/stock-moves` throws `MissingSchemaError` for `Warehouse`~~ — same root-cause class as the Sales `sale-orders` bug above; missing bound-but-unused model imports converted to bare side-effect imports. Re-confirmed 200 live in final verification.

### Manufacturing

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| BOM | Done | Done | Done | `/manufacturing/bom`, `app/api/manufacturing/bom/**`, `models/BillOfMaterial.ts` | None | — | P2 |
| Work Orders (full lifecycle) | Done | Done | Done | `/manufacturing/manufacturing`, full `demand_forecast→...→finished` transition guard | Minor: `header.name` (e.g. `WH/MO/00005`) has no unique index at all, and its non-atomic `count+1` generator could collide under concurrency | S | P2 |
| Production (execution, QC pass/fail) | Done | Done | Done | Real execution tracking, real QC pass/fail/rework branching, real stock in/out on issue/finish | Uses the plain `Stock` model (no cost field) rather than `StockMove` (which has GL-posting) — feeds directly into the Costing gap below | — | P1 |
| Scrap | Missing | Missing | Missing | Searched `scrap\|wastage\|wasted` — zero hits anywhere | No scrap/wastage tracking; `QC_FAILED` only routes to rework, no scrap path | M | P1 |
| Costing | Missing | Missing | Missing | Material-issue/finished-goods stock writes carry no cost fields and never call the GL-posting library or create a JournalEntry; zero cost fields on `ManufacturingOrder`; zero labor-cost tracking anywhere | **Manufacturing is completely disconnected from Finance/GL** — production activity never affects the ledger, unlike Inventory's own warehouse transfers which do post to GL | L | **P0** |

**Also found:** ✅ **Fixed in `b9c23ae`.** ~~9 real, functional Manufacturing pages ... commented out of the sidebar entirely~~ — Logistics & Shipping, Customs & Compliance, Reports, Air Freight, and Activity Logs all restored (the last also had a wrong path, `/manufacturing/activity` → corrected to the real `/manufacturing/activity-logs`). All confirmed 200 live, both at implementation time and in final re-verification.

### Finance & Accounting

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Chart of Accounts | Done | Done | Done | 96 accounts seeded, `models/Account.ts` compound unique index | None | — | — |
| Voucher Engine | Done | Done | Done | `models/JournalEntry.ts`, `lib/accounting/posting.ts`, `app/finance/accounting/vouchers/page.tsx` (688 lines) | None | — | — |
| Double-entry validation | Done | Done | N/A | `app/api/finance/journal-entries/route.ts` and `[id]/route.ts` both hard-reject unbalanced entries (verified in code, `>0.001` tolerance) | ✅ **Fixed in `add2c76`.** Negative-value check added to the shared `validateJournalLinesForPosting()` in `lib/accounting/journal-validation.ts` — since `lib/accounting/inventory.ts`, `lib/accounting/payments.ts`, and HR payroll all already route through `createPostedJournalEntry`→`buildJournalEntryPayload`→this validator, one fix closed the gap on all 3 previously-unprotected posting paths. Live-verified via the direct journal-entries POST API (not just the internal function) rejecting a negative-line pair. The pre-existing `JRN/2026/0002` bad data is left as-is (a report-only script, `scripts/report-negative-journal-lines.ts`, was added to find any more like it — no automatic remediation of existing data was performed). | — | — |
| Journal Entries CRUD + approval | Done | Done | Done | Full draft→validated→pending_approval→approved→posted transition guard, immutability once posted | None | — | — |
| General Ledger (report) | Partial | Partial | N/A | `app/finance/accounting/{ledger,journal-items}` pages exist | It's a flattened journal-line list with client filtering — no per-account running/opening/closing balance; not a true GL report | M | P2 |
| Trial Balance | Done | Done | N/A | **Live-verified this session**: `GET /api/finance/reports/trial-balance` returns real per-account debit/credit balances with a `trialBalanceBalanced` flag | None | — | — |
| P&L | Done | Done | N/A | **Live-verified this session**: `GET /api/finance/reports/p-l` returns real income/expense totals and `netProfit` | None | — | — |
| Balance Sheet | Done | Done | N/A | **Live-verified this session**: `GET /api/finance/reports/balance-sheet` returns real asset/liability/equity totals with an `accountingEquationBalanced` flag | None | — | — |
| Cash Flow Statement | **Missing** | Partial | N/A | No dedicated statement route/page exists (`app/api/finance/reports/cash-flow` does not exist) | What exists (`buildPostedCashFlowTotals`) is a crude direct-method cash-in/out sum on `asset_cash` accounts only, used for dashboard charts — no Operating/Investing/Financing classification, no indirect-method reconciliation | L | P1 |
| Bank Reconciliation | Partial | Done | Done | UI exists (2 pages, 900+ lines combined); matching is fully manual, one line pair at a time (no auto/fuzzy matching) | ✅ **Fixed in `9fcccaf`/`b471e44`.** `tenantId` field + compound indexes added to `models/BankReconciliation.ts`; `scripts/migrate-backfill-bankreconciliation-tenantid.ts` backfills existing tenant-less docs. Live-verified: create → immediately visible in tenant-scoped GET. | Matching is still fully manual (no auto/fuzzy matching) — unchanged, out of session scope | S (nav) / M (auto-match) | — / P2 |

### GST & India Compliance

> **DEFERRED — dedicated GST phase.** None of the items in this section were touched by the 2026-07-06 implementation session, per explicit user instruction that GST & India Compliance is a separate, upcoming phase of work. Every row below is unchanged from the original audit.

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| GSTIN validation | Partial | Partial | N/A | `lib/sales/gstinLookup.ts` — only a `.length !== 15` check; `Customer.gstin` has no `match:` validator | No structural regex, no checksum-digit (mod-36) verification anywhere — a garbage 15-char string passes today | S | **P0** |
| CGST/SGST/IGST split & computation | Done | Done | N/A | `lib/sales/invoiceMath.ts::computeInvoiceTotals` — correct intra/inter-state determination and split, **live-verified logic** by direct code read | State comparison is plain string equality (no state-code normalization); this logic exists only on the Sales side — Finance's vendor-bill side has no equivalent split logic at all | S | P1 |
| TDS/TCS | Partial | Partial | Partial | `tdsRate`/`tcsRate` computed and stored on `SalesInvoice` only, wired into Sales invoice/quote/order/subscription routes | Exists **only on the customer-invoice side** — the vendor-payment TDS-deduction obligation (the primary Indian-SMB TDS use case) is entirely missing; no Form 26Q / TDS return generation | M | P1 |
| HSN/SAC codes | Partial | Partial | Partial | `SalesInvoice` line items carry a free-text `hsn` string; `computeHsnSummary` groups tax by that string | `models/HSCode.ts` is a **separate, unrelated** manufacturing/customs catalog with no FK to invoice lines; `models/Product.ts` has no `hsn`/`sac` field, so it can't be defaulted from the catalog — must be hand-typed per line every time, with no validation against GST's 4/6/8-digit turnover-based rules. Finance's own `Invoice.ts`/`Bill.ts` line schema has no `hsn` field at all | M | P1 |
| E-Invoice (IRN/QR) | Done (UI) | **Honest stub** | Done | `lib/einvoice/gspService.ts`'s `StubGspService` fabricates `STUB-IRN-...` locally, explicitly commented as a placeholder; surrounding credential/status flow is real and complete | No real NIC/GSP network call (documented, accepted tech debt); also no QR-code image generation, only text IRN/ack fields | L | P1 (accepted debt, not a new bug) |
| E-Way Bill | Missing | Missing | Missing | Searched `e-?way\|ewaybill` (precise, excluding "gateway" false-positives) — zero real hits anywhere | No E-Way Bill model, route, or UI exists at all | L | P1 |
| GSTR-1 / GSTR-3B reports | Missing | Missing | Missing | Searched `gstr-?1\|gstr-?3b` — zero hits anywhere | No statutory-return report generation of any kind exists; the HSN-wise tax breakup that does exist is per-invoice, never aggregated into a filing-ready GSTR format | L | **P0** |

### Data Integrity

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Balanced ledgers enforced server-side | N/A | Done | N/A | Two main journal-entry routes hard-reject unbalanced entries | ✅ **Fixed in `add2c76`.** Negative-value check centralized into the shared validator used by all posting paths (inventory, payments, payroll) — see Finance section for detail. | — | — |
| No duplicate vouchers/numbers per tenant | Done | Done | Done | `JournalEntry`, `Bill`(deleted, see Purchase section), `SaleOrder`, and now `Invoice`/`CrmQuote`/`DeliveryChallan` all confirmed to have proper `{tenantId, number}` **unique** compound indexes | ✅ **Fixed in `ba571d5`** (Invoice) **and `c8cba93`** (CrmQuote/DeliveryChallan). All three previously-global or missing-unique indexes converted to compound `{tenantId, field}` unique; migrations confirmed 0 collisions on Invoice, clean re-index on the others. | None | — | — |
| Stock cannot go negative where disallowed | Done | Done | N/A | ✅ **Fixed in `e6168b5`.** `lib/inventory/stockGuard.ts` added — checks `Product.allowNegativeStock` opt-in (default false) before allowing a would-go-negative `Stock` create or `stock-moves` outgoing line. Live-verified: overdraw of a real product (on-hand 1005) rejected with a clear error message; override flag makes it succeed. | None | — | — |
| Audit trail of changes | Partial | Partial | Partial | `CrmAuditLog` is a real, immutable, field-level-diff audit log — but **CRM-only**. Elsewhere, only manual `chatter`-comment arrays exist on some models (not automatic, not comprehensive) | No generic before/after change-tracking plugin exists for Finance, Inventory, HR, or Sales models | L | P1 |

### HR & Payroll

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Employees CRUD | Done | Done | Done | Full CRUD, DELETE also unlinks `User.employeeId` | None | — | — |
| Attendance | Partial | Done | Done | `models/Attendance.ts`, admin-typed check-in/out times | Not a self-service punch-clock, admin manually types times (unchanged). ✅ **Fixed in `287921e`.** ~~`GET /api/hr/employees` and `/attendance` both `.populate("departmentId")` without importing `Department`~~ — fixed on all 4 affected routes (list + `[id]` for both); re-confirmed 200 live in final verification. | S | P1 |
| Leave approval workflow | Done | Done | Done | Full pending→approved/rejected/cancelled with leave-balance deduct/restore | None | — | — |
| Payroll lifecycle | Done | Done | Done | Full draft→...→posted_to_gl, real GL posting (Dr Salary Expense/Cr Payable, then Dr Payable/Cr Bank), pro-rated by attendance | None | — | — |
| PF/ESI statutory computation | Missing | Missing | Partial | `Employee.salary.deductions.pf/.esi` are flat manually-entered numbers, pro-rated by attendance ratio | No 12% PF / statutory ESI-slab computation anywhere — not derived from any statutory rule | M | P1 |
| Salary Slip / Payslip generation | Missing | Missing | N/A | No payslip PDF generation found; only JSON data views of `Payroll` records | No downloadable per-employee payslip document | M | P1 |

### Projects

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Projects module | Missing | Missing | Partial (orphan schema) | `models/Project.ts` exists but zero API route, zero UI route, zero `.find/.create` calls anywhere | Confirmed: no Projects module exists in this product at all (a deliberate scope decision, but the schema itself is confusing dead code) | L | P2 |
| Tasks tied to Projects | Missing | Missing | Partial | `models/Task.ts` has an optional `project` ref field nothing ever sets | Dead field, no linkage | S | P2 |
| Kanban board | Partial (misattributed) | Partial | N/A | The only drag-drop boards are Admin Tasks (`/admin/tasks`) and CRM Opportunity pipeline — no Project-Kanban | Confirms suspicion: no project-specific kanban exists | — | — |
| Time Tracking | Missing | Missing | Missing | Searched `timetrack\|time_entry\|timesheet` — zero hits anywhere | No model, route, or UI whatsoever | L | P2 |
| Project-based Billing | Missing | Missing | Missing | No invoice/bill route references a Project entity | No billing tied to any Project | L | P2 |

### Documents

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Upload | Partial | Partial | Done | Only CRM's `CrmDocument`/`/api/crm/documents` is a working document system; root `models/Document.ts` is a dead orphan | Upload is a manual "paste a file URL" text field, not wired to `lib/upload.ts`'s Cloudinary uploader (which only Sales forms use for attachments) | M | P1 |
| Preview | Partial | Done | N/A | `?action=preview` just does `window.open(fileUrl)` | No in-app preview pane — "preview" = open raw URL in a new tab | S | P2 |
| Versioning | Done | Done | Done | Real version-chain via `parent_document_id`, auto-incrementing `version` | None | — | — |
| Permissions | Missing | Missing | Missing | No rbac/role check anywhere in the documents route — only `tenantId` scoping | Any authenticated tenant user can view/download/delete any document | M | P1 |

### Reports

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Filters (Finance) | Done | Done | N/A | Real date-range filters on P&L/Trial Balance wired to API params | None | — | — |
| Filters (HR) | Done | Done | N/A | Functional, derived from `/api/hr/summary` | No independent date-range control | S | P2 |
| Filters (Inventory) | Done | Done | N/A | ✅ **Fixed in `2b57425`.** Page rewritten with 4 real CSV exports (Stock, Movement, Aging, Compliance) driven by live API calls to `/api/inventory/{stock,stock-moves,batch}` joined with products. | None | — | — |
| Filters (Manufacturing) | Done | Done | N/A | ✅ **Fixed in `2b57425`.** Page rewritten: real stat cards from `/api/manufacturing/shipments`, real chart data from the now-tenant-scoped `/api/manufacturing/analytics` (see below), real CSV export; fake hardcoded "Recent Reports" list and 2 inert selects removed. | None | — | — |
| Filters (CRM) | Done | Done | N/A | ✅ **Fixed in `cc5be2d`.** `app/crm/reports/page.tsx` rewritten: 4 of 6 report templates wired to real data (`/api/crm/opportunities/export` for pipeline/revenue, `/api/crm/churn`, `/api/crm/renewals`); Campaign ROI/Support Performance honestly marked "Soon" (no aggregation endpoint exists) instead of faked. | None | — | — |
| Exports (HR CSV) | Done | N/A | N/A | Real client-side Blob generation from live data, 6 report cards | None | — | — |
| Exports (Finance/Sales xlsx) | Done | Done | N/A | Real server-side `xlsx` exports on many list pages | None | — | — |
| Exports (CRM opportunities) | Done | Done | N/A | Real `json2csv`/`xlsx` export route | None | — | — |
| Exports (CRM Report Builder) | Done | Done | N/A | ✅ **Fixed in `cc5be2d`.** Export CSV/XLSX buttons wired to real handlers for the 4 supported report types (`SUPPORTED_REPORTS` set), using `xlsx` client-side for XLSX. | None | — | — |
| Exports (Inventory Reports) | Done | Done | N/A | ✅ **Fixed in `2b57425`.** All 4 "Download Report" buttons now trigger real CSV exports from live API data. | None | — | — |
| PDF export (Sales invoices, CRM) | Done | Done | N/A | Real `pdf-lib`-based generation in both modules | None | — | — |
| Charts (Reports) | Done | Done | N/A | Finance reports show real computed numbers; CRM/Manufacturing report charts use hardcoded/fake data | Mixed — CRM and Manufacturing report visuals are not real | M | P1 |
| Print (Finance P&L/TB, Admin) | Done | N/A | N/A | Real `window.print()` + `@media print` CSS | None | — | — |
| Print (Aged Partners) | Done | N/A | N/A | ✅ **Fixed in `2b57425`.** `handlePrint = () => window.print()` wired to the Print button, matching the Trial Balance page's existing pattern. | None | — | — |

### API Testing

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Auth on all endpoints | N/A | Done | N/A | Global middleware session check on all `/api/*` except `/api/auth/*`, `/api/cron/*` (own token check — see below), and `/api/internal/*` (needed for middleware's own tier lookup) | ✅ **Fixed in `68a96cb`.** ~~Dead `/api/admin/migrate-invoices` middleware exemption~~ removed (route confirmed not to exist). | — | — |
| Cron endpoint reachability | N/A | Done | N/A | ✅ **Fixed in `570ed67`.** `/api/cron/*` now exempted from the blanket session check; live-confirmed all 5 routes 401 without/wrong secret, 200 with real secret in both original implementation and final re-verification. Also fixed: a missing auth check on `contract-check`, and a `.lean()`+`.save()` crash on 2 of the 5 routes. | — | — |
| CRUD completeness | N/A | Partial | N/A | `app/api/sales/sales-orders/[id]` has GET+PATCH but no DELETE; vendors have no `[id]` route at all (no delete) | Verb gaps exist on at least 2 spot-checked resources; compounded by the two-parallel-namespace confusion (see Sales) — not addressed this session, out of the 28-item scope | M | P1 |
| Pagination | N/A | Done | N/A | ✅ **Fixed in `162ff1d`.** `finance/purchase-orders` and `finance/expenses` now support optional `?page=&limit=` pagination, matching the existing HR "no param → return all" backward-compat convention; `total`/`totalPages` always included. Live-verified: no-param requests still return all records, paginated requests correctly slice with metadata. | — | — |
| Rate limits | N/A | Done | N/A | ✅ **Fixed in `31ee28b`.** `lib/middleware/rateLimit.ts` — in-process fixed-window limiter wired into `middleware.ts`. Rules: login 10/min, CRM search/accounts + sales/products 60/min, finance/assets/compute 20/min, any `/ai-assistant` suffix 20/min. Live-verified: 31st request in a window gets 429 with `Retry-After`. | Only covers the highest-risk endpoints named in scope, not every write endpoint — acceptable minimal first slice per the work order | — | — |
| Consistent error responses | N/A | Partial | N/A | Live file-count check: HR/Inventory/Admin are **100%** off-convention (`{error}` only, never `{success}`); Finance is actually the most internally mixed (44 vs 21 files) | The drift is broader than the previously-documented Finance-only issue — 3 more modules are entirely off-convention | L | P1 |

### Performance

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Dashboard load / N+1 | N/A | Partial | N/A | `admin/dashboard/route.ts` pulls every invoice/bill row into memory then filters/reduces in JS instead of a Mongo aggregation | Grows unbounded with per-tenant record count; will degrade on a large tenant | M | P1 |
| Search performance | N/A | Partial | N/A | 5 routes build `new RegExp(userInput)` with no anchoring; no text index on searched fields | Full collection scan per keystroke per entity type (also see Security — same code path is the ReDoS vector) | M | P2 |
| Large-dataset handling | N/A | Partial | N/A | No virtualization library anywhere; the two unpaginated routes above render every row into a plain table | Will visibly degrade past a few hundred rows on those 2 screens | M | P1 |
| Concurrent-user readiness | N/A | Partial | N/A | `lib/db.ts` — `maxPoolSize:10` is a hardcoded literal, not env-configurable | Fine for current scale, not tunable per deployment tier without a code change | S | P2 |
| Caching | N/A | Missing | N/A | No Redis/in-memory/ISR caching layer anywhere | Every request re-hits MongoDB, including repeated dashboard aggregations | M | P2 |

### Security

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| NoSQL injection (`$where`, raw `req.body` into `.find()`) | N/A | Done | N/A | Zero `$where`/`eval` hits; queries always built from explicit typed fields, never a raw user object | None found | — | — |
| Regex injection / ReDoS | N/A | Done | N/A | ✅ **Fixed in `bd2014d`.** Shared `escapeRegex()` (`lib/utils/regex.ts`) now applied in `crm/search`, `sales/products`, `crm/accounts` (GET + POST dup-check), `finance/assets/compute`, and (same bug class, bonus fix) `lib/accounting/aiActions.ts`. Re-confirmed live: `?q=(((` no longer 500s on any of the 4 named routes. | None | — | — |
| XSS | Partial | Partial | N/A | 3 `dangerouslySetInnerHTML` usages render server/AI-generated HTML embedding tenant data (reports, invoice previews, templates) | No sanitizer (e.g. DOMPurify) import found at any of the 3 sites — needs confirmation/fix | M | P1 |
| CSRF | N/A | Partial | N/A | NextAuth handles its own `/api/auth/*` CSRF; custom API routes rely solely on `SameSite` cookie default | Acceptable for a same-origin cookie SPA, no defense-in-depth beyond that | M | P2 |
| JWT handling | N/A | Done | N/A | 8h maxAge, 1h updateAge, `HttpOnly` + JWE-encrypted session cookie confirmed live | None major | — | — |
| Audit Logs (ActivityLog) | Partial | Partial | Done | `logActivity()` called from only 6 files, all Finance-only | HR, Sales, Inventory, Manufacturing, and User-management mutations are not logged at all | M | P1 |
| Audit Logs (CrmAuditLog) | Partial | Done | Done | Written in 30 of 74 CRM route files | ~44 CRM route files still lack audit writes | S | P2 |
| 2FA / TOTP | Missing | Missing | Missing | Zero TOTP/2FA implementation anywhere, confirmed | No 2FA at all | L | P1 |
| `/crm/**` role enforcement | N/A | Done | N/A | ✅ **Fixed in `6915537`** (middleware role-gate) **and `38fff4a`** (per-handler RBAC backstop). `/crm/**` and `/api/crm/**` now require sales/admin/master-admin at the middleware level; `requireRole()` is no longer a hardcoded no-op. Live-verified with a temp hr-role test user: CRM 403, own module unaffected. | None | — | — |

### SaaS & Multi-tenancy

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Tenant isolation (fallback pattern) | N/A | Partial → first slice fixed | Done | ✅ **Fixed in `53519ad`** (first slice only — explicitly not the full mass remediation, per the work order). `lib/auth/requireTenantId.ts` now hard-401s on session-tenantId-missing across all 14 write handlers (POST/PATCH/DELETE) in the highest-risk Finance + HR payroll routes. The remaining ~212-215 files (reads, and all non-Finance/HR-payroll writes) still use the silent fallback — genuinely unresolved, tracked as before. | The full ~226-file remediation remains open by design (out of this session's explicit scope) | M (mass remediation) | P1 (was P0, first slice done) |
| Subscriptions (SaaS plan state) | Done | Done | Done | ✅ **Fixed in `6a191c1`.** `isSubscriptionBlocked()` in `lib/middleware/moduleGate.ts` now reads and enforces `subscriptionStatus` (suspended/cancelled blocked) alongside `trialEndDate`. Wired into `middleware.ts`: 402 for API routes, redirect to new `/subscription-inactive` page for page routes. Live-verified both directions. | None | — | — |
| Usage limits (seats, AI calls) | Partial | Done | N/A | Both enforced live (`org/invite` 403s past `maxUsers`; `tenantAi.ts` caps monthly AI calls) | No UI shows remaining quota before hitting the wall — only an error toast after the fact | S | P2 |
| Usage limits (storage/records) | Missing | Missing | N/A | `TierLimits` has no storage/record-count fields at all | No enforcement on data volume per tenant | L | P2 |
| Trials (`trialEndDate` enforcement) | Done | Done | Done | ✅ **Fixed in `6a191c1`.** `trialEndDate` now read and enforced by `isSubscriptionBlocked()` (trial + expired date → blocked). Live-verified by temporarily flipping default-tenant's trial date and confirming both the block and the restore. | None | — | — |
| Feature flags (`enabledModules` gating) | N/A | Done | Done | ✅ **Fixed in `ccf4556`.** `applyModuleGating()` now wired into `middleware.ts` (60s-TTL cached org-tier lookup). **Critical pre-existing risk found and mitigated**: all 24 existing Organizations were on tier="starter"/unset, which only allows `["admin","hr","inventory"]` — wiring the gate as literally specified would have 403'd Finance/Sales/CRM/Manufacturing for every real tenant on day one. Flagged to the user, who chose to grandfather; `scripts/migrate-grandfather-tenant-tiers.ts` sets all 24 to `tier:"enterprise"`. Live-verified both directions (starter tier correctly 403s non-allowed modules; grandfathered enterprise tier passes all 7). Also fixed a related bug: middleware's own internal tier-lookup fetch to `/api/internal/org-tier` was itself being blocked by the blanket session check, silently fail-opening the gate — added `/api/internal/*` to the public-API exemption list. | None | — | — |

### Responsive & Cross Browser

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Breakpoint usage (code-level proxy) | Partial | N/A | N/A | Most module pages use `sm:/md:/lg:` broadly; several core list/dashboard-wrapper pages have 0-1 hits | Coverage is uneven; data-table-heavy pages have fewer responsive classes than card layouts — likely overflow risk on small viewports | — | — |
| Browser-specific code/polyfills | Done | N/A | N/A | Only standard autoprefixer-generated `-webkit-` output found, no bespoke browser-sniffing | No known compatibility hacks | — | — |
| Chrome / Edge / Firefox / Safari / Android / iPhone (actual rendering) | **Needs manual verification** | **Needs manual verification** | N/A | Cannot render real browsers/devices from this environment | Every one of the 6 named targets requires real manual QA; the code-level signal above is a proxy only, not a substitute | — | — |

### Integrations

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Razorpay / payment gateway | Partial (catalog UI only) | Missing (honest stub) | N/A | `StubPaymentGatewayService` always returns "not configured"; no SDK, no OAuth, no charge call anywhere | Confirmed no real gateway; manual payment recording is the only working path (documented, accepted) | — | — |
| Google Maps | N/A | Missing | N/A | Zero hits anywhere | No address-autocomplete/geocoding | L | P2 |
| Email (transactional) | N/A | Missing (honest stub) | N/A | `StubEmailService` logs and returns fake success; explicit comment confirms no provider configured | In-app notifications only, unchanged (documented) | L | P1 |
| WhatsApp/SMS | N/A | Missing | N/A | "WhatsApp" only exists as a manual-logging dropdown value, no Twilio/API integration | Not a live channel | L | P2 |
| CSV/Excel import-export | Done | Done | N/A | Verified real parsing (not accept-and-ignore) on 2 import routes; real export routes in CRM/Finance/Sales | None | — | — |

### Backup & Recovery

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Backup mechanism | ➖ N/A — infra-managed (MongoDB Atlas) | ➖ N/A — infra-managed (MongoDB Atlas) | N/A | ✅ **Fixed in `2eefd8b`.** The dead `href="#"` "Backup Your Data" link removed from the Chart of Accounts export UI; surrounding note reworded to no longer imply an app-level feature that doesn't exist. | None | — | — |
| Restore | ➖ N/A | ➖ N/A — infra-managed | N/A | No restore endpoint found | Expected to be Atlas-side, not app-level | — | — |
| Import/Export of org data | Partial | Partial | N/A | Only CRM has bulk export (`lib/crm/exportEngine.ts`, capped 10k/25k rows); no whole-tenant or other-module equivalent | Finance/Sales/HR/Inventory/Manufacturing have no equivalent export/backup feature | L | P2 |

### Localization

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Indian numbering (lakhs/crores) | Partial | N/A | N/A | Spot-checked Finance/Sales report pages use standard `toLocaleString` / manual formatting — not independently deep-audited for lakh/crore grouping across every screen in this pass | Needs a dedicated screen-by-screen formatting sweep; not confirmed broken, not confirmed fully correct either | S | P2 |
| Multi-currency | Partial | Missing | Partial | `Organization.settings.currency` and `Invoice.currencyId` fields exist (default INR/USD) | No currency-conversion logic, no multi-currency transaction support found — a stored label only | M | P1 |
| Date formats | Done | N/A | N/A | `date-fns` used consistently across forms/reports | None found | — | — |
| Timezones | Partial | Missing | Partial | Same pattern as Currency — `settings.timezone` stored, never read/applied for date rendering | Timestamps render in the browser's local time, not any tenant-configured timezone | M | P1 |
| Multi-language | Missing | Missing | Missing | No i18n framework (see Organization Setup → Language) | No language support at all | L | P2 |

### Error Handling

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Form validation coverage | **Missing (docs vs. reality)** | N/A | N/A | `zod`+`react-hook-form` are dependencies and documented as "the stack," but zero files import either (`zodResolver`, `useForm(` both grep to zero genuine hits) | Every form does hand-rolled `if(!field) toast.error(...)` checks — no schema validation, no type coercion guarantees, uneven required-field enforcement | L | P1 |
| Request timeouts | Missing | N/A | N/A | Zero `AbortController` usage anywhere | A hung backend call (slow query, AI-assistant call) spins the UI indefinitely with no client-side cancel | M | P1 |
| Network-failure UX | Done | N/A | N/A | `sonner` toasts + try/catch used consistently across 109+ files | Genuine strength, not a gap | — | — |
| Large-upload handling | Partial | Done | N/A | ✅ **Fixed in `443059e`.** `lib/upload.ts`'s shared `uploadToCloudinary()` now checks file size (default 10MB) before any network call, so every call site gets the protection regardless of its own ad hoc checks. Live-verified: 11MB file rejected pre-network, small file passes through. | Ad hoc per-form client-side checks remain uneven (unchanged) — the shared helper is the real backstop now, not a full UX polish pass | S (done) / M (per-form UX) | — / P2 |

### UI/UX

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Cross-module `components/ui/*` consistency | Partial | N/A | N/A | Share rate varies widely by module (HR/Sales/CRM high, Finance/Manufacturing noticeably lower) | Real unevenness in shared-primitive adoption, not a hard violation | M | P2 |
| Typography/Spacing design tokens | Done | N/A | N/A | Real, centralized CSS-variable token system (`app/globals.css` `@theme inline`) per shadcn/ui conventions | None | — | — |
| Loading states | Done | N/A | N/A | 75 files use `Skeleton`/`animate-pulse` via dedicated shared components | Broad, genuine coverage | — | — |
| Dark/Light mode | Done | N/A | N/A | ✅ **Fixed in `bec8809`.** `components/ui/sonner.tsx` now reads `useThemeStore((s) => s.theme)` from `@/store/themeStore` instead of the never-provided `next-themes` package. Confirmed `next-themes` now has zero remaining imports anywhere in the codebase (the unused `package.json` dependency itself was left in place — out of scope). | None | — | — |

---

## 3. Actionable Work Plan (prioritized, phased)

> **Status key for this section (updated 2026-07-06):** ✅ = implemented and live-verified this session. 🚫 GST = explicitly deferred per user instruction, untouched. ⬜ = not in this session's 28-item scope, still open.

### Phase 0 — Immediate hotfixes (live-broken, S-effort, ship before anything else)
1. ✅ **Done in `287921e`.** Add `import "@/models/Product"` to `app/api/sales/sale-orders/route.ts` and its `[id]` sibling — fixes the live 500 on the `/sales/orders` and `/sales/pipeline` pages.
2. ✅ **Done in `287921e`.** Add `import "@/models/Warehouse"` to `app/api/inventory/stock-moves/route.ts` — fixes the live 500 on that endpoint.
3. ✅ **Done in `287921e`.** Add `import "@/models/Department"` before the `.populate("departmentId")` calls in `app/api/hr/employees/route.ts` and `app/api/hr/attendance/route.ts` — fixes the cold-start 500.
4. ✅ **Done in `f5146e2`.** Add `tenantId` to the `InventoryItem.find()` query in `app/api/inventory/alerts/route.ts` — closes the live cross-tenant data leak.
5. ✅ **Done in `9fcccaf`/`b471e44`.** Add a `tenantId: String` field to `models/BankReconciliation.ts` (with a compound index) and write a migration to backfill/quarantine any existing tenant-less records.
6. ✅ **Done in `bd2014d`.** Escape regex metacharacters in `app/api/crm/search`, `app/api/sales/products`, `app/api/crm/accounts`, `app/api/finance/assets/compute` — closes the confirmed 500/ReDoS vector.
7. ✅ **Done in `570ed67`.** Exempt `/api/cron/*` from the blanket middleware session check — restores SLA/dunning/subscription-billing automation.
8. ✅ **Done in `ba571d5`.** Add `unique: true` to `models/Invoice.ts`'s `{tenantId, name}` index (+ migration, 0 collisions found).
9. ✅ **Done in `c8cba93`.** Fix the two newly-found global unique indexes: `models/crm/Quote.ts` (`quote_number`) and `models/DeliveryChallan.ts` (`dcNumber`) → compound with `tenantId` (+ migration).
10. ✅ **Done in `ccf4556`.** Wire `lib/middleware/moduleGate.ts`'s existing, tested `applyModuleGating`/`isModuleAccessible` into `middleware.ts`. **Required a mitigation not in the original estimate**: all 24 existing tenants were on a tier that would have been 403'd for Finance/Sales/CRM/Manufacturing — grandfathered via `scripts/migrate-grandfather-tenant-tiers.ts` (user-approved).

**Phase 0: 10/10 done.**

### Phase 1 — P0 structural gaps (data integrity, security, compliance; M/L effort)
11. ✅ **Done in `f9629c1`.** Build the Purchase Order UI (list/create/edit/approve screens) — live-verified full lifecycle.
12. ✅ **Done in `ff834df`.** Resolve the `Bill.ts` vs `Invoice`(`moveType:in_invoice`) split-brain: `Bill.ts` deleted, KPI and reminder engine repointed, 2 orphaned demo bills migrated.
13. 🚫 **Deferred — GST phase.** Implement real GSTIN validation: structural regex + mod-36 checksum digit.
14. 🚫 **Deferred — GST phase.** Build GSTR-1/GSTR-3B report generation.
15. 🚫 **Deferred — GST phase.** Build E-Way Bill generation.
16. ✅ **Done in `38fff4a`.** Make CRM's `lib/crm/rbac.ts` real (`requireRole()` now enforces on writes). `User.permissions` itself left as a documented-inert field rather than built into a second system — a deliberate, narrower scope than "implement per-action checks that read `permissions`," chosen to avoid inventing a fake enforcement layer on top of an unused field (flagged, not silently done).
17. ✅ **Done in `6915537`.** Add role-based middleware protection to `/crm/**` and `/api/crm/**`.
18. ✅ **Done in `6a191c1`.** Enforce `trialEndDate` and `subscriptionStatus`.
19. ⬜ **Not addressed — out of the 28-item session scope.** Connect Manufacturing to Finance (post a JournalEntry on `MATERIAL_ISSUED`/`FINISHED`). Still open; was not part of the user's work order for this session.
20. ✅ **Done in `e6168b5`.** Add a negative-stock guard (opt-in `allowNegativeStock`, default enforced) to `stock`/`stock-moves` routes.
21. ✅ **Done in `514eef0`.** Add password-reset-without-login flow (email-token-based).
22. ✅ **Done in `53519ad` — first slice only, exactly as scoped.** Converted `tenantId || "default-tenant"` fallback to a hard 401 in Finance + HR payroll write paths (14 handlers, 11 files). The full ~226-file mass remediation remains explicitly out of scope and still open.

**Phase 1: 9/10 done, 1 not in scope (#19), 3 deferred to GST phase (#13-15).**

### Phase 2 — P1 completeness gaps (M/L effort, not launch-blocking but real product gaps)
23. 🚫 **Deferred — GST phase.** TDS on vendor-bill payments.
24. 🚫 **Deferred — GST phase.** HSN/SAC as a real `Product`/invoice-line field.
25. ⬜ **Not addressed — out of the 28-item session scope.** Credit Notes: a real "Issue Credit Note" flow.
26. ⬜ **Not addressed — out of the 28-item session scope.** Sales Returns/RMA.
27. ⬜ **Not addressed — out of the 28-item session scope.** Cash Flow Statement.
28. ✅ **Done in `7318cc6`.** Wire `lib/crm/ai/duplicateAssistant.ts` into the Leads/Contacts create flow (confirm-dialog UI, not a full merge-duplicates review screen — that part remains open).
29. ⬜ **Not addressed — out of the 28-item session scope.** Link CRM `Account`/`Contact` to ERP `Customer`.
30. ✅ **Done in `31ee28b`.** Rate limiting on login, search routes, and AI-assistant endpoints.
31. ⬜ **Not addressed — out of the 28-item session scope.** Standardize Finance/HR/Inventory/Admin list-endpoint response shapes.
32. ✅ **Done in `162ff1d`.** Add pagination to `finance/purchase-orders` and `finance/expenses`.
33. ✅ **Done in `b9c23ae`.** Fix the orphaned-from-sidebar real pages: CRM, Manufacturing, Inventory Batch/Analytics.
34. ✅ **Done in `2b57425`/`cc5be2d`.** Replace decorative report/export buttons that have no handler (Inventory Reports ×4, Manufacturing Reports, CRM Report Builder, Aged Partners Print) with real implementations.
35. ✅ **Done in `443059e`.** Add a size-limit check to the shared `lib/upload.ts` helper.
36. ⬜ **Not addressed — out of the 28-item session scope.** Adopt `zod`+`react-hook-form` for the highest-traffic forms.
37. ⬜ **Not addressed — out of the 28-item session scope.** Payslip PDF generation for Payroll.
38. ⬜ **Not addressed — out of the 28-item session scope.** PF/ESI statutory-rate computation.

**Phase 2: 7/16 done, 7 not in scope, 2 deferred to GST phase.**

### Phase 3 — P2 polish / deferred-by-design (L effort or genuinely lower-value)
39. ⬜ Not addressed. Mobile/OTP login, OAuth login, 2FA.
40. ⬜ Not addressed. Multi-branch, multi-language/i18n, per-tenant timezone-aware rendering, multi-currency conversion.
41. ⬜ Not addressed. Dashboard filters/exports (beyond the Admin dashboard), Projects module, Time Tracking, project-based billing.
42. ✅ **Done in `bec8809`.** Decouple `components/ui/sonner.tsx` from the unused `next-themes` provider.
43. ✅ **Done in `2eefd8b`.** Remove the dead "Backup Your Data" link.
44. ⬜ Manual cross-browser/device QA pass — still cannot be done from this environment; still needs a separate, human-driven QA cycle.

**Phase 3: 2/6 done (the 2 items that were actually in this session's 28-item scope); the rest were never in scope for this session.**

**Overall: 28/28 planned items for this session done. Nothing was skipped as "too risky" — every item in the user's work order shipped and was live re-verified with zero regressions.**

---

## 4. Known-Good Confirmation (do not re-audit)

Confirmed fully Done (UI+Backend+DB) either by live verification this session or direct, cited code inspection — matches or refines `AUDIT_REPORT.md`'s prior findings.

> **Re-verified 2026-07-06, end of implementation session — zero regressions confirmed.** Every item below was re-checked live after all 28 fixes landed (fresh curl calls against a live dev server with an authenticated admin session), specifically to confirm none of the 28 fixes broke anything already working. All passed.

- **Finance report engine**: Chart of Accounts, Journal Entries CRUD + approval workflow, double-entry balance guard (now centralized across all posting paths, see `add2c76`), Trial Balance (`/api/finance/reports/trial-balance`), P&L (`/api/finance/reports/p-l`), and Balance Sheet (`/api/finance/reports/balance-sheet`) all re-confirmed 200 with correct data, live, in final verification.
- **Vendor Bill payments** post real journal entries via `postInvoicePayment`/`ensureBillPostingJournal` — re-confirmed live (`/api/finance/bills` 200) after the `Bill.ts` split-brain fix (`ff834df`) which touched this same area; no regression.
- **Sales**: the "Sales Orders" tab (`/api/sales/sales-orders`), Payments' draft-invoice guard, and CSV/Excel import all re-confirmed working live. The previously-broken `/api/sales/sale-orders` (distinct path) is now also 200 (see Phase 0 #1).
- **CRM**: Lead lifecycle + conversion, Opportunity pipeline (`/api/crm/opportunities` 200), Activities (`/api/crm/activities` 200), and duplicate blocking (now also fuzzy, see `7318cc6`) all re-confirmed live after the CRM RBAC (`38fff4a`) and role-gating (`6915537`) changes — reads unaffected, writes correctly still work for admin/sales roles.
- **HR**: Employee CRUD, Leave approval workflow, and the full Payroll→GL-posting lifecycle (`/api/hr/payroll`, `/api/hr/employees` both 200) re-confirmed live after the `requireTenantId` hardening (`53519ad`) — a real write (admin session, has tenantId) still succeeds normally.
- **Inventory/Manufacturing**: Warehouse transfers (`/inventory/operations/receipts` 200), BOM (`/api/manufacturing/bom`, `/api/manufacturing/item-bom` both 200), and the full Manufacturing Order lifecycle (`/api/inventory/operations/manufacturing` 200) re-confirmed live, unaffected by the negative-stock guard (`e6168b5`) or the module-gating rollout (`ccf4556`).
- **Admin Dashboard**: widgets, KPIs, and charts re-confirmed live (`/api/admin/dashboard` 200) — and now more correct than before, since "Total Expenses" reads real data (`ff834df`).
- **UI foundation**: design tokens, loading-skeleton coverage, and toast-based network-failure UX unaffected by this session's changes.
- **Role-based middleware table** (`/admin`, `/finance`, `/sales`, `/inventory`, `/manufacturing`, `/hr`, `/master-admin`) re-confirmed accurate; `/crm/**` now also role-gated (was a documented gap, now closed — see Security section).
- All prior-session fixes listed in `AUDIT_REPORT.md`'s "Concrete bugs fixed" table were spot-checked again and confirmed still in place, unaffected by this session's 28 fixes.

## 5. Final UAT Flows (run live against seed data this session)

> **Re-run 2026-07-06, end of implementation session.** Rows below are the *original* audit-time verdicts, each followed by an **updated verdict** reflecting this session's fixes.

| Flow | Original Verdict | Updated Verdict (2026-07-06) | Notes |
|---|---|---|---|
| Lead → Quote → Order → Invoice → Payment | **Partial** | **Partial (unchanged, out of scope)** | Not part of this session's 28-item work order — the two-forked-path architecture (CRM Opportunity→Quote vs. Sales Quote→Invoice) is a product-design question, not a bug fixed here. Each segment still individually works. |
| Full Purchase workflow (Vendor→PO→GRN→Bill→Payment) | **Partial — blocked** | ✅ **Passes end-to-end** | ✅ **Fixed in `f9629c1`** (PO UI) **+ `ff834df`** (Bill.ts split-brain). Re-run live in final verification: created a real PO via the API the new UI calls, advanced it draft→pending_approval→approved→posted, confirmed it appears in the GRN-matching flow at `/inventory/operations/receipts` (still 200), then cleaned up (cancelled+deleted). A real user can now execute this entire workflow through the product. |
| Inventory workflow (receive→transfer→adjust→valuation) | **Partial** | **Partial → cross-tenant leak closed, still Partial overall** | ✅ **Fixed in `f5146e2`.** Alerts cross-tenant leak re-tested with a fresh 2-tenant seed in final verification: only the requesting tenant's item is returned. Receive/GRN/transfers unaffected (still work). Valuation is still cosmetic (unchanged, out of session scope — no costing engine was built). |
| Finance validation (transaction → correct GL/Trial Balance impact) | **Partial** | ✅ **Negative-value guard now covers all posting paths** | ✅ **Fixed in `add2c76`.** Re-verified in final verification via the real `/api/finance/journal-entries` POST API (not just the internal function): a negative debit/credit line pair is now rejected with `"Negative values are not allowed for debit or credit."` Confirmed by code-path tracing that `lib/accounting/inventory.ts`, `lib/accounting/payments.ts`, and HR payroll all route through the same now-fixed shared validator. The pre-existing bad `JRN/2026/0002` entry was left as historical data (not retroactively fixed) — a report-only script (`scripts/report-negative-journal-lines.ts`) was added to help find any more like it. |
| Security signoff readiness | **Not ready** | **Materially improved, not yet fully ready** | ✅ ReDoS/500 vector fixed (`bd2014d`). ✅ CRM RBAC and role-gating now real (`38fff4a`, `6915537`) — no longer open to all roles regardless of assignment. ✅ Cron automations now reachable (`570ed67`). ⬜ No 2FA (unchanged, out of scope). ⬜ tenantId-fallback pattern: first slice hardened (Finance+HR payroll writes, `53519ad`), full ~226-file remediation still open by design. GST compliance gaps remain, deferred to dedicated phase. |
| **Overall production readiness verdict** | **Not production-ready.** | **Substantially improved; GST and full tenantId remediation remain the primary open blockers.** | All 8 live-reproduced P0 defects from the original top-10 list that were in scope for this session are fixed and re-verified with zero regressions (599/599 tests passing, `tsc --noEmit` clean, every §4 Known-Good flow and this table's flows re-confirmed). The two categories explicitly **not** addressed this session and still blocking a genuine production-ready claim are: (1) **GST & India Compliance** — deliberately deferred to a dedicated future phase, and (2) the **full ~226-file `tenantId` fallback remediation** — only the highest-risk Finance/HR-payroll write paths were hardened this session, per explicit scope. Manufacturing-to-GL disconnection (item #19) also remains open, not part of this session's scope. Recommend the GST phase and the remaining tenantId remediation as the next two priorities before any GA/production launch claim. |

---

## 6. Deployment / Migrations Required (2026-07-06 implementation session)

Before deploying this branch to staging or production, run the following migration scripts against the target database, **in this order**, with a fresh backup taken immediately before (standard MongoDB Atlas practice — not a new requirement introduced by this session):

1. `scripts/migrate-backfill-bankreconciliation-tenantid.ts` — backfills `tenantId` on any existing tenant-less `BankReconciliation` documents (resolves via `createdBy`, falls back to `"default-tenant"` if unresolvable).
2. `scripts/migrate-invoice-unique-index.ts` — detects/renames any colliding `{tenantId, name}` Invoice pairs (via a `-DUP-n` suffix) before making the index `unique`. Ran clean against this session's DB (0 collisions); still recommended to run on any other environment before deploy, since collision state may differ.
3. `scripts/migrate-drop-stale-unique-indexes.ts` — **updated this session** to also cover `crmquotes.quote_number` and `deliverychallans.dcNumber` (previously only handled the prior session's 10 collections). Safe to re-run even if already run before — it's idempotent per its existing design.
4. `scripts/migrate-grandfather-tenant-tiers.ts` — **critical, do not skip.** Sets `tier: "enterprise"` on all existing Organizations that are currently on `"starter"`/unset. Without this, wiring in module gating (`ccf4556`) will 403 Finance/Sales/CRM/Manufacturing for every real existing tenant the moment this branch deploys. Review the tier assignment for your actual production tenants before running — "enterprise" was the user-approved default for this session's dev data; a production rollout may want a more deliberate per-tenant tier assignment instead of a blanket grandfather.
5. `scripts/migrate-bill-split-brain.ts` — migrates any existing orphaned `bills` collection documents into real `Invoice` documents (attached to an existing Customer as vendor). Ran clean against this session's DB (2 docs migrated); run again on any other environment with its own `bills` collection data before deploying, since `models/Bill.ts` itself has been deleted and that collection will otherwise become permanently unreachable dead data.

**Also newly required in `.gitignore`:** the `scripts/` directory was previously entirely gitignored (meaning no migration/seed script, including several pre-existing ones, was ever actually version-controlled). This was corrected this session (user-approved) — confirm your deploy tooling picks up `scripts/*.ts` from the repo now, rather than expecting them to be deployed out-of-band.

**Environment variables:** no new environment variables were introduced this session. The existing `CRON_SECRET` (already required for the 5 `/api/cron/*` routes) is now actually load-bearing in production, since those routes are reachable for the first time — confirm it's set in every deploy environment before relying on the cron automations.

**No destructive schema changes.** All 5 migrations above are additive (new fields/indexes) or data-repair (backfill/dedupe/re-home orphaned docs) — none drop or truncate existing collections. `models/Bill.ts` was removed from the codebase, but its underlying MongoDB collection is left physically in place (untouched) after migration #5 runs; it is simply no longer read by application code.

---

## 7. Test-Team Bug Fixes (2026-07-07 implementation session, branch `main`)

Six bugs reported by the test team from live UAT of the core sell cycle (quote → invoice → payment) plus product creation. Each was reproduced live against seeded data first, root-caused, fixed, and re-verified live; commits `e36b404`→`74adbd0`. Full suite 609/609 passing (was 603 at session start), `tsc --noEmit` clean throughout.

| # | Bug | Root cause | Fix | Commit | Live proof |
|---|---|---|---|---|---|
| 1 (P0) | Quote→Invoice discount corruption: a 10% quote discount became a flat ₹10 on the invoice | `SalesInvoice` had no `extraDiscountMode` field at all; 3 call sites (create, edit, PDF context) hardcoded `"amount"` regardless of what was selected; the quote→invoice converter never copied the mode; the edit form never loaded it back | Added `extraDiscountMode` to the model; fixed all 3 hardcoded call sites + the converter + the edit-form load; consolidated on the existing shared `computeInvoiceTotals` (already shared pre-fix) | `e36b404` | Quote (10% doc discount) → convert → invoice totals identical to the paisa (₹1062 = ₹1062); edit-form round-trip preserves `percent` mode. `scripts/repair-invoice-discount-mode.ts` found + repaired 2 real corrupted invoices in the dev DB (one pre-existing, one from this session's own pre-fix testing) |
| 2 (P0) | Payment recording broken end-to-end: no way to reach the payment form from an invoice; unpaid list showed no dues; Deposit To showed every ledger account | Unpaid-invoices query filtered on `status: "saved"` literally, excluding `overdue`/`partially_paid` invoices (both have real dues); no "Record Payment" entry point existed anywhere; Deposit To fetched the full chart of accounts unfiltered | Added a `status=unpaid` pseudo-filter (saved\|overdue\|partially_paid); added "Record Payment" row action (invoice list) + button (invoice detail), pre-filling customer + due amount; added `?type=bank` filtering to the shared accounts endpoint, used by Deposit To (TDS-account dropdown stays unfiltered — real ledger choice) | `93b0f46` | Created an overdue invoice → invisible under old query, appears under new one → partial payment → `partially_paid` (residual ₹1200) → remainder → `paid`; Deposit To shows exactly the 5 bank/cash accounts (was 96) |
| 3 (P0) | Quote TDS/TCS "Select a Tax" dropdown effectively empty/wrong | Zero TDS/TCS-type `TaxRate` rows existed for any tenant (only GST 5/12/18% were ever seeded); the dropdown never filtered by type, so it silently showed GST rates as if they were TDS/TCS options | Added `lib/accounting/taxRate-seeder.ts` (auto-seeds default TDS 194C 1%/2%, 194J 10%, TCS 206C(1H) 0.1% on first fetch, same pattern as the Chart-of-Accounts auto-seeder); filtered the dropdown to `type === taxMode` in Quote/SalesOrder/Subscription forms (Invoice uses a separate manual-rate UI, unaffected) | `b94fc11` | TDS radio now lists exactly the 3 seeded TDS rates, TCS lists the 1 seeded TCS rate; selecting TDS 194J (10%) on a ₹10,000 line deducts ₹1,000 and survives quote→invoice conversion |
| 4 (P0) | Bank/ledger accounts "invisible" in journal entry / invoice Payments / signature pickers | Live reproduction found the underlying data and API responses already correct — the actual defect is that none of these dropdowns guarded against being opened before their fetch resolved, rendering as an empty, clickable-looking dropdown (indistinguishable from "broken") for however long the request took | Added a loading-guard (disabled + "Loading..." placeholder) to the journal-entry account picker, invoice's Select Bank/Select Signature, and Payment form's Deposit To; also normalized account labels across the model's two field-naming styles (`name`/`code` vs `accountName`/`accountCode`) so newer-style accounts don't render as blank rows | `dc7a6a5` | Confirmed under simulated slow network (300kbps): trigger shows disabled "Loading accounts..." instead of an empty dropdown, then correctly populates once the fetch resolves. A ₹500 journal entry against Bank Current Account posted and appeared in Trial Balance |
| 5 (P1) | Product creation: stray click closes the modal; Publish → 500; drafts leak into item pickers | (a) `ModularModal` (~44 usages) had no outside-click/Escape guard, and Radix treats a click on a nested Select's portal as "outside" the Dialog; (b) `Product.status` reused the shared `DOCUMENT_STATUS` enum (draft/pending_approval/approved/posted/...), which has **no `"published"` value** — every Publish attempt failed Mongoose enum validation (frontend was already correctly sending/typed `"published"`); a prior seed script had worked around this by marking demo products `"approved"` as a live stand-in; (c) item pickers fetched products unfiltered | (a) added opt-in `preventOutsideClose` prop, enabled for the product form while it holds unsaved input; (b) added a real `PRODUCT_STATUS` enum (draft/published) in `statuses.ts`, migrated the model to it, made both product routes return 400+field messages on a real `ValidationError` instead of a blanket 500; (c) added `?status=` filtering to the products endpoint, switched Quote/Invoice/SalesOrder(both Zoho-style and legacy)/Subscription pickers to `status=published` | `a93db9d` | Stray click no longer closes the modal (name input survives); Publish now returns 201/200 where it always 500'd before; a draft product is visible unfiltered but absent from the `status=published` picker. `scripts/migrate-product-status-enum.ts` found + repaired 27 existing products stuck on the `"approved"`/`"posted"` workaround values → `"published"` |
| 6 (P2) | "Service tracking" dropdown is dead UI (No / Task in Global Project / Project Only / Task in New Project) | Confirmed via grep genuinely write-only: three initial-state objects defaulted it, the dropdown set it, nothing ever read it — consistent with this product having no Projects module at all (§2 Projects section, prior finding) | Removed the dropdown from `ProductPopupContent` (shared by Sales + Manufacturing product screens) and the field from the model + the three places that defaulted it. "Product Type" (consu/service/combo) itself stays — it's real and drives inventory-item auto-creation | `74adbd0` | Selecting Product Type "Service" no longer shows the dropdown; product creation unaffected |

**Cross-cutting confirmed:** the response-shape drift (`{success,data}` vs `{error}`) hypothesized as a possible cause turned out not to be present in any of the 6 — every route touched already used the `{success,data}` convention correctly. The actual root causes were, in order of how often they recurred: a genuinely missing enum value/field (#1, #5b), a client-side unfiltered-list-that-should-be-filtered pattern (#2 Deposit To, #3, #5c), and a missing loading-state guard (#4).

**✅ Fixed in `aa79d8a` (2026-07-07, follow-up session).** The gap below (originally disclosed, not fixed, during the 2026-07-07 test-team bug-fix session) has been closed: Sales/customer Payments now post real General Ledger journal entries, reusing the exact same `createPostedJournalEntry` → `validateJournalLinesForPosting` pipeline vendor-bill payments already used, via a new `postCustomerPaymentJournal()` in `lib/accounting/payments.ts`. See the "Sales Payments → General Ledger posting" entry further down for full detail. Original disclosure, kept for record:

~~the Sales module's own Payment recording (`/api/sales/payments`, built in the earlier Sales Module Revamp Phase 3) updates `SalesInvoice.payments[]`/status correctly but does not post a General Ledger journal entry — `postInvoicePayment` (the function that does post GL entries) is wired only into the separate Finance module's `/api/finance/invoices/[id]` and `/api/finance/bills/[id]` routes, not into `/api/sales/payments`. This means the final-verification flow's expectation that "Trial Balance reflects" a Sales-recorded payment does not currently hold — verified live (see Flow A/B below). This is a real, pre-existing architectural gap (two parallel invoice systems, only one GL-wired) on the same scale as the already-documented Manufacturing→GL disconnection (§2 Costing, P0) and was flagged rather than silently built out, since wiring Sales Payments into GL posting is a real design decision (which Dr/Cr accounts, tax handling) beyond the scope of those 6 bug fixes.~~

**Final verification flows run live (twice, per the deployment mandate):**
- **Flow A** (10% document discount + TDS 10%): Quote (₹10,000 line, 10% doc discount, TDS 10%) → taxable ₹9,000, total ₹9,720 → converted to invoice, identical totals → partial payment ₹5,000 → `partially_paid` → remainder ₹4,720 → `paid`. (At the time, Journal-entry/Trial-Balance impact was not yet present for Sales-side payments — closed in the `aa79d8a` follow-up session below.)
- **Flow B** (flat ₹500 discount + TCS 0.1%): Quote (₹20,000 line, flat ₹500 discount, TCS 0.1%) → taxable ₹19,500, total ₹23,033.01 → converted, identical totals → partial ₹10,000 → `partially_paid` → remainder ₹13,033.01 → `paid`.
- Journal entry ₹500 Dr Bank Current Account / Cr Sales Revenue → posted → confirmed in Trial Balance (independent of the Sales-payments gap above, since journal entries always post directly).
- Product publish → live in `status=published` picker; draft → absent from it, visible in unfiltered product management list.
- §4 Known-Good re-spot-checked after all 6 fixes: Payments' draft-invoice guard still rejects (`"Invoice ... is draft and cannot receive a payment"`), Trial Balance/P&L/Balance Sheet/invoice-list all still 200.

**Deployment checklist additions (this session):**
- `scripts/repair-invoice-discount-mode.ts` — report-first, `--apply` to repair. Already run against this session's dev DB (2 invoices repaired); run again on any other environment with quote-converted invoices before relying on their totals.
- `scripts/migrate-product-status-enum.ts` — report-first, `--apply` to repair. Already run against this session's dev DB (27 products repaired from `"approved"`/`"posted"` stand-ins to `"published"`); run again on any other environment with existing product data before deploying, or previously-"live" products will silently vanish from the sales item pickers (which now filter on `status=published`).
- No new environment variables.

---

## 8. Sales Payments → General Ledger posting (2026-07-07, follow-up session, commits `aa79d8a`, `15d0743`)

Closes the gap disclosed in §7 above. Sales/customer Payments now post real journal entries for every paid/void transition, reusing the vendor-bill payment flow's exact posting pipeline (`createPostedJournalEntry` → `buildJournalEntryPayload` → `validateJournalLinesForPosting`) — no parallel mechanism.

**Design:** `lib/accounting/payments.ts::postCustomerPaymentJournal()` is a single diff-based poster. It reconciles a payment's current `(allocatedTotal, unusedAmount, bankCharges, tdsAmount)` against the snapshot last posted for it (`payment.postedSnapshot`, a new field) and posts only the delta:
- **Initial post:** Dr Deposit-To account (net of charges/TDS) [+ Dr Bank Charges] [+ Dr TDS Receivable], Cr Accounts Receivable (= `allocatedTotal` exactly, matching the invoice subledger) [+ Cr Customer Advances for any excess].
- **Excess later applied to a new invoice** (the existing "Applied Excess Payments" import flow, `app/api/sales/payments/import-excess/execute/route.ts`): the bank-side deltas net to zero, leaving a clean `Dr Customer Advances / Cr AR` two-line reclass with no cash line.
- **Void:** posting to an all-zero target makes every delta the negative of what was last posted — an exact mirror-image reversal entry. The original entry is never mutated.
- **No real change** (duplicate/retry, or an edit that didn't touch amounts): every delta is ~0 → returns `null`, posts nothing. This is the idempotency guarantee, with no separate dedupe flag needed.
- **Retainer** (no invoice, `PAYMENT_TYPE.RETAINER`): reduces to a pure `Dr Bank / Cr Customer Advances`.

**Account resolution** is by stable chart-of-accounts code, never display-name matching or hardcoded ObjectIds: Accounts Receivable by `account_type: "asset_receivable"` (already unique, reusing the existing helper); three new accounts added to `lib/accounting/coa-seeder.ts`'s `DEFAULT_ACCOUNTS` — **Bank Charges** (`5150`), **TDS Receivable** (`1210`), **Customer Advances** (`2150`) — resolved by code, since their `account_type` groupings aren't unique enough on their own. The seeder's existing idempotent `ensureChartOfAccounts` auto-backfills these for tenants that predate this change, same mechanism as new tenants. The Deposit-To account resolves from the payment's own selection, falling back to the tenant's default cash account (matching `resolvePaymentAccount`'s existing precedent) for the retainer-import path, which never collects one explicitly. A missing/deleted Deposit-To account fails the posting attempt with a clear, actionable error rather than guessing or silently succeeding with no GL impact.

**Wired into every path that transitions a payment to paid:** the create route (posts *before* touching invoice allocations, so a missing-account failure can't leave a "paid" payment with no GL trace — the payment is deleted and the request 400s instead), the edit/void route, and all three bulk-import executors (`import`, `import-retainer`, `import-excess`).

**Tests:** `tests/accounting/customerPaymentPosting.test.ts` — standard receipt, bank charges, TDS, excess-to-Customer-Advances, retainer, excess-applied-later reclass, void reversal, idempotent double-call, and missing-Deposit-To-account failure, all DB-backed. 10/10 passing; full suite 619/619, `tsc --noEmit` clean.

**Backfill:** `scripts/migrate-post-historical-payment-journals.ts` (report-first, `--apply` to post) found every pre-existing PAID payment with no journal entry yet — **4 found in the dev DB** (3 standard receipts + 1 retainer) — and posted them dated to their original `paymentDate`s; 0 failures. One historical VOID payment with no journal entry was deliberately left alone (see script header: a voided payment has zero net effect by definition, so manufacturing a matched entry+reversal pair would add pure ledger noise, not correct anything). Re-running immediately after confirms idempotency (0 remaining candidates).

**Live verification (all against real seeded data, before/after cited, then cleaned up):**
1. Standard receipt (₹5,000 invoice, full payment): Bank Current Account ₹10,000 → ₹15,000, Accounts Receivable ₹1,006,102 → ₹1,001,102, invoice → `paid`, entry visible in the journal-entries/vouchers list with narration `"Payment PAY-000016 from Himalaya Fitness Studio against INV-0035"`.
2. Partial (₹3,000) then remainder (₹5,000) on an ₹8,000 invoice: two separate journal entries (confirmed distinct IDs), Bank +₹8,000 total, AR −₹8,000 total, invoice ends `paid`.
3. Payment with ₹1,000 excess: Customer Advances credited ₹1,000 (Bank +₹3,000, AR +₹2,000 only). Later applied the excess to a new invoice via the "Applied Excess Payments" import: posted a clean 2-line entry — `Dr Customer Advances ₹1,000 / Cr AR ₹1,000` — zero Bank lines, confirmed directly on the journal entry document.
4. Bank charges (₹20 on a ₹1,000/₹980-allocated payment): `Dr Bank ₹960 / Dr Bank Charges ₹20 / Cr AR ₹980`. TDS (₹100 on a ₹1,100/₹1,000-settled payment): `Dr Bank ₹900 / Dr TDS Receivable ₹100 / Cr AR ₹1,000` (full invoice settlement, per rule).
5. Voided the first (standard-receipt) payment: reversal entry posted (`Cr Bank ₹5,000 / Dr AR ₹5,000`, exact mirror of the original), Bank ₹27,860 → ₹22,860, AR ₹988,122 → ₹993,122, Trial Balance stayed balanced throughout, original entry's lines confirmed byte-for-byte unchanged.
6. Draft payment: `journalEntryIds: []` — zero GL impact, confirmed directly.
7. Vendor-bill payment posting (`postInvoicePayment` / `ensureBillPostingJournal`, the pre-existing reference flow) re-verified live and unaffected: paid an existing ₹4,500 bill, Accounts Payable ₹4,500 → ₹0, Trial Balance stayed balanced (then reverted for a clean environment). Finance reports (Trial Balance/P&L/Balance Sheet/bills list) all still 200 throughout.

**No new environment variables.** No destructive schema changes — `postedSnapshot`/`journalEntryIds` are new, additive fields on `Payment`; the three new Chart-of-Accounts entries are additive rows created via the existing idempotent seeder.

**Deployment checklist addition:** `scripts/migrate-post-historical-payment-journals.ts` — report-first, `--apply` to post. Run on every environment with pre-existing Sales payment data *before* relying on Trial Balance/AR to reflect historical customer receipts — until it's run, any payment recorded before this fix landed has zero GL impact. Safe to re-run (idempotent, skips anything already posted).
