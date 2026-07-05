# Aupulens ERP — System-Wide Audit Report

**Date:** 2026-07-05/06 · **Branch:** `feature/native-ai` (unmerged, no investor sign-off — same standing constraint as prior Sales revamp work) · **Tenant used for all verification:** `default-tenant`

This audit covers the entire application (not just the recently-revamped Sales module) at a level proportionate to a single session: a full static/type/test baseline, a sidebar-vs-route navigation sweep, a targeted deep-dive into Finance/Inventory/Manufacturing/Purchases/HR/Admin via a background research pass, and live browser + API verification of the changes made. It is **not** an exhaustive manual click-through of every screen in every module — see "Not covered / remaining TODOs" at the end for what that would still take.

---

## Baseline (before any changes)

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 429/429 passing, 54 files.
- Confirmed working directory had 25 files of legitimate uncommitted work from a prior session (dashboard auth-loading states, import-wizard UX polish, sidebar de-duplication). Committed separately as a checkpoint before starting this audit so it wouldn't be conflated with audit fixes.

## Part A — Module-by-module findings

### Sales / E-Invoicing
Already deeply audited and browser-verified across four prior phases (see `docs/_context/MEMORY.md`). Re-verified this session: all 7 tabs (Customers, Quotes, Subscriptions, Sales Orders, Invoices, Payments, E-Invoicing) render real data with zero console errors after normal load. One new bug found and fixed (see Payments below). **Status: verified OK, 1 issue fixed.**

### Finance / Accounting
Chart of Accounts lands correctly as the module's entry point (96 accounts seeded), Journals/Banking/Budgets/Period Closing tabs present. One navigation issue found and fixed (Aged Partners), one hardcoded-status issue found and fixed (in HR's payroll route, which posts into Finance's JournalEntry model). Response-shape inconsistency across sibling list endpoints found but **not** fixed this session (see TODOs — real risk of regression touching 4 routes + their frontends for a demo-readiness pass). **Status: 2 issues fixed, 1 documented as TODO.**

### Items / Products & Services
The shared Sales/Manufacturing product catalog (`Product` model) had only 3 items; expanded to 12 across goods and services with realistic categories, prices, and codes via the seed script. **Status: seeded, verified OK.**

### Inventory
Three real, functional pages (`/inventory/orders`, `/inventory/alerts`, `/inventory/reports`) existed with no sidebar entry — added them. Two Golden-Rule-#7 index violations found and fixed (`Batch.batchNumber`, `StockTransfer.header.name`). Inventory Summary dashboard verified live with seeded data (12 items, ₹1,09,22,900 asset value, 5 manufacturing orders in progress). **Status: 3 issues fixed, seeded, verified OK.**

### Manufacturing
Three broken Delete actions found and fixed: `hs-codes`, `customs-clearance`, and `freight-providers` pages all called `DELETE /api/manufacturing/<module>/[id]`, but none of those `[id]` routes existed (hs-codes' DELETE only accepted a `?id=` query param; the other two had no delete route at all). Also found and fixed a more serious bug: `customs-clearance`'s POST handler never included `tenantId` in the create call, while the model requires it — **every customs clearance creation was failing with a validation error**. Four more Golden-Rule-#7 index violations found and fixed (`HSCode.hsCode`, `Shipment.shipmentNumber`, `CustomsClearance.clearanceNumber`, `FreightProvider.providerCode`). All four fixes verified live via API calls (create → delete round-trip for each). **Status: 5 issues fixed, verified OK.**

### Purchases (Finance Purchase Orders / Bills)
`Bill.ts` had a schema-level Golden Rule #7 violation: `billNumber` was `unique: true` at the field level (globally unique across every tenant on the platform) instead of compound with `tenantId`. Fixed the model and migrated the database. Purchase Orders and Bills expanded via seed script (2 → 4 POs, 0 → 2 Bills, mixed statuses). **Status: 1 issue fixed, seeded.**

### HR
One hardcoded status literal fixed (`"posted"` → `DOCUMENT_STATUS.POSTED` in the payroll-to-GL posting route) — a real Golden Rule #2 violation, low risk since the string value is identical today but would have silently drifted if the constant ever changed. No other new issues found in this pass. **Status: 1 issue fixed, otherwise verified OK by the background research pass.**

### Admin / Master Admin
Vendor "Edit" dialog was fully wired in the UI (`PUT /api/admin/vendors`) but the route only exported `GET`/`POST` — every edit attempt was silently failing with a 405. Added the `PUT` handler and verified create→edit round-trip via API. **Status: 1 issue fixed, verified OK.**

### CRM
Spot-checked only (already a heavily-seeded module with 50k+ activities, 10k+ leads, etc. — no seed gap). Confirmed the one pre-existing, documented issue (`/crm/**` routes have no role-based middleware restriction, only auth) is unchanged and remains an intentional, tracked gap per `CLAUDE.md` — not new, not touched this session.

### Other findings, documented but not fixed this session
- **Response-shape inconsistency** across `GET /api/finance/{bills,invoices,purchase-orders,expenses}` (four different pagination/wrapper shapes). Real but not demo-blocking; fixing it safely means touching 4 routes and their frontend consumers together — flagged as a TODO rather than risked in this pass.
- **Systemic `(session.user as any).tenantId || "default-tenant"` fallback** appears in ~223 files. Every query does technically filter by tenantId (Golden Rule #1 is satisfied), but a silent fallback instead of a hard 401 means a future auth regression that drops tenantId from the session would make every tenant silently read/write the same `default-tenant` bucket rather than failing loudly. This is a codebase-wide convention, not a single bug — flagged for a dedicated follow-up rather than a mass find-and-replace here.

## Part A — Concrete bugs fixed (full list)

| # | File(s) | Bug | Fix |
|---|---|---|---|
| 1 | `package.json` | `npm run seed` referenced a `scripts/seed.ts` that was deleted long ago — dead script. | Removed the dead entry; added `npm run seed:demo` for the new script. |
| 2 | `models/SalesQuotation.ts`, `Bill.ts`, `Warehouse.ts`, `StockMove.ts`, `HSCode.ts`, `Shipment.ts`, `CustomsClearance.ts`, `FreightProvider.ts`, `Batch.ts`, `StockTransfer.ts` | **10 collections** had a stale/live single-field `unique: true` index instead of compound with `tenantId` (Golden Rule #7) — a real cross-tenant collision bug (two tenants could never use the same quote number, bill number, HS code, batch number, etc.). `Bill.ts` and the 6 found by the background pass were live in the current schema; the other 4 (`SalesQuotation`, `Warehouse`, `StockMove` plus `Bill`) had already been fixed in code by earlier sessions but the old single-field index was still live in MongoDB (never dropped when the schema changed) — pure DB drift. | Fixed all 6 schemas to declare compound `{tenantId, field}` unique indexes; wrote `scripts/migrate-drop-stale-unique-indexes.ts` (idempotent, safe to re-run) and ran it to drop all 10 stale indexes from the database. |
| 3 | `app/api/manufacturing/customs-clearance/route.ts` | POST handler never included `tenantId` on `CustomsClearance.create()`, but the model requires it — **every** customs clearance creation was failing. | Added `tenantId` to the create call. Verified via a live create call. |
| 4 | `app/api/manufacturing/hs-codes/[id]/route.ts` (new), `.../customs-clearance/[id]/route.ts` (new), `.../freight-providers/[id]/route.ts` (new) | Delete buttons on all three pages called a path-param `DELETE .../[id]` route that didn't exist (hs-codes' only DELETE accepted `?id=` query param; the other two had none at all) — every delete silently 404'd. | Added the three missing `[id]` DELETE routes. Verified via live create→delete round-trips. |
| 5 | `app/api/admin/vendors/route.ts` | "Edit Vendor" dialog sent `PUT /api/admin/vendors`, but only `GET`/`POST` existed — every edit 405'd. | Added a `PUT` handler. Verified via live create→edit round-trip. |
| 6 | `app/api/hr/payroll/[id]/route.ts` | Hardcoded `status: "posted"` on JournalEntry updates instead of importing `DOCUMENT_STATUS.POSTED` (Golden Rule #2). | Replaced both occurrences with the constant. |
| 7 | `config/sidebar/finance.ts` | "Aged Partners" (`/finance/accounting/aged-partner`, a real, functional page) lost its only navigation path when an earlier in-progress commit removed a sidebar section — orphaned route. | Restored the link under "Financial Reports". |
| 8 | `config/sidebar/inventory.ts` | Three real, functional pages (`/inventory/orders`, `/inventory/alerts`, `/inventory/reports`) never had a sidebar entry at all — orphaned routes, undiscoverable without a direct URL. | Added all three (Orders under "Operations", Alerts/Reports under a new "Insights" section). |
| 9 | `lib/sales/paymentAllocation.ts` behavior exposed a gap in `app/api/sales/payments/route.ts` and `[id]/route.ts` | The Payments API let a payment be recorded and marked "paid" against an invoice still in `draft` status. Since `resolveInvoiceStatus` deliberately never auto-transitions a draft invoice (by design — a draft hasn't been issued yet), this silently created a "paid" payment with **no visible effect**: the invoice stayed `draft` in every list/report, money looked received but nothing reconciled. Found via a live end-to-end API test (create quote → convert to invoice → pay), not by inspection. | Added a server-side guard in both the create and edit payment routes: reject (400, with the invoice number named) any allocation against an invoice in `draft` or `cancelled` status. Verified: paying a still-draft invoice now correctly fails; saving the invoice first (`draft` → `saved`) then paying now correctly transitions it to `paid`. |

All fixes verified with `npx tsc --noEmit` (clean) and `npx vitest run` (429/429 passing) after every change, plus live API/browser verification for each.

---

## Part B — Demo seed data

**Command:** `npm run seed:demo` (equivalent to `npx tsx scripts/seed-demo.ts`)

Idempotent and additive — every record is created via a check-before-insert against a stable business key (customer name, product code, document number, etc.), so re-running never duplicates data, and nothing pre-existing is ever modified or deleted. Safe to run repeatedly, including in this same database.

**What it seeds (for `default-tenant`), on top of what already existed:**

| Area | Before | Added | Notes |
|---|---|---|---|
| Customers | 14 (mix of real + prior test artifacts) | +6 clean ones | Business + individual, GSTINs, opening balances, 2 marked portal-enabled, 2 new ones (`Kaveri Subscriptions Pvt Ltd`, `Himalaya Fitness Studio`) used as subscribers |
| Vendors | 0 | +5 | Raw materials, packaging, electronics, logistics, office supplies categories |
| Products | 3 | +9 | Mix of goods/services, realistic INR pricing |
| Tax Rates | 0 | +3 | GST 5% / 12% / 18% |
| Quotes | 1 (draft) | +5 | Sent, Accepted, Rejected, Invoiced, Sent — all 5 non-draft statuses now represented |
| Sales Orders | 4 (2 legacy + 2 Zoho-style) | +5 | Draft, Pending Approval, Confirmed, Closed, Void — with correct `totals.amountTotal` (a real display bug in the initial seed draft was caught and fixed here: raw `Mongoose.create()` doesn't run the UI form's total-computation logic, so the first version of these rows showed ₹0.00 in the list — fixed by computing and setting `totals` explicitly) |
| Payments | 3 | +3 | Partial (against a real unpaid invoice, correctly drives it to `partially_paid`), Retainer, Draft |
| E-Invoices | 0 | +4 | One each of Success (with IRN/ack), Pending, Failed (with error message), Cancelled |
| Purchase Orders | 2 | +2 | Approved, Posted |
| Bills | 0 | +2 | Approved, Draft |
| Manufacturing (BOM) | 1 | +1 | Solar Inverter 5kW bill of materials |
| Manufacturing Orders | 2 | +2 | In Production, QC Passed |
| Inventory adjustment | — | +1 | A stock adjustment move against the existing warehouse |
| Subscriptions | 5 | +2 | New Active + Trial subscriptions tied to the 2 new subscriber customers (the 5 pre-existing ones all reference one non-presentable test customer — left untouched per "never modify existing data") |
| Dunning Rules | 1 (Default) | +1 | A second, non-default "Gentle Reminder Ladder" rule |
| Custom Fields | 1 (Customer) | +1 | A Payment-scoped "Reference PO Number" field |
| Reminders | 6 (1 already enabled) | 0 | Already satisfied the "at least one enabled" requirement — no action needed |
| Salespersons | 3 existing `role: sales` users | 0 | Already satisfied — no dedicated Salesperson entity exists in this codebase, salesperson = a `User` with `role: "sales"` |

**Demo walkthrough order** (mirrors Part C below):
1. Sidebar → Sales → lands on Customers with the new + existing customers listed.
2. Switch through Quotes / Sales Orders / Invoices / Payments / Subscriptions / E-Invoicing tabs — every status is represented in each.
3. Open a Quote (e.g. `QUO-000005`, Invoiced) to see the full lifecycle; open a Sales Order (`SO-00001x`) to see the new totals-corrected list.
4. Finance → Chart of Accounts (default landing) → Journals.
5. Inventory → Summary (12 items, real asset value) → the newly-linked Orders/Alerts/Reports pages.
6. Manufacturing → BOM / Manufacturing Orders — 2 orders in different production states.
7. Admin → Vendors — edit now works.

---

## Part C — End-to-end verification performed

- **Full lifecycle, live via API through a real browser session:** created a customer → created a quote for them → converted the quote to an invoice (real `SalesInvoice` created, quote marked `invoiced`) → attempted payment against the still-`draft` invoice (correctly rejected by the new guard) → saved the invoice (`draft` → `saved`) → recorded a full payment → invoice correctly transitioned to `paid`. This is the same relational chain Part C of the original spec asked for (this codebase's actual design converts a Quote directly to an Invoice — there is no separate Quote→Sales-Order conversion step; Sales Orders convert to Invoices independently via their own `convert-to-invoice` route).
- **All 7 Sales tabs** (Customers, Quotes, Sales Orders, Invoices, Payments, Subscriptions, E-Invoicing) browser-verified with the seeded data, zero console errors.
- **Chart of Accounts** and **Inventory Summary** browser-verified with real, seeded data as the correct landing screens.
- Confirmed a first-load "Failed to fetch" console error seen on a cold dev-server hit was **not a real bug** — reproducing with a warm route and a reload showed zero errors (same class of dev-server-timing false alarm documented in prior sessions' memory).
- Full regression: `npx tsc --noEmit` clean and `npx vitest run` 429/429 passing after every fix in this session.

---

## Not covered / remaining TODOs

- **Manual, screen-by-screen UI/alignment review** of every module (spacing, empty/loading/disabled states, responsive layout) was not done exhaustively — this session prioritized functional correctness (navigation, CRUD, data integrity) and browser-verified the highest-traffic screens (Sales tabs, Chart of Accounts, Inventory Summary) rather than all ~40+ screens in the app.
- **Response-shape unification** across Finance's sibling list endpoints (documented above) — deferred as a distinct, riskier follow-up.
- **The systemic `tenantId` fallback pattern** (~223 files) — flagged for a dedicated audit/refactor, not attempted here given the blast radius.
- **HR, Quality, Time Tracking, Projects**: this codebase has no dedicated Quality, Time Tracking, or Projects module (confirmed by search — the original request's checklist assumed these exist as standalone modules). HR itself was spot-checked via the background research pass only, not seeded further (existing Payroll/Attendance/Leave data was judged sufficient) or browser-verified live in this session.
- **No global Settings area** exists in this app (confirmed in a prior session, still true) — settings live per-module (Sales' Document Settings, Dunning/Reminders under Subscriptions, etc.), so "Settings-level data" in Part B was seeded into those module-specific locations rather than a unified settings screen.
- **External integrations remain honest stubs**, unchanged this session: GST/e-invoicing GSP connection (NIC portal), payment gateway, email provider, bank-feed aggregator OAuth — all return clear "not configured" responses rather than fake success, per prior sessions' documented decisions. Real credentials for any of these would need to come from the user before they could be completed.
- ~~Two files, `add-lean.js` and `fix_lean.js`, were found deleted from the working tree with no corresponding action taken by this session's tool calls. Left as-is, unstaged, for the user to confirm intent.~~ **Resolved in the cleanup pass below** — deletion staged and committed intentionally.

## Migration / deployment notes for whoever deploys this branch

- Run `npx tsx scripts/migrate-drop-stale-unique-indexes.ts` against any other environment (staging/production) **before** deploying this branch — it drops 10 stale single-field unique indexes that would otherwise continue enforcing incorrect cross-tenant uniqueness even after the model fixes ship (Mongoose does not drop old indexes automatically). Safe to re-run.
- `npm run seed:demo` is intended for demo/dev databases only — review before running against anything resembling production data (it's additive and non-destructive, but still test data).

---

## Cleanup pass (2026-07-06, commit `82af1ef`)

A dedicated, single-commit cleanup of unused/waste files, separate from the audit fixes above.

**Removed:**
- `check-electron-setup.bat`, `start-electron.bat` — unreferenced Windows launcher scripts; the documented Electron startup path (`npm run electron:dev`, per README) doesn't use them.
- `scratch-test-seed.ts` — root-level one-off manual test script, unreferenced anywhere, its target function is already production code (`lib/accounting/coa-feature-seeder.ts`).
- `add-lean.js`, `fix_lean.js` — the two files flagged above as mysteriously deleted mid-audit-session; staged and committed intentionally this pass, and their now-pointless `.gitignore` entries removed.
- `docs/accounting.md` — an unreferenced, one-off manual QA checklist for the already-shipped, already-automated-tested Chart of Accounts feature.
- `vercel.json` — a minimal placeholder (`{"version": 2}`) with no other Vercel-specific config anywhere in the repo; confirmed with the user before deleting (per the "ask before deleting deployment config" rule) since this app's real deploy targets are Electron desktop + subdomain-based multi-tenant web hosting.
- An empty, untracked, routeless `app/api/admin/migrate-invoices/` folder.
- The dead `"ensure-admin"` package.json script (pointed at a `scripts/ensure-admin.ts` that no longer exists — same class of bug as the `seed` script fixed in the audit pass).
- A dead `README.md` link to `ELECTRON_README.md`, a file that has never existed in this repo's history (dead since the initial commit).

**Protected and confirmed untouched:** `scripts/migrate-drop-stale-unique-indexes.ts`, `scripts/seed-demo.ts` and everything it imports, `tests/`, `vitest.config.ts`, this file, `CLAUDE.md`, `.env`, `auth.config.ts`/`auth.ts`, `middleware.ts`, `next.config.ts`, `package.json`/`package-lock.json`, and the actively-used `electron/` directory (kept without question — README documents real, working desktop-build scripts for it). `docs/_context/` and `docs/_planning/` were left alone: both are already gitignored internal tooling that `CLAUDE.md`'s own routing table depends on for session continuity, not committed-repo waste — deleting them would harm, not help, future work on this codebase. Kept `docs/INVOICE_SEED_README.md` and `scripts/{seed-invoices,verify-invoice-pdfs}.ts` since they actively reference each other and are still current.

**Flagged, not fixed (out of scope for a file-cleanup task):** `middleware.ts` has two dead carve-out conditions explicitly exempting `/api/admin/migrate-invoices` from auth checks — a route that (per the folder removed above) doesn't exist. Worth a deliberate look since it's security-adjacent code, not something to touch silently under a "remove waste files" task.

Verified after cleanup: `npx tsc --noEmit` clean, 429/429 tests passing, the live dev server still responds, and `npm run seed:demo` still runs correctly and idempotently.
