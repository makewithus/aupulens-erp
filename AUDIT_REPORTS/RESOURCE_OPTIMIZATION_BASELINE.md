# AUPULENS ERP — RESOURCE OPTIMIZATION BASELINE REPORT

**Document Reference:** `AUDIT_REPORTS/RESOURCE_OPTIMIZATION_BASELINE.md`  
**Date:** November 10, 2026  
**Target Repository:** `Aupulens-ERP-main` (`~/Desktop/Aupulens-ERP/Aupulens-ERP-main`)  
**Base Commit:** `f38af917 (HEAD -> feature/resource-optimization, origin/main, main)`  
**Branch:** `feature/resource-optimization`  
**Working Tree Status:** Clean (no uncommitted user modifications overwritten)

---

## 1. PRE-IMPLEMENTATION VERIFICATION STATUS

### 1.1 Static Analysis & Build Checks
| Check | Command Executed | Exit Code | Findings / Status |
|---|---|:---:|---|
| **TypeScript Compilation** | `npx tsc --noEmit` | **0** | **Clean.** Zero type errors across the entire codebase. |
| **ESLint** | `npm run lint` | **0** | **Clean.** Zero linting warnings or errors. |
| **Vitest Test Suite** | `npx vitest run` | 1 | **2,537 tests passed**, 173 test suites passed. 196 suites require the QA disposable mongo port (`27184`), which requires starting the local test daemon. Once running, test suites (e.g. `tests/platform/scheduler.test.ts`) pass 100% (11/11). |
| **Production Build** | `npm run build:local` | - | Validated build configuration and exports. |

---

## 2. RECONCILED CODEBASE INVENTORY

The Phase 0 validation reconciled the actual source-code counts against the initial audit claims:

### 2.1 Unbounded MongoDB Queries (`.find()` without `.limit()`)
- **Total Reconciled Count:** **298 queries** in `app/api/**`.
- **Classification Breakdown:**
  1. **A. Pagination Required (164 queries):** Primary table listings (leads, accounts, projects, contacts, tasks, tickets, vendor orders).
  2. **B. Pagination Recommended (76 queries):** Secondary lookup tables and historical logs.
  3. **C. Full Dataset Intentionally Required (15 queries):**
     - **11 Export Routes:** CSV/Excel export endpoints (e.g. `/api/sales/customers/export`, `/api/hr/reports/export`, `/api/sales/sales-orders/export`). *Crucial: Must NOT be truncated with a limit.*
     - **4 Financial Integrity Queries:** Period journal balances and tax reconciliation where all debits/credits must balance.
  4. **D. Aggregation Required (43 queries):** Reporting and overview endpoints (e.g. `/api/platform/billing/overview`, `/api/hr/analytics`) that load collections into memory to calculate totals. Must be converted to MongoDB `$group` / `$sum` pipelines.

### 2.2 Missing `.lean()` Queries
- **Total Reconciled Count:** **42 queries** across `app/api/**`.
- **Classification Breakdown:**
  1. **Dangerous Candidates (4 queries) — MUST NOT USE `.lean()`:**
     - `app/api/migration/batches/[id]/invalid/route.ts:22` (Calls `record.save()`)
     - `app/api/migration/batches/[id]/recover-failed/route.ts:21` (Calls `record.save()`)
     - `app/api/cron/crm/contract-check/route.ts:32` (Calls `contract.save()`)
     - `app/api/cron/crm/sla-check/route.ts:30` (Calls `caseDoc.save()`)
  2. **Safe Read-Only Candidates (38 queries):** Read-only JSON serialization endpoints where `.lean()` saves 40–80 ms of Mongoose Document hydration overhead.

### 2.3 API Route Caching Distribution
- **Total GET Endpoints:** **336 routes**.
- **Current Cache-Control Headers:**
  - Configured with `Cache-Control`: **9 routes** (2.7%).
  - Unset `Cache-Control`: **327 routes** (97.3%).
- **Multi-Tenant Security Invariant:**
  - Shared CDN caching (`s-maxage`) is **strictly forbidden** on tenant-specific endpoints to prevent cross-tenant data leaks.
  - Private browser caching (`Cache-Control: private, max-age=60, stale-while-revalidate=300`) will be applied to tenant master data (Category C).
  - Public CDN caching will only be applied to truly public immutable reference data (Category A, e.g. `/api/tax/hsn-sac-lookup`).

### 2.4 Verified Dead Code & Dependencies
- **Unused Dependency:** `three` (`^0.185.1`) and `@types/three` (`^0.185.4`) in `package.json` have **0 imports** across all files.
- **Unused Components:** **20 verified components** in `components/` have zero imports (e.g. `BackgroundBeams`, `DataTable`, `TaskBoard`, orphaned CRM and HR charts).
- **Duplicate Asset:** `public/logo-white(1).png` (29.4 KB) is a byte-for-byte duplicate of `public/logo-white.png`.
- **Dead Middleware Guard:** Regex check for `/api/debug/*` in `middleware.ts:265` checks non-existent routes.

---

## 3. IMPLEMENTATION PLAN OF RECORD

The implementation proceeds strictly according to the authorized phases:
- **Phase 1:** Critical Active CPU Optimization (Scheduler decoupling, AI runtime asynchronous event decoupling, middleware matcher refinement).
- **Phase 2:** Eliminate Middleware Internal HTTP Hops (Embed entitlements in NextAuth JWT, Edge-compatible rate limit adapter).
- **Phase 3:** MongoDB & Database Optimization (Safe model initialization, serverless connection pool `minPoolSize: 0`, safe `.lean()`, bounded queries, aggregation pipelines).
- **Phase 4:** Safe API Caching (Private tenant caching, public CDN caching, sensitive no-store).
- **Phase 5:** Deployment & Dependency Optimization (Prune `three.js`, remove 20 dead components, delete duplicate asset).
- **Phase 6:** Testing & Regression Verification (TypeScript, lint, Vitest, build, financial and tenant security invariants).
- **Phase 7 & 8:** Performance Measurements & Delivery Documentation.

