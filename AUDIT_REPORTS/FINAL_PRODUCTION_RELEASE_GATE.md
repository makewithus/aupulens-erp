# Final Production Release Gate

Branch `main`, base merge `18d27b98` preserved (new commits on top, nothing rewritten). Nothing pushed, merged or deployed.

# **DEPLOYMENT: NOT APPROVED**

The critical security advisories are fixed and everything that could be verified passes, but five items are still open or unverified (below). The brief required every known blocker resolved; that was not achieved.

| # | Item | Status | Evidence / gap |
|---|---|---|---|
| 1 | Critical dependency advisories (3) | **PASS** | `next` → 15.5.29, `next-auth` → beta.32, `@auth/core` → 0.41.3; audit 18 → 8, **0 critical** |
| 1a | Remaining dependency advisories | **FAIL** | **`xlsx` high (prototype pollution, ReDoS), no npm fix, reachable via file-upload parsing**; 3 high/4 moderate build-tooling/unreachable (documented) |
| 2 | TypeScript, default config | **PASS** | `npx tsc --noEmit` exit 0 (stale `tmp/` types excluded; no data deleted) |
| 3 | Lint | **PASS** | exit 0 |
| 4 | Dependency consistency | **PASS** | `npm ci --dry-run`, `npm ls` clean |
| 5 | Full test suite | **PASS** | exit 0: 384 files (383 passed, 1 skipped), 4,432 tests passed, 0 failed, 12 skipped (10 need absent sample files = unverified) |
| 6 | Production build (upgraded Next) | **PASS** | exit 0, 591/591 pages. Needed several retries because the disk filled (see risks) |
| 7 | G6 event persistence & recovery | **PASS** (stated limits) | reconciler + deterministic keys + interrupted-run handling; 30 outbox tests; runtime recovery demonstrated |
| 7a | G6 per-workflow idempotency (31 workflows) | **NOT VERIFIED** | `act()` side effects not audited per workflow |
| 7b | G6 uncovered producers | **INCOMPLETE** | update-type `master_data.changed` and `bill.created` remain at-most-once with log/counter |
| 8 | G7 trigger, secrets, auth, history | **PASS** | secret names present; 99/100 scheduled runs succeeded; CRON_SECRET enforced; health 200 |
| 8a | G7 Vercel function limit / job completion in production | **NOT VERIFIED** | no `maxDuration`, plan unknown, production health not queried (needs secret) |
| 8b | G7 independent observer | **INCOMPLETE** | recommended uptime monitor not configured (outside the repo); stale threshold (45 min) has only 6 min margin over the observed 39 min max gap |
| 9 | G2 query optimization | **INCOMPLETE** | 244 `find` / 71 `aggregate` unchanged; needs per-consumer contract migration (see G2 report). Performance/cost blocker, not correctness |
| 10 | Runtime: login/logout, RBAC, isolation, suspension, scheduler, AI events | **PASS** | production build, API-level |
| 10a | Runtime: UI, org-switch UI, CRM/accounting/GST/payroll/inventory/billing/migration | **NOT VERIFIED** | no browser; suite coverage only |
| 11 | Tenant isolation, fail-closed auth | **PASS** | suite + runtime; reconciler is tenant-scoped |
| 12 | Accounting / GST / payroll integrity | **PASS** (suite) | no financial calculation code was touched in this pass |

## Changes in this pass (commits on `main`)
`c90524b7` dependency patches + reconciler + interrupted-run handling + tests; a `tsconfig.json` exclude of `tmp`; reports. Files: `package.json`, `package-lock.json`, `lib/email/sendEmail.ts` (1 type line), `lib/aiRuntime/runtime/{reconcile,reconcileKeys,sweepJob,executor}.ts`, 8 producer routes (dedupeKey argument only), 2 test files.

## Remaining risks the owner must decide on
1. Replace or isolate `xlsx` (the only reachable high advisory).
2. Confirm Vercel function duration for `run-due` (≥ 240 s) and add an external health monitor.
3. Decide the G2 migration plan per endpoint (contract changes).
4. Audit the 31 workflows' write steps for partial-failure safety; decide how to handle update-type events.
5. Browser-level regression pass on the upgraded Next 15.5.29 and Auth.js beta.32 before release.
6. nodemailer 10 was not exercised against a real SMTP server.
7. Disk: the main volume is at ~97% and builds need ~2.5 GB free; I only removed artifacts I created, and briefly tried writing the build to another volume (failed for an unrelated reason; cleaned up, nothing remained).
8. First deploy of the reconciler re-emits one event for documents created in the preceding 3 h (documented, harmless).

## Recommendation
Do not deploy yet. The security-critical dependency fixes and the event-recovery work are sound and tested, and are worth merging to the integration branch, but production release should wait for items 1, 2 and 5 at minimum.
