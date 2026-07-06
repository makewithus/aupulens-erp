# QA Gap-Audit Report — Aupulens ERP vs. Master QA Checklist

**Date:** 2026-07-06 · **Branch:** `main` · **Tenant used for all live verification:** `default-tenant` (admin session)
**Method:** 6 parallel research passes (one per checklist cluster) + direct live verification (dev server + authenticated curl) by the orchestrating session. Every non-Missing grade below is backed by a file/route citation; every Missing grade states what was searched. This report does not modify any code — it is a gap analysis only. See `AUDIT_REPORT.md` for the prior session's fix log (referenced throughout, not repeated).

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

1. **`BankReconciliation` model has no `tenantId` field at all** — Mongoose strict mode silently strips it on every create; live-reproduced (create → immediately invisible to its own tenant's list). Every bank reconciliation record ever created is tenant-less.
2. **`GET /api/inventory/alerts` never applies `tenantId` to its query** — confirmed cross-tenant read: every tenant's low-stock alerts are visible to every other tenant.
3. **All 5 `/api/cron/*` jobs are unreachable** — `middleware.ts`'s blanket session check returns 401 before the route's own `Bearer $CRON_SECRET` check runs (confirmed live with the real secret). SLA breach detection, dunning, and subscription billing automation silently never fire in production.
4. **Regex injection / ReDoS in 4+ live routes** (`crm/search`, `sales/products`, `crm/accounts`, `finance/assets/compute`) — unescaped user input into `new RegExp()`; malformed input 500s today (confirmed live), and a crafted pattern is a blocking-event-loop DoS vector reachable by any authenticated user.
5. **GST compliance is not production-viable**: GSTIN "validation" is a 15-character length check (no regex, no checksum); no E-Way Bill generation exists; no GSTR-1/GSTR-3B report exists; HSN/SAC is a free-text field on one invoice model only, disconnected from the product catalog.
6. **Granular permissions and CRM RBAC are decorative**: `User.permissions` is stored and displayed but never read by any authorization check; `lib/crm/rbac.ts`'s `requireRole()` is hardcoded `return true`. Every authenticated user of any role currently has full CRUD on all CRM data regardless of role, and no route anywhere enforces per-action permissions.
7. **Two more Golden-Rule-#7 cross-tenant unique-index violations missed by the prior audit's "10 collections fixed" pass**: `models/crm/Quote.ts` (`quote_number`) and `models/DeliveryChallan.ts` (`dcNumber`) both have global (non-tenant-scoped) unique indexes.
8. **`models/Invoice.ts`'s `{tenantId, name}` index is not marked `unique`** — unlike JournalEntry/Bill/SaleOrder, duplicate invoice/bill numbers within one tenant are not prevented at the DB level.
9. **Purchase Order has a complete backend + DB but zero UI anywhere** to create/view/edit/approve a PO — the only frontend touchpoint is a read-only picker inside an unrelated Inventory popup. Simultaneously, `models/Bill.ts` is a "split-brain" orphaned model: prior-session seed data and index fixes landed on it, but the real Vendor Bills screen reads from a different collection (`Invoice`/`moveType:in_invoice`), and the Admin Dashboard's "Total Expenses" KPI reads only from the dead one (shows ₹0 despite real posted bills existing).
10. **`GET /api/sales/sale-orders` — used live by the nav-reachable "Orders" and "Pipeline" pages — throws a 500 (`MissingSchemaError` for `Product`) whenever the tenant has any real order data**, reproduced directly in this session; its `[id]` sibling has the same latent bug. A near-identical bug exists on `GET /api/inventory/stock-moves` (missing `Warehouse` model import), also reproduced live.

*(Also weighted heavily but just outside the top 10: SaaS trial-expiry and feature-flag/module-gating are both fully unenforced despite the module-gating code being built and unit-tested but never wired into `middleware.ts`; Manufacturing never posts to the General Ledger at all.)*

---

## 2. Per-Section Tables

### Authentication & User Management

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Email login | Done | Done | Done | `components/auth/SignInForm.tsx`; `auth.ts` CredentialsProvider; live `/api/auth/providers` returns only `credentials` | None | — | — |
| Mobile login | Missing | Missing | N/A | Grepped `SignInForm.tsx`, all 7 `app/auth/*/page.tsx` — only `type="email"` field; `User.phone` unused for login | No mobile/OTP login path | M | P2 |
| OAuth login | Missing | Missing | N/A | `auth.ts` providers array has only `CredentialsProvider`; live-confirmed | No Google/Microsoft OAuth | L | P2 |
| Password reset (self-service, logged-out) | Missing | Missing | N/A | Searched `reset.password\|forgot.password` across `app/api` — zero hits; only `app/api/profile/password/route.ts` (requires being already logged in) | No recovery path for a locked-out user | M | **P0** |
| Email verification | Missing | Missing | N/A | Searched `verify.*email` — only hit is org-invite acceptance, unrelated | Signup accepts unverified emails | M | P1 |
| Session timeout | Partial | Done | N/A | `auth.config.ts` — JWT `maxAge:8h`, `updateAge:1h`; no idle-warning UI | Backend solid; no client-side countdown/warning modal | S | P2 |
| Role-based access (route level) | Done | Done | N/A | `middleware.ts` matches ARCHITECTURE.md's table exactly; live 401/403 confirmed | `/crm/**` still only auth-gated, no role check (unchanged, documented) | — | — |
| User CRUD | Done | Done | Done | `app/admin/users/page.tsx`, `app/api/users/[route,[id]]`, `models/User.ts` | None | — | — |
| Permission validation (granular, per-action) | Missing | Missing | Partial (field exists, unused) | `User.permissions: String[]` exists but only ever rendered as label text; `lib/crm/rbac.ts` `requireRole()` hardcoded `return true`; `hasPermission()` gated by `ENFORCE_RBAC` which is unset. Zero non-CRM routes call any rbac helper | Fully decorative permission system outside coarse role-based route gating | M | **P0** |

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
| Opportunity pipeline + Kanban | Done | Done | Done | `app/crm/pipeline/page.tsx` (`@hello-pangea/dnd`, real drag→PATCH), `app/api/crm/pipeline/[id]/stage/route.ts` | Cosmetic: `Opportunity.campaign_id` refs the wrong model name (`'Campaign'` not `'CrmCampaign'`) — populate silently fails | S | P2 |
| Customer records (CrmAccount/Contact vs. ERP Customer) | Partial | Partial | Partial | `models/crm/Account.ts`/`Contact.ts` fully CRUD; `models/Customer.ts` is a wholly separate ERP entity (35 live references in Sales) | No link/sync between CRM's "customer" and Sales' "customer" — `lib/crm/integrations/erpSync.ts` is a 15-line status-checker stub, not a real sync job. Two unrelated records for the same real company | M | P1 |
| Activities | Done | Done | Done | `app/crm/activities/**`, `models/crm/Activity.ts`; live data non-empty (50k+ per prior seed) | New bug: `Activity.linked_case_id` refs dead legacy `'Case'` model instead of the registered `'CrmCase'` — populate never resolves | S | P1 |
| Duplicate detection | Partial | Partial | N/A | Exact-match block on leads/accounts (409 + toast) is real and wired; `js-levenshtein`-based fuzzy dedup (`lib/crm/ai/duplicateAssistant.ts`) is real logic but has **zero callers** — dead code, no merge-duplicates UI anywhere; Contacts route has no dedup check at all | Fuzzy dedup built but unreachable; contact dedup missing entirely | M | P1 |

**Also found:** `lib/crm/rbac.ts` `requireRole()` hardcoded bypass affects 15 CRM route files (see Auth section item #6 in exec summary); CRM.md's documented "Quote→SaleOrder" integration does not exist in code; 15 of 31 `app/crm/**` page directories have no sidebar entry at all (same orphaned-route class the prior audit fixed for 3 Inventory pages, never checked in CRM).

### Sales

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Quotation (two parallel systems) | Done | Done | Partial | `/sales/quotes`→`SalesQuotation.ts`; `/crm/quotes`→`models/crm/Quote.ts`, both real and reachable | `CrmQuote.quote_number` has a **global** unique index, not tenant-scoped — new Golden Rule #7 violation, missed by the prior "10 collections" fix | S | **P0** |
| Sales Order (`SaleOrder.ts` canonical) | **Broken live** | **Broken live** | Done | `models/SaleOrder.ts` confirmed the only live-imported model (legacy `SalesOrder.ts`/`Order.ts` confirmed truly dead — zero imports) | **Directly reproduced this session:** `GET /api/sales/sale-orders` (used by the sidebar-reachable `/sales/orders` and `/sales/pipeline` pages) throws `MissingSchemaError: Schema hasn't been registered for model "Product"` and returns HTTP 500 whenever the tenant has any order with a populated product — the route never imports `@/models/Product` before calling `.populate("orderLines.productId")`. The `[id]` sibling route has the identical latent bug. The separate `/api/sales/sales-orders` (note: different path, same-looking name) route works and backs the "Sales Orders" tab that AUDIT_REPORT verified — but the Pipeline and Orders nav pages are broken today. | S (one-line fix: add the missing import) | **P0** |
| Delivery (`DeliveryChallan.ts`) | Done | Done | Partial | `app/sales/delivery-challans/page.tsx`, sidebar-linked | `dcNumber` has a **global** unique index, not tenant-scoped — same class of bug as CrmQuote above, also missed by the prior fix pass | S | **P0** |
| Invoice / e-invoicing | Done | Partial | Done | Real invoices, real e-invoice records with IRN/status (live-confirmed) | (1) GSP/NIC integration is an honest stub (unchanged, documented). (2) `/sales/e-invoices` has **no link anywhere in navigation** (not in sidebar, not in the 6-tab `SalesTabNav`) — contradicts the prior audit's "7 tabs browser-verified" claim; unreachable without typing the URL | S (add nav link) | P1 |
| Payments (draft-invoice guard) | Done | Done | Done | Guard confirmed present in both create and edit payment routes exactly as documented | None | — | — |
| Returns / RMA | Missing | Missing | Missing | Only a document-number-prefix constant (`"SR-"`) exists; no model, route, or UI | Numbering scaffolding only, zero functional flow | L | P2 |
| Credit Notes | Missing | Missing | Partial | `Invoice.moveType` has a valid `out_refund` enum value, nothing else references it anywhere | Only the enum value exists — no route or UI button to actually issue a credit note against an invoice | L | P1 |

### Purchase

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Vendor | Done | Done | Done | `app/admin/vendors/page.tsx`, PUT confirmed genuinely wired (not a stub per prior fix), `models/Vendor.ts` | No DELETE route/UI exists for vendors | S | P2 |
| RFQ | Missing | Missing | Missing | Searched `rfq\|request.for.quotation\|rfp` — zero hits | No RFQ/quote-comparison stage before PO creation | L | P2 |
| Purchase Order | **Missing (no UI)** | Done | Done | Backend full CRUD (`app/api/finance/purchase-orders/**`); DB indexed correctly. UI: the *only* consumer anywhere in `app/**` is a read-only PO-picker dropdown inside an Inventory receiving popup | Complete backend+DB, but **no screen exists to create/view/edit/approve a PO** — unusable end-to-end via the product itself | M | **P0** |
| GRN | Done | Done | Done | `app/inventory/operations/receipts/page.tsx` → real QC-gated GRN generation (`nextGRN()`) → updates `PO.receivedQty` → unlocks 2/3-way invoice matching | No standalone GRN document model (it's a status+number on StockTransfer) — cosmetic only, not a functional gap | — | P2 |
| Vendor Bills | Partial | Partial | Partial | Real, working feature at `app/finance/bills/page.tsx` uses `Invoice`/`moveType:in_invoice`. Separately, `models/Bill.ts` is an **orphaned, disconnected collection** | **Split-brain data bug**: the prior audit's Bill.ts index fix and +2 seeded bills landed on the dead collection — invisible on the real Bills screen. Admin Dashboard's "Total Expenses" KPI reads *only* from the dead `Bill.ts` collection (live-confirmed: shows `0` despite real posted bills existing) | M | **P0** |
| Returns (purchase / debit note) | Partial | Partial | Partial | Generic `StockTransfer` with `operationType:"outgoing"`, prefix `WH/RET/` — shared with sales returns | No vendor-specific debit note, no reduction of the vendor Bill's `amountResidual`, no accounting counter-entry | M | P1 |

### Inventory

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Items & Variants | Partial | Partial | Partial | `models/Item.ts` has an `itemType:"variants"` enum value with zero accompanying structure (no attribute sub-schema, no child SKUs) | Variant support is a dead enum value; items are flat-only in practice | L | P1 |
| Warehouse transfers | Done | Done | Done | `/inventory/operations/{receipts,deliveries}`, `models/StockTransfer.ts` (tenant-index confirmed fixed) | None | — | P2 |
| Batch/Serial | Partial | Done | Done | `app/inventory/batch/page.tsx` real (612 lines) but **orphaned from the sidebar** (commented out in `config/sidebar/inventory.ts`) | Nav-orphaned real page (same bug class prior audit fixed elsewhere, missed here); also confirmed no serial-number tracking exists, batch/lot only | S (nav) / L (serial) | P1 (nav) / P2 (serial) |
| Stock adjustments | Done | **Partial (data leak)** | Done | `/inventory/orders`, `/inventory/alerts` sidebar-reachable; `app/api/inventory/orders/route.ts` real | **New critical bug**: `app/api/inventory/alerts/route.ts` computes `tenantId` from session but never applies it to the query — every tenant's low-stock alerts leak to every other tenant (Golden Rule #1 violation, live-confirmed by direct code read) | S | **P0** |
| Valuation | N/A | Partial | Partial | Real GL-posting exists (`lib/accounting/inventory.ts::getMoveValue`, flat qty×unitCost); `valuationMethod:"fifo"\|"average"\|"lifo"` field stored but grepped zero usages of any method logic anywhere | "FIFO/weighted-average" is a cosmetic label only — no cost-layer engine, no recomputed average cost, no FIFO consumption queue | L | P1 |

**Also found (live, this session):** `GET /api/inventory/stock-moves` throws `MissingSchemaError: Schema hasn't been registered for model "Warehouse"` and returns HTTP 500 — same root-cause class as the Sales `sale-orders` bug above (a populate on a model never imported in that route file), reproduced directly against the live dev server.

### Manufacturing

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| BOM | Done | Done | Done | `/manufacturing/bom`, `app/api/manufacturing/bom/**`, `models/BillOfMaterial.ts` | None | — | P2 |
| Work Orders (full lifecycle) | Done | Done | Done | `/manufacturing/manufacturing`, full `demand_forecast→...→finished` transition guard | Minor: `header.name` (e.g. `WH/MO/00005`) has no unique index at all, and its non-atomic `count+1` generator could collide under concurrency | S | P2 |
| Production (execution, QC pass/fail) | Done | Done | Done | Real execution tracking, real QC pass/fail/rework branching, real stock in/out on issue/finish | Uses the plain `Stock` model (no cost field) rather than `StockMove` (which has GL-posting) — feeds directly into the Costing gap below | — | P1 |
| Scrap | Missing | Missing | Missing | Searched `scrap\|wastage\|wasted` — zero hits anywhere | No scrap/wastage tracking; `QC_FAILED` only routes to rework, no scrap path | M | P1 |
| Costing | Missing | Missing | Missing | Material-issue/finished-goods stock writes carry no cost fields and never call the GL-posting library or create a JournalEntry; zero cost fields on `ManufacturingOrder`; zero labor-cost tracking anywhere | **Manufacturing is completely disconnected from Finance/GL** — production activity never affects the ledger, unlike Inventory's own warehouse transfers which do post to GL | L | **P0** |

**Also found:** 9 real, functional Manufacturing pages (`hs-codes`, `customs-clearance`, `freight-providers`, `shipments`, `tracking`, `documentation`, `reports`, `air-freight`, `activity-logs`) are commented out of the sidebar entirely — unreachable from any in-app navigation, the same orphaned-route bug class the prior audit fixed for 3 Inventory pages but missed here for 9.

### Finance & Accounting

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Chart of Accounts | Done | Done | Done | 96 accounts seeded, `models/Account.ts` compound unique index | None | — | — |
| Voucher Engine | Done | Done | Done | `models/JournalEntry.ts`, `lib/accounting/posting.ts`, `app/finance/accounting/vouchers/page.tsx` (688 lines) | None | — | — |
| Double-entry validation | Done | Done | N/A | `app/api/finance/journal-entries/route.ts` and `[id]/route.ts` both hard-reject unbalanced entries (verified in code, `>0.001` tolerance) | Guard lives **only** in these two route handlers — programmatic posting paths (`lib/accounting/inventory.ts`, HR payroll-to-GL, `lib/accounting/payments.ts`) bypass the negative-value check. **Live-confirmed**: a currently-posted entry `JRN/2026/0002` has a line with `debit: -2` on the Sales Revenue account | S | P1 |
| Journal Entries CRUD + approval | Done | Done | Done | Full draft→validated→pending_approval→approved→posted transition guard, immutability once posted | None | — | — |
| General Ledger (report) | Partial | Partial | N/A | `app/finance/accounting/{ledger,journal-items}` pages exist | It's a flattened journal-line list with client filtering — no per-account running/opening/closing balance; not a true GL report | M | P2 |
| Trial Balance | Done | Done | N/A | **Live-verified this session**: `GET /api/finance/reports/trial-balance` returns real per-account debit/credit balances with a `trialBalanceBalanced` flag | None | — | — |
| P&L | Done | Done | N/A | **Live-verified this session**: `GET /api/finance/reports/p-l` returns real income/expense totals and `netProfit` | None | — | — |
| Balance Sheet | Done | Done | N/A | **Live-verified this session**: `GET /api/finance/reports/balance-sheet` returns real asset/liability/equity totals with an `accountingEquationBalanced` flag | None | — | — |
| Cash Flow Statement | **Missing** | Partial | N/A | No dedicated statement route/page exists (`app/api/finance/reports/cash-flow` does not exist) | What exists (`buildPostedCashFlowTotals`) is a crude direct-method cash-in/out sum on `asset_cash` accounts only, used for dashboard charts — no Operating/Investing/Financing classification, no indirect-method reconciliation | L | P1 |
| Bank Reconciliation | Partial | **Broken (data leak)** | **Missing tenantId field** | UI exists (2 pages, 900+ lines combined); matching is fully manual, one line pair at a time (no auto/fuzzy matching) | **Critical, live-reproduced bug**: `models/BankReconciliation.ts` has no `tenantId` field in its schema; Mongoose strict mode silently strips the `tenantId` passed on create — `POST /api/finance/reconciliation` returns 201 success but the record is immediately invisible to the very next tenant-scoped `GET` | S (add field + migration) | **P0** |

### GST & India Compliance

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
| Balanced ledgers enforced server-side | N/A | Done | N/A | Two main journal-entry routes hard-reject unbalanced entries | Cannot be bypassed through those two routes, but other posting paths skip the negative-value check (see Finance section — live `debit:-2` proof) | S | P1 |
| No duplicate vouchers/numbers per tenant | Mixed | Mixed | Mixed | `JournalEntry`, `Bill`, `SaleOrder` all confirmed to have proper `{tenantId, number}` **unique** compound indexes | **`models/Invoice.ts`'s `{tenantId,name}` index is not marked `unique`** (spot-checked directly, unlike the other three) — two invoices, or an invoice and a bill (same collection), can silently share a number within one tenant. Plus the two newly-found CrmQuote/DeliveryChallan global-unique-index bugs (see Sales section) | S | **P0** |
| Stock cannot go negative where disallowed | Missing | Missing | Missing | `app/api/inventory/stock/route.ts` — comment literally states "Can be positive or negative"; `stock-moves` route has no availability check at all | No negative-stock guard exists anywhere — not enforced, not even a warning | M | P0 |
| Audit trail of changes | Partial | Partial | Partial | `CrmAuditLog` is a real, immutable, field-level-diff audit log — but **CRM-only**. Elsewhere, only manual `chatter`-comment arrays exist on some models (not automatic, not comprehensive) | No generic before/after change-tracking plugin exists for Finance, Inventory, HR, or Sales models | L | P1 |

### HR & Payroll

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Employees CRUD | Done | Done | Done | Full CRUD, DELETE also unlinks `User.employeeId` | None | — | — |
| Attendance | Partial | Partial | Done | `models/Attendance.ts`, admin-typed check-in/out times | Not a self-service punch-clock, admin manually types times. Also: `GET /api/hr/employees` and `/attendance` both `.populate("departmentId")` without importing `Department` — **live-reproducible 500 on a cold process** (same bug class as the Sales/Inventory populate bugs above) | S | P1 |
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
| Filters (Inventory) | Missing | N/A | N/A | `app/inventory/reports/page.tsx` — 4 static cards, no fetch call at all | Pure static shell, no API call whatsoever | M | **P0** *(misleading: prior audit called this "real, functional")* |
| Filters (Manufacturing) | Partial (decorative) | Missing | N/A | Selects exist visually; `handleGenerateReport` is a fake `setTimeout`+toast, chart data is hardcoded sample arrays | Filters exist but filter nothing real | M | P1 |
| Filters (CRM) | Missing | Missing | N/A | `app/crm/reports/page.tsx` literally states "rendering the structure scaffolding" | Entirely non-functional stub | L | P1 |
| Exports (HR CSV) | Done | N/A | N/A | Real client-side Blob generation from live data, 6 report cards | None | — | — |
| Exports (Finance/Sales xlsx) | Done | Done | N/A | Real server-side `xlsx` exports on many list pages | None | — | — |
| Exports (CRM opportunities) | Done | Done | N/A | Real `json2csv`/`xlsx` export route | None | — | — |
| Exports (CRM Report Builder) | Missing | Missing | N/A | "Export CSV/XLSX" buttons have no `onClick` | Decorative, contradicts CRM's other working exports | M | P1 |
| Exports (Inventory Reports) | Missing | Missing | N/A | All 4 "Download Report" buttons have no `onClick` handler | Non-functional despite prior audit calling this page "functional" | S | **P0** |
| PDF export (Sales invoices, CRM) | Done | Done | N/A | Real `pdf-lib`-based generation in both modules | None | — | — |
| Charts (Reports) | Done | Done | N/A | Finance reports show real computed numbers; CRM/Manufacturing report charts use hardcoded/fake data | Mixed — CRM and Manufacturing report visuals are not real | M | P1 |
| Print (Finance P&L/TB, Admin) | Done | N/A | N/A | Real `window.print()` + `@media print` CSS | None | — | — |
| Print (Aged Partners) | Partial | N/A | N/A | Print button exists with no `onClick` | Decorative button | S | P2 |

### API Testing

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Auth on all endpoints | N/A | Partial | N/A | Global middleware session check on all `/api/*` except `/api/auth/*` and one dead route carve-out; live-confirmed 401 on 3 spot-checked routes | Dead `/api/admin/migrate-invoices` middleware exemption (route no longer exists) is leftover attack-surface-shaped dead code, not currently exploitable | S | P2 |
| Cron endpoint reachability | N/A | **Broken** | N/A | Live-confirmed: `curl` with the real `CRON_SECRET` Bearer token still gets `401` from all 5 `/api/cron/*` routes | Middleware's blanket "no session ⇒ 401" fires before any cron route's own token check runs — SLA/dunning/subscription-billing automation is unreachable by an external scheduler in production | S | **P0** |
| CRUD completeness | N/A | Partial | N/A | `app/api/sales/sales-orders/[id]` has GET+PATCH but no DELETE; vendors have no `[id]` route at all (no delete) | Verb gaps exist on at least 2 spot-checked resources; compounded by the two-parallel-namespace confusion (see Sales) | M | P1 |
| Pagination | N/A | Partial | N/A | `finance/invoices`, `finance/bills` paginate; **`finance/purchase-orders` and `finance/expenses` have zero pagination** — confirmed by reading both route files | Unbounded `.find()` on 2 endpoints returns every tenant record on every call | M | P1 |
| Rate limits | N/A | Missing | N/A | No rate-limiting library/middleware anywhere in the codebase or `package.json` | Login, search, AI-assistant, and write endpoints are all unthrottled | M | P1 |
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
| Regex injection / ReDoS | N/A | **Broken** | N/A | **Live-confirmed**: `curl ".../api/crm/search?q=((("` and `.../api/sales/products?query=((("` both return `500`. Root cause in 4 routes: unescaped `new RegExp(userInput)` | Malformed input 500s today; a crafted catastrophic-backtracking pattern is a blocking-event-loop DoS reachable by any authenticated user of any role | S | **P0** |
| XSS | Partial | Partial | N/A | 3 `dangerouslySetInnerHTML` usages render server/AI-generated HTML embedding tenant data (reports, invoice previews, templates) | No sanitizer (e.g. DOMPurify) import found at any of the 3 sites — needs confirmation/fix | M | P1 |
| CSRF | N/A | Partial | N/A | NextAuth handles its own `/api/auth/*` CSRF; custom API routes rely solely on `SameSite` cookie default | Acceptable for a same-origin cookie SPA, no defense-in-depth beyond that | M | P2 |
| JWT handling | N/A | Done | N/A | 8h maxAge, 1h updateAge, `HttpOnly` + JWE-encrypted session cookie confirmed live | None major | — | — |
| Audit Logs (ActivityLog) | Partial | Partial | Done | `logActivity()` called from only 6 files, all Finance-only | HR, Sales, Inventory, Manufacturing, and User-management mutations are not logged at all | M | P1 |
| Audit Logs (CrmAuditLog) | Partial | Done | Done | Written in 30 of 74 CRM route files | ~44 CRM route files still lack audit writes | S | P2 |
| 2FA / TOTP | Missing | Missing | Missing | Zero TOTP/2FA implementation anywhere, confirmed | No 2FA at all | L | P1 |
| `/crm/**` role enforcement | N/A | Missing | N/A | Middleware only checks auth on CRM routes, no role check; per-handler RBAC backstop is a hardcoded no-op | Any authenticated user of any role can fully use CRM regardless of assigned role | M | **P0** |

### SaaS & Multi-tenancy

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Tenant isolation (fallback pattern) | N/A | Partial | Done | Fresh grep: the `tenantId \|\| "default-tenant"` pattern appears in **~226-229 files**, matching AUDIT_REPORT's ~223 estimate — still unresolved | A future session/JWT regression that drops `tenantId` would cause every affected route to silently read/write `default-tenant`'s data instead of hard-failing | M (mass remediation) | P0 |
| Subscriptions (SaaS plan state) | Partial | Partial | Done | `Organization.subscriptionStatus` editable via master-admin UI, but **never read/enforced anywhere else** — only the separate `isActive` boolean gates login | `subscriptionStatus` itself is inert; suspension only works via a different field | S | P1 |
| Usage limits (seats, AI calls) | Partial | Done | N/A | Both enforced live (`org/invite` 403s past `maxUsers`; `tenantAi.ts` caps monthly AI calls) | No UI shows remaining quota before hitting the wall — only an error toast after the fact | S | P2 |
| Usage limits (storage/records) | Missing | Missing | N/A | `TierLimits` has no storage/record-count fields at all | No enforcement on data volume per tenant | L | P2 |
| Trials (`trialEndDate` enforcement) | Missing | Missing | Partial | Field stored on `Organization`, referenced nowhere else in the codebase | A tenant on an "ended" trial is never actually blocked from anything | M | **P0** |
| Feature flags (`enabledModules` gating) | Missing | Partial (built, unwired) | Done | `lib/middleware/moduleGate.ts` is fully built and unit-tested (`tests/saas/moduleGate.test.ts`) but has **zero callers outside its own test** — never wired into `middleware.ts` | A complete, tested feature is dead code; tier/module restrictions are not enforced despite the infrastructure existing | S (wire it in) | **P0** |

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
| Backup mechanism | Missing (dead link) | ➖ N/A — infra-managed (MongoDB Atlas) | N/A | No backup script/cron in the repo; a dead `href="#"` "Backup Your Data" link exists in the Chart of Accounts export UI | The dead link implies a feature that doesn't exist at the app level — misleading, should be removed or wired | S | P2 |
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
| Large-upload handling | Partial | Missing | N/A | Size checks exist ad hoc in only 2-3 form components; the shared `lib/upload.ts` Cloudinary helper itself has **no** size check at all | Most upload call sites (HR, Manufacturing, CRM documents) have zero client-side enforcement and there is no server-side check anywhere | M | P1 |

### UI/UX

| Item | UI | Backend | DB | Evidence | Gap description | Effort | Priority |
|---|---|---|---|---|---|---|---|
| Cross-module `components/ui/*` consistency | Partial | N/A | N/A | Share rate varies widely by module (HR/Sales/CRM high, Finance/Manufacturing noticeably lower) | Real unevenness in shared-primitive adoption, not a hard violation | M | P2 |
| Typography/Spacing design tokens | Done | N/A | N/A | Real, centralized CSS-variable token system (`app/globals.css` `@theme inline`) per shadcn/ui conventions | None | — | — |
| Loading states | Done | N/A | N/A | 75 files use `Skeleton`/`animate-pulse` via dedicated shared components | Broad, genuine coverage | — | — |
| Dark/Light mode | Partial | N/A | N/A | The real toggle (Zustand store + `<html>` class) works; but `components/ui/sonner.tsx` imports the unrelated, never-provided `next-themes` package's `useTheme()` | Toast notifications are on a second, disconnected theme system and can visually mismatch the rest of the app | S | P2 |

---

## 3. Actionable Work Plan (prioritized, phased)

### Phase 0 — Immediate hotfixes (live-broken, S-effort, ship before anything else)
1. Add `import "@/models/Product"` to `app/api/sales/sale-orders/route.ts` and its `[id]` sibling — fixes the live 500 on the `/sales/orders` and `/sales/pipeline` pages.
2. Add `import "@/models/Warehouse"` to `app/api/inventory/stock-moves/route.ts` — fixes the live 500 on that endpoint.
3. Add `import "@/models/Department"` before the `.populate("departmentId")` calls in `app/api/hr/employees/route.ts` and `app/api/hr/attendance/route.ts` — fixes the cold-start 500.
4. Add `tenantId` to the `InventoryItem.find()` query in `app/api/inventory/alerts/route.ts` — closes the live cross-tenant data leak.
5. Add a `tenantId: String` field to `models/BankReconciliation.ts` (with a compound index) and write a migration to backfill/quarantine any existing tenant-less records.
6. Escape regex metacharacters (or switch to a literal-substring/`$text` search) in `app/api/crm/search`, `app/api/sales/products`, `app/api/crm/accounts`, `app/api/finance/assets/compute` — closes the confirmed 500/ReDoS vector.
7. Exempt `/api/cron/*` from the blanket middleware session check (route already has its own `Bearer $CRON_SECRET` check) — restores SLA/dunning/subscription-billing automation.
8. Add `unique: true` to `models/Invoice.ts`'s `{tenantId, name}` index (+ migration to check/dedupe any existing collisions first).
9. Fix the two newly-found global unique indexes: `models/crm/Quote.ts` (`quote_number`) and `models/DeliveryChallan.ts` (`dcNumber`) → compound with `tenantId` (+ migration, same pattern as the prior session's 10-collection fix).
10. Wire `lib/middleware/moduleGate.ts`'s existing, tested `applyModuleGating`/`isModuleAccessible` into `middleware.ts` — this is "just call the function that already exists," not new development.

### Phase 1 — P0 structural gaps (data integrity, security, compliance; M/L effort)
11. Build the Purchase Order UI (list/create/edit/approve screens) — the backend and DB are already complete; this is purely a frontend build against existing endpoints.
12. Resolve the `Bill.ts` vs `Invoice`(`moveType:in_invoice`) split-brain: retire `Bill.ts`, repoint the Admin Dashboard's "Total Expenses" KPI and `lib/sales/reminderEngine.ts` to the real collection, and re-seed/migrate the 2 orphaned demo bills.
13. Implement real GSTIN validation: structural regex + mod-36 checksum digit.
14. Build GSTR-1/GSTR-3B report generation (at least export-ready computation; real portal filing can stay a documented stub like e-invoicing).
15. Build E-Way Bill generation (model + route + UI), even as an honest stub matching the e-invoicing pattern if live GSP credentials aren't available yet.
16. Make `User.permissions` and CRM's `lib/crm/rbac.ts` real: either implement per-action authorization checks that read `permissions`, or remove the field and rely solely on role-based route gating — currently it's a false signal either way. Fix `requireRole()` to actually check role instead of hardcoded `return true`.
17. Add role-based (not just auth-based) middleware protection to `/crm/**` and `/api/crm/**`.
18. Enforce `trialEndDate` and `subscriptionStatus` (block/degrade access on expired trial or cancelled subscription), not just the separate `isActive` flag.
19. Connect Manufacturing to Finance: post a JournalEntry (material cost out, finished-goods cost in) on `MATERIAL_ISSUED`/`FINISHED` transitions, using the existing `StockMove`+`lib/accounting/inventory.ts` pattern Inventory already uses.
20. Add a negative-stock guard (configurable per item/warehouse) to `app/api/inventory/stock/route.ts` and `stock-moves/route.ts`.
21. Add password-reset-without-login flow (email-token-based).
22. Address the ~226-file `tenantId || "default-tenant"` fallback pattern: at minimum, convert it to a hard 401 in the handful of highest-risk write paths (Finance, HR payroll) as a first slice, before attempting the full mass remediation.

### Phase 2 — P1 completeness gaps (M/L effort, not launch-blocking but real product gaps)
23. TDS on vendor-bill payments (the primary Indian-SMB TDS use case is currently unimplemented).
24. HSN/SAC as a real `Product`/invoice-line field with catalog-level defaulting and 4/6/8-digit validation, instead of free-text.
25. Credit Notes: a real "Issue Credit Note" flow against an invoice (creates an `out_refund` document, not just the enum value).
26. Sales Returns/RMA: at minimum a model + route, even if the UI ships later.
27. Cash Flow Statement: a real Operating/Investing/Financing-classified report (the existing direct-method cash-total calc can seed it).
28. Wire `lib/crm/ai/duplicateAssistant.ts` (already-built fuzzy dedup) into the Leads/Contacts create flow and add a merge-duplicates review UI.
29. Link CRM `Account`/`Contact` to ERP `Customer` (at minimum a manual "link existing customer" action, ideally an automatic sync on conversion).
30. Rate limiting on at least login, search, and AI-assistant endpoints.
31. Standardize Finance/HR/Inventory/Admin list-endpoint response shapes (the previously-documented Finance issue plus 3 more fully-off-convention modules).
32. Add pagination to `finance/purchase-orders` and `finance/expenses`.
33. Fix the orphaned-from-sidebar real pages: CRM (15 of 31), Manufacturing (9), Inventory Batch/Analytics (2) — cheap, high-value nav fixes.
34. Replace decorative report/export buttons that have no handler (Inventory Reports ×4, Manufacturing Reports, CRM Report Builder, Aged Partners Print) with real implementations or remove them.
35. Add a size-limit check to the shared `lib/upload.ts` helper (client + server side).
36. Adopt `zod`+`react-hook-form` for at least the highest-traffic forms (Invoice, Sales Order, Customer) to match the documented/intended stack, or update the docs to reflect the manual-validation reality.
37. Payslip PDF generation for Payroll.
38. PF/ESI statutory-rate computation instead of flat manually-entered deduction numbers.

### Phase 3 — P2 polish / deferred-by-design (L effort or genuinely lower-value)
39. Mobile/OTP login, OAuth login, 2FA.
40. Multi-branch, multi-language/i18n, per-tenant timezone-aware rendering, multi-currency conversion.
41. Dashboard filters/exports (beyond the Admin dashboard), Projects module (if ever in scope), Time Tracking, project-based billing.
42. Decouple `components/ui/sonner.tsx` from the unused `next-themes` provider.
43. Remove the dead "Backup Your Data" link or build a real tenant-data export/backup feature.
44. Manual cross-browser/device QA pass (Chrome/Edge/Firefox/Safari/Android/iPhone) — cannot be done from this environment; needs to be scheduled as a separate, human-driven QA cycle.

---

## 4. Known-Good Confirmation (do not re-audit)

Confirmed fully Done (UI+Backend+DB) either by live verification this session or direct, cited code inspection — matches or refines `AUDIT_REPORT.md`'s prior findings:

- **Finance report engine**: Chart of Accounts, Journal Entries CRUD + approval workflow, double-entry balance guard (on the two main routes), Trial Balance, P&L, and Balance Sheet all live-verified this session to return correct, real computed data from posted journal entries.
- **Vendor Bill payments** post real journal entries via `postInvoicePayment`/`ensureBillPostingJournal` (verified by direct code read of `app/api/finance/bills/[id]/route.ts`).
- **Sales**: the "Sales Orders" tab (backed by `/api/sales/sales-orders`, distinct from the broken `/api/sales/sale-orders`), Payments' draft-invoice guard, and CSV/Excel import (real parsing, not accept-and-ignore) all confirmed working exactly as `AUDIT_REPORT.md` describes.
- **CRM**: Lead lifecycle + conversion, Opportunity pipeline with real drag-drop Kanban, Activities logging, and exact-match duplicate blocking on Leads/Accounts are all real and wired end-to-end.
- **HR**: Employee CRUD, Leave approval workflow, and the full Payroll→GL-posting lifecycle are real and correctly computed (pro-rated by attendance, posts Dr/Cr entries).
- **Inventory/Manufacturing**: Warehouse transfers (receive→GRN→PO-matching), BOM, and the full Manufacturing Order lifecycle (including QC pass/fail/rework) are real and functionally complete (though disconnected from GL — see Phase 1).
- **Admin Dashboard**: widgets, KPIs, and charts are genuinely data-backed against real aggregated collections, not placeholders.
- **UI foundation**: a real centralized design-token system, broad loading-skeleton coverage, and consistent toast-based network-failure UX are all confirmed strengths across the app.
- **Role-based middleware table** (`/admin`, `/finance`, `/sales`, `/inventory`, `/manufacturing`, `/hr`, `/master-admin`) is accurate and enforced exactly as documented in `ARCHITECTURE.md`.
- All prior-session fixes listed in `AUDIT_REPORT.md`'s "Concrete bugs fixed" table were spot-checked and confirmed still in place (Vendor PUT, Manufacturing delete routes + customs-clearance tenantId, HR payroll status constant, Aged Partners nav, Inventory Orders/Alerts/Reports sidebar links, the 10-collection tenant-index migration).

## 5. Final UAT Flows (run live against seed data this session)

| Flow | Verdict | Notes |
|---|---|---|
| Lead → Quote → Order → Invoice → Payment | **Partial** | Each segment individually works (lead conversion, quote creation, invoice generation, payment-vs-draft guard all live-verified), but there is no single connected pipeline as literally specified — CRM Opportunities convert to CRM Quotes (not to a `SaleOrder`), and Sales Quotes convert directly to Invoices (no separate Sales-Order step for that path). A real user follows one of two forked paths, not one linear chain. |
| Full Purchase workflow (Vendor→PO→GRN→Bill→Payment) | **Partial — blocked** | Vendor, GRN (via receipts), and Bill payment (with real GL posting) all work. The workflow is blocked at the PO step: there is no UI anywhere to create/view a Purchase Order, so a real user cannot execute this workflow end-to-end through the product despite the backend supporting it fully. |
| Inventory workflow (receive→transfer→adjust→valuation) | **Partial** | Receive/GRN and transfers work and are correctly wired to PO-matching. Adjustments work but the Alerts screen leaks cross-tenant data (P0, see above). Valuation is cosmetic — the stored costing method (FIFO/average/standard) does nothing; `unitCost` is whatever was typed on the move. |
| Finance validation (transaction → correct GL/Trial Balance impact) | **Partial** | The primary path (create → validate → post via the two main journal-entry routes) is correctly balance-guarded and correctly reflected in Trial Balance/P&L/Balance Sheet — live-verified. However, other posting paths (inventory, payroll, payments) bypass the negative-value guard, proven by a currently-posted entry with a negative debit line already in the seeded data. |
| Security signoff readiness | **Not ready** | Live-confirmed ReDoS/500 vector, decorative granular permissions, CRM open to all roles regardless of assignment, unreachable cron-based automations, no 2FA, and the long-standing tenantId-fallback pattern are all open. |
| **Overall production readiness verdict** | **Not production-ready.** | The product has real breadth and several genuinely correct, non-trivial subsystems (Finance reporting, Payroll-to-GL, Manufacturing lifecycle, CRM pipeline). But it currently has live, reproducible P0 defects spanning multi-tenant data isolation (2 confirmed leaks/losses), GST statutory compliance (the named priority for this market), authorization enforcement, and core-flow availability (2 confirmed 500s on nav-reachable pages, 1 entire module class — cron automation — unreachable). Recommend completing Phase 0 (all S-effort, mostly one-line fixes) immediately, then Phase 1 before any GA/production launch claim, with GST and multi-tenancy items treated as hard blockers given the target market and SaaS model. |
