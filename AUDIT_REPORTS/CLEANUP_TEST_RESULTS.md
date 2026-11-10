# Cleanup — Test Results

Branch `feature/resource-optimization-remediation`. Environment: disposable single-node replica set on `127.0.0.1:27184` (fresh data dir for the final run), Node 24.13, vitest 4.1.8. Reference points: previous HEAD `30de35b1`; cleanup commits `90ad0c2d` (files + imports), `089acb54` (dependencies), then two fix commits found *by this verification* (below).

## Final verification (code commit `002cc421`)
| Check | Command | Exit | Result |
|---|---|---|---|
| Typecheck (source) | `npx tsc -p tsconfig.cleanup-check.json` (temporary config = repo `tsconfig.json` + excludes for generated `.next*`/`tmp` artifacts; deleted afterwards) | **0** | no errors |
| Typecheck (default config) | `npx tsc --noEmit` | **2** | **4 errors, all in generated `.next/types/validator.ts` and `.next-build/types/validator.ts`** (stale artifacts of old builds, ignored by Git). Reproduced identically at `30de35b1` in a clean worktree, so not caused by this work; previously hidden because the generated `next-env.d.ts` pointed at a complete routes file. A `next build`/`next dev` regenerates it. **Not fixed** (would mean editing/deleting user artifacts or `tsconfig.json`) |
| Lint | `npm run lint` | **0** | no errors |
| Dependency consistency | `npm ls` / `npm ci --dry-run` / `npm prune --dry-run` | 0 / 0 / 0 | consistent |
| Full suite | `npx vitest run --maxWorkers=8` | **0** | **383 files: 382 passed, 0 failed, 1 skipped**; **4,436 tests: 4,424 passed, 0 failed, 12 skipped**; 1,309+ suites, no errors |
| Production build | `NEXT_DIST_DIR=.next-audit npx next build` (fresh dist dir; no database available) | **0** | "Compiled successfully in 2.1 min", **591/591 static pages**, Middleware 101 kB, First Load JS shared 102 kB, no warnings; dist dir 2.1 GB (removed afterwards). Built twice (before and after the two runtime-found fixes); both exit 0 |

Skips (all pre-existing, unchanged files): 12 tests in `tests/migration/pipeline.test.ts` (6) and `e2eWorker.test.ts` (4) (sample files absent on this machine, **unverified**) and `tests/admin/dashboardOverview.integration.test.ts` (2; opt-in env flag, passed earlier when enabled).

## Targeted tests (all also inside the full suite)
Authentication / entitlements / middleware: `tests/resourceOptimization/{entitlementFreshness.unit,entitlementLifecycle,middlewareEntitlements(12),middlewareMatcher,jwtClaimsCloneable(3)}`, `tests/middleware`, `tests/saas`, `tests/internal`, `tests/security` · tenant isolation/cache: `noStoreCache`, `tests/tenant` · accounting/GST/invoices: `tests/accounting` (47 files), `tests/qa/inventorySalesGst`, `tests/sales/*` · AI runtime/outbox: `aiOutbox`, `outboxTransactionBoot`, `tests/ai/**` · scheduler: `schedulerReliability`, `tests/platform/scheduler` · rate limiter: `upstashRateLimit` · migration: `tests/migration` · projects, billing (`billingOverviewParity`, `tests/billing`), HR, CRM (`tests/crm/crmWorkflowRegression`), pagination (`keysetPagination`).

## History of this verification (nothing hidden)
| Run | Exit | Outcome |
|---|---|---|
| After file + import cleanup, `tsc` default | 2 | 4 generated-artifact errors → proven pre-existing (clean worktree at `30de35b1`); switched source typecheck to the temporary config |
| Full suite #1 after cleanup | **1** | `tests/sales/pipelineDeals` and `tests/crm/crmWorkflowRegression` failed: *"Unable to acquire ticket … lock conflict … accounttypes"* on a fresh DB. Reproduced deterministically; **bisected** (worktrees on a fresh DB): passes at `f38af917`, `3319dd87`, `0be5279a`; fails from `855646a0` onward → **a regression of my own earlier G6 outbox commit, not of the cleanup**. Cause: `safeEmitEvent` called `connectDB()` inside the accounting transaction, so the whole model registry compiled and its `createCollection/createIndexes` ran *inside* the transaction (mongoose `transactionAsyncLocalStorage`) and conflicted with its own writes. This also explains the earlier "unexplained" `invoiceLineTotal` IX-lock flake. Fixed (models registered before the transaction starts) with a regression test that fails without the fix |
| Full suite #2 (fresh mongod) | 0 | 381/382 files, 4,418 passed |
| Runtime verification (below) | — | found **two more defects** in earlier work, fixed + tested: login `DataCloneError`, scheduler health endpoint blocked by middleware |
| Full suite #3 (final, fresh mongod) | **0** | 382/383, 4,424 passed |

## Runtime verification (production build served with `next start`, disposable MongoDB, two seeded organizations; synthetic data only)
| Check | Result |
|---|---|
| `GET /auth` | 200 |
| Unauthenticated API (`/api/finance/invoices`) | 401 |
| Unauthenticated `/api/sales/invoice-templates/x.json` (matcher fix) | 401 (still passes through middleware) |
| Unauthenticated page `/finance/dashboard` | 307 → sign-in |
| Static `/logo-white.png` | 200 |
| Credential login, Org A (professional) and Org B (starter) | **FAILED on the first build** (`DataCloneError`, 302 → `/auth?error=Configuration`); **works after the fix** — session established for both |
| Decoded JWT | contains `orgModuleData` (plain values), `entitlementVersion`, `entitlementCheckedAt` |
| `/api/auth/session` | exposes only `id,name,email,role,tenantId` (claims are not leaked to the browser) |
| Cache headers (Org A) on departments, banking-rules, account-types, accountants | `private, no-store` on all four |
| Tier gating | Org B (starter): finance endpoints **403**; Org A (professional): 200 |
| Tenant isolation | Org B's departments list: only `org-b` rows (7); Org A's only `org-a` |
| `POST /api/platform/scheduler/run-due` no secret / with secret | 401 / 200 |
| `GET /api/platform/scheduler/health` | **401 with a valid secret on the first build** (middleware blocked it) → fixed; **200 `healthy:true`** on the second build |
| `POST /api/cron/ai/runtime-sweep` no secret | 401 |
| `GET /api/internal/org-tier` without / with internal secret | 403 / 200 (`entitlementVersion`, `isActive`, …) |
| `OPTIONS /api/public/waitlist` | 204 |
| Org suspended directly in the DB (bypassing Mongoose) | API → **402 `SUBSCRIPTION_INACTIVE` after 31 s**; reactivated → **200 after 30 s** |
| User deactivated directly in the DB | **401 `USER_REVOKED` after 31 s** |

Not run at runtime: dashboards/accounting/billing/project **pages in a browser**, organization switching UI, critical CRUD flows via UI, AI runtime health beyond the cron auth check, a real migration upload. These remain covered only by the automated suite → **NOT VERIFIED at runtime**.
