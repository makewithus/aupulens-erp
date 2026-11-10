# Resource Optimization Remediation — Test Results

Environment: disposable single-node MongoDB replica set `rs0` on `127.0.0.1:27184` (fresh temp data dir; shared listener 27017 untouched), Node 24.13, vitest 4.1.8, `QA_DISPOSABLE_MONGO_PORT=27184` (vitest.config default). Final code freeze = commit `26294c0f`; later commits are documentation only.

## Final verification (commit `26294c0f`)
| Command | Exit | Result |
|---|---|---|
| `npx vitest run --maxWorkers=8` (full suite) | **0** | 381 files: **380 passed, 0 failed, 1 skipped**; 4,429 tests: **4,417 passed, 0 failed, 12 skipped** (1,309/1,309 suites) ; 482 s |
| `npx tsc --noEmit` | 0 | no errors |
| `npm run lint` (eslint) | 0 | no errors |
| `NEXT_DIST_DIR=.next-audit MONGODB_URI=<disposable> npx next build` (fresh dist dir, no cache reuse) | **0** | "Compiled successfully in 99s", types/lint check passed, **591/591 static pages**, Middleware 101 kB; dist dir 2.1 GB (peak disk use ≈ 2.1 GB) — build dir removed afterwards, `tsconfig.json` edit made by Next reverted |
| `AUPULENS_OVERVIEW_MONGO_TEST=1 npx vitest run tests/admin/dashboardOverview.integration.test.ts` | 0 | 2/2 pass (opt-in tests that the full run skips) |

### Every skip explained (all pre-existing; no test files outside `tests/resourceOptimization` were skipped/disabled by this work)
| File | Skipped | Reason |
|---|---|---|
| `tests/admin/dashboardOverview.integration.test.ts` | 2 | `describe.runIf(AUPULENS_OVERVIEW_MONGO_TEST==="1")` opt-in; **ran separately: 2/2 pass** |
| `tests/migration/pipeline.test.ts` | 6 | `it.skip` when a sample data file is absent on this machine (`fs.existsSync` guard) |
| `tests/migration/e2eWorker.test.ts` | 4 | same fixture guard — **unverified here** |

## History of full runs on this branch (nothing hidden)
| Run | Exit | Failures | Disposition |
|---|---|---|---|
| Audit run on `e20680af` (default workers) | 1 | 5 files: `beforeAll` hook timeouts (60 s) | passed in isolation 63/63; load flakiness; **never compared with base** |
| Remediation run 1 (`--maxWorkers=8`) | 1 | 6 tests / 3 files | (a) `usageNavigation` ×4: test fixture assumed fail-open entitlements — real behaviour change (G4), fixture updated, **assertions untouched**; (b) `inventorySalesGst`: *"Unable to write to collection aievents due to catalog changes"* — a **real defect in my first outbox version** (first in-transaction write to a not-yet-existing collection) → fixed with `ensureOutboxReady()`; (c) my own burst test asserted exactly 3 sweeps (brittle under load) → relaxed to the real invariant (no loss, bounded) |
| Remediation run 2 | 1 | 1 test: `sales/invoiceLineTotal.route.test.ts` — "Unable to acquire IX lock on …accounttypes within 5ms" | transaction lock timeout under parallel load; passes 7/7 in isolation ×3 and in run 3. **Cause not proven**; mechanism is the same class as (b) but on a collection this branch does not touch. Treat as a known flaky under load |
| Remediation run 3 (final) | **0** | none | — |

A green final run is evidence for what the tests cover, not proof the ERP has no defects. The earlier flake was not reproduced, but it was also not fixed.

## Tests added — 156 tests, 11 files in `tests/resourceOptimization/`
| File | Tests | Covers |
|---|---|---|
| `noStoreCache.test.ts` | 10 | G5 headers (success + 401) on 4 endpoints, two orgs, no cross-org leakage, immediate visibility of new rows |
| `middlewareMatcher.test.ts` | 32 | G9 real matcher array vs static/public/API/dynamic-key/page paths |
| `upstashRateLimit.test.ts` | 12 | G8 atomicity, expiry, concurrency, repair, malformed config, fail-open/closed, headers |
| `entitlementFreshness.unit.test.ts` | 19 | G4 freshness bound, legacy/future claims, unavailable ⇒ deny, no-SWR cache, refresh doesn't extend, version predicate |
| `entitlementLifecycle.test.ts` | 19 | G4 end-to-end with the real org-tier route + DB (all 15 required scenarios; see Security Final) |
| `middlewareEntitlements.test.ts` | 9 | G4 real `middleware` function: fresh claims, stale ⇒ server wins, 503 fail-closed, revoked user, deactivated org, allow-list |
| `aiOutbox.test.ts` | 22 | G6 (18 required scenarios; see Outbox Final) |
| `schedulerReliability.test.ts` | 17 | G7/G7a |
| `billingOverviewParity.test.ts` | 3 | G2 aggregation parity incl. rounding edge cases |
| `keysetPagination.test.ts` | 10 | G2 pagination |
| `connectBaseDB.test.ts` | 3 | G10 |
Existing test edited: `tests/ai/usageNavigation.test.ts` (fixture only, see above).

## Not run / unverified
- No browser/UI tests (no frontend consumer was changed).
- No load test, no staging/Vercel run, no real Redis/Upstash, no Edge runtime.
- The 5 audit-run hook-timeout files were not compared against the base commit in a worktree.
