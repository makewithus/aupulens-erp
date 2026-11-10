# Resource Optimization Remediation — Results

Branch `feature/resource-optimization-remediation` · code commit `26294c0f` · base `f38af917`. Not pushed, not deployed.

## Outcome by blocker
| Blocker | Result |
|---|---|
| G4 JWT entitlement freshness | **Fixed & tested** — ≤60 s bound, versioned, fail-closed, user revocation (47 tests) |
| G5 tenant caching | **Fixed & tested** for the 4 endpoints (10 tests) |
| G8 Upstash lockout | **Fixed & tested** (emulated Redis; not run on real Redis; activation unproven) |
| G9 matcher | **Fixed & tested** (32 tests) |
| G7a stale alerts | **Fixed & tested** |
| G7 scheduler | **Improved, INCOMPLETE** — heartbeat/health/retry/lock fix done; secrets/limits unverifiable; no 2nd trigger |
| G6 AI outbox | **Largely implemented, INCOMPLETE** — non-transactional producers and per-workflow idempotency open |
| G2 query optimization | **INCOMPLETE** — inventory + 3 slices; bulk pagination/aggregation not done |
| G12 lockfile | **Fixed** |
| G3 build | **PASS** (exit 0) |
| Full suite | **PASS on final run** (exit 0; 4,417 passed, 12 explained skips); two earlier runs failed and are disclosed |

## What the numbers do and do not say
- Unbounded `find` in `app/api`: 252 → 244; unbounded `aggregate`: 71 → 71. That is a negligible change: **the query-optimization goal is not achieved**.
- The billing overview now does its work in MongoDB (5 full-collection loads + 6 counts → 3 aggregations + 2 counts). Memory is O(groups) instead of O(documents). Measured latency/CPU: **NOT MEASURED**.
- Resource side effects of the correctness fixes (may offset earlier savings, all **NOT MEASURED**): entitlement re-reads after 60 s with no stale-while-revalidate; per-user cache keys; AI events now processed within ≤ one scheduler tick instead of ≤ 60 min (more sweep invocations); extra heartbeat writes per scheduler tick; in-transaction outbox insert on accounting writes.
- No Vercel, Atlas or production telemetry was read or produced. Every performance percentage in `RESOURCE_OPTIMIZATION_RESULTS.md` (previous work) remains an estimate.

## Files changed (source)
`app/api/cron/ai/runtime-sweep/route.ts`, `app/api/finance/accounting/{account-types,accountants,banking-rules}/route.ts`, `app/api/hr/departments/route.ts`, `app/api/internal/org-tier/route.ts`, `app/api/platform/billing/overview/route.ts`, `app/api/platform/scheduler/run-due/route.ts`, **new** `app/api/platform/scheduler/health/route.ts`, `app/api/projects/route.ts`, `app/api/public/waitlist/route.ts`, `auth.ts`, `auth.config.ts`, `middleware.ts`, `lib/accounting/transaction.ts`, `lib/aiRuntime/runtime/{eventBus,safeEmit}.ts` + **new** `{outboxHealth,outboxReady,sweepJob}.ts`, **new** `lib/api/{noStore,pagination}.ts`, **new** `lib/billing/overviewMetrics.ts`, `lib/constants/statuses.ts`, `lib/middleware/{rateLimit,moduleGate}.ts` + **new** `entitlementFreshness.ts`, **new** `lib/platform/entitlements/version.ts`, `lib/platform/scheduler/{registry,runner}.ts` + **new** `heartbeat.ts`, `models/admin/Organization.ts`, `models/ai/AiEvent.ts`, `models/platform/{OrganizationEntitlement,SchedulerJobRun}.ts` + **new** `SchedulerTriggerHeartbeat.ts`, `package-lock.json`, **new** `scripts/audit/{query-inventory.mjs,render-inventory-report.py}`.
Schema additions (all optional/defaulted, no migration needed): `Organization.entitlementVersion`; `AiEvent.{workerId,leaseUntil,nextAttemptAt,processingStartedAt,deadLetteredAt,lastDurationMs}` + 2 indexes; `SchedulerJobRun.{lastSuccessAt,consecutiveFailures,nextRetryAt}`; new collection `SchedulerTriggerHeartbeat`. **Deploy note:** new `AiEvent` indexes build on first model init; existing `Organization` rows read `entitlementVersion` as 0 until their first entitlement change.

## Review notes for the independent reviewer
- Highest-value places to look: `middleware.ts` (entitlement block), `lib/aiRuntime/runtime/eventBus.ts` (claim filter / fenced finish), `lib/aiRuntime/runtime/safeEmit.ts` (in-tx vs out-of-tx semantics), `lib/platform/scheduler/runner.ts` (double-checked lock).
- `withAccountingTransaction` now behaves differently: journal/invoice/bill events are written in the transaction instead of dispatched after commit. Dispatch no longer happens inline at all.
