# Resource Optimization — Release Gate (Final)

Branch `feature/resource-optimization-remediation`, code freeze commit **`26294c0f`**, base `f38af917`, previous optimization `3319dd87`/`e20680af`. Nothing pushed or deployed.
Statuses: PASS · FAIL · INCOMPLETE · NOT MEASURED.

## Verdict: **NOT RELEASABLE as a complete optimization. READY for independent review.**
All security/availability blockers (G4, G5, G8, G9, G7a) are fixed and tested. Three acceptance criteria are **not** met and are marked INCOMPLETE rather than concealed: **G2** (query optimization), **G6** (outbox guarantees for non-transactional producers / per-workflow idempotency / measured cadence), **G7** (trigger strategy unverifiable from the repo; no second trigger).

| # | Item | Previous finding | Final | Evidence / remaining risk |
|---|---|---|---|---|
| G1 | Git integrity | lockfile drift | **PASS** | 12 commits on top of `e20680af`, originals untouched; lockfile fixed (see G12) |
| G2 | Query optimization phase | 0 queries paginated/aggregated | **INCOMPLETE** | AST inventory done and reproducible (`scripts/audit/query-inventory.mjs`; 244 unbounded `find` + 71 `aggregate` in `app/api`). Implemented: opt-in keyset helper + `/api/projects`; billing overview → aggregation with exact parity; `connectBaseDB` adopter. **Not done:** default pagination for ~126 user-list candidates (needs consumer migration), ~37 aggregation candidates, ~20 batch/cursor, indexes, per-query manual columns |
| G3 | Production build | ENOSPC | **PASS** | `next build` exit 0, 591/591 pages, fresh dist dir; middleware 101 kB |
| G3a | tsc | pass | **PASS** | exit 0 |
| G3b | ESLint | pass | **PASS** | exit 0 |
| G3c | Full suite | exit 1 (5 hook timeouts) | **PASS** | final run exit 0: 4,417 passed / 0 failed / 12 skipped (explained). Two earlier remediation runs failed (disclosed in Test Results); one load flake (IX lock timeout) unexplained but not reproducible |
| G3d | Tests for new behaviour | 0 tests | **PASS** | 156 new tests / 11 files. Caveat: Redis Lua not run on real Redis |
| G4 | JWT entitlement freshness & revocation | frozen 8 h | **PASS** | version + ≤60 s bound, fail-closed, user revocation; 47 tests. Risks: not run in deployed Edge; handler-level entitlement re-check absent (middleware-centred); latency/hop effect NOT MEASURED |
| G5 | Tenant cache isolation | cross-account cache | **PASS** (4 endpoints) | `private, no-store` on success + error paths, 10 tests. Wider audit of the other ~330 GET routes' cache headers **not done** |
| G6 | AI outbox reliability | no claim/lease/backoff | **INCOMPLETE** | Implemented+tested: in-tx write, atomic claim, lease recovery, fenced finish, backoff, DLQ, metrics, alerts, single sweep path. Open: non-transactional producers can still lose an event (logged/counted only); 31-workflow idempotency not audited; crash-mid-run leaves a `running` AiWorkflowRun; cadence/batch not measured |
| G7 | Scheduler reliability | sole trigger, no retry | **INCOMPLETE** | Added heartbeat + health endpoint + bounded retry + double-checked locking (fixed a real duplicate-run race). Unverifiable: GitHub secrets, function duration limit; no second trigger configured; per-handler tenant isolation not audited |
| G7a | Stale-alert regression | pre-run statuses | **PASS** | re-read after runs; 4 dedicated tests |
| G8 | Upstash permanent lockout | immortal counter | **PASS** | atomic Lua; defect reproduced then fixed in tests |
| G8a | Upstash production activation | no env evidence | **INCOMPLETE** | no deployment evidence; script never run on real Redis |
| G9 | Middleware matcher | API bypass for `.json` etc. | **PASS** | 32 tests on the real matcher |
| G10 | `.lean()` / connections | `connectBaseDB` unused | **PASS** | `.lean()` sites unchanged & safe; `connectBaseDB` now has a real, proven-safe caller (public waitlist POST); one shared connection, no Missing/Overwrite errors (tests) |
| G11 | Tenant/RBAC/accounting invariants | — | **PASS** | no ledger/RBAC code changed; accounting (47 files) + security suites green. Note: `withAccountingTransaction` now awaits a memoised `AiEvent.init()` and journal/invoice events are written inside the transaction — behaviour change, covered by the existing accounting/QA suites |
| G12 | Dependency/lockfile | `three` in lock | **PASS** | lock regenerated offline: 65 deletions only, no version changes; `npm ci --dry-run` ok; no references to the 20 deleted components/`three`/duplicate logo |
| G13 | Active CPU | estimates | **NOT MEASURED** | |
| G13a | Function & middleware invocations | estimates | **NOT MEASURED** | the 60 s freshness bound re-introduces org-tier calls after the first minute |
| G13b | DB ops, connections, latency, cold starts, bundle/storage | estimates | **NOT MEASURED** | build gives bundle numbers for staging comparison only |
| G14 | AI queue latency | up to 60 min | **NOT MEASURED** | instrumentation exists (`computeOutboxMetrics`, sweep result); latency now ≤ one scheduler tick (≤ 15 min) by design, unmeasured |

## Needs a human / environment decision
1. Confirm GitHub secrets (`CRON_SECRET`, `DEPLOYMENT_URL`) and put an uptime monitor on `/api/platform/scheduler/health`.
2. Decide the real Vercel function limit and set `SCHEDULER_TIME_BUDGET_MS`.
3. Stage-test the Upstash script against real Upstash before setting `UPSTASH_REDIS_REST_*`.
4. Approve a consumer-by-consumer pagination migration plan (G2) — each is an API-contract change.
5. Telemetry window for all NOT MEASURED rows.
