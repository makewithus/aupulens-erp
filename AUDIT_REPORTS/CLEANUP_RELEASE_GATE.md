# Cleanup Release Gate

Branch `feature/resource-optimization-remediation`; final code commit `002cc421`; nothing pushed, merged or deployed.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | No known required file deleted; no framework-discovered file removed | **PASS** | 36 deletions, each with graph + path + discovery evidence (`REPOSITORY_CLEANUP_MANIFEST.md`); none is `page/layout/route/…`; tsc, lint, 591-page build and full suite pass |
| 2 | No required dependency removed; `package.json` ↔ lockfile consistent | **PASS** | 6 removed with zero references; `npm ci --dry-run`, `npm prune --dry-run`, `npm ls` clean; build + suite pass |
| 3 | TypeScript (source) | **PASS** | exit 0 with generated artifacts excluded |
| 3a | TypeScript with the default `tsconfig.json` | **FAIL (pre-existing, environmental)** | 4 errors in stale generated `.next*/types/validator.ts`; identical at `30de35b1` in a clean worktree; not a source defect; left for the owner (see health report #4) |
| 4 | Lint | **PASS** | exit 0 |
| 5 | Full test suite exits 0 | **PASS** | 382/383 files, 4,424 passed, 0 failed, 12 skipped (explained); earlier runs in this session failed and are documented |
| 6 | Production build | **PASS** | exit 0, 591/591 pages, middleware compiles, no warnings |
| 7 | Critical flows at runtime | **INCOMPLETE** | API-level checks pass (login for two orgs, tier gating, isolation, cache headers, scheduler/cron auth, live revocation ≈ 31 s); browser UI flows, organization-switch UI, CRUD via UI, migration upload **NOT VERIFIED** |
| 8 | Tenant isolation preserved | **PASS** | suite + runtime two-org check |
| 9 | Authorization fail-closed | **PASS** | middleware tests (503 on unavailable, 401 on revoked) + runtime suspension/deactivation |
| 10 | Accounting / GST parity | **PASS** (suite) | accounting (47 files), QA GST, sales, invoice tests green; no calculation code touched. Not re-verified on live data |
| 11 | AI event processing reliable | **PASS for cleanup scope** | outbox tests green; one regression of the earlier outbox work was found and fixed (`outboxReady.ts`). G6 residual gaps unchanged |
| 12 | 13 scheduler jobs registered and reachable | **PASS** | registry test + runtime `run-due` 200, health 200 |
| 13 | Data migration functional | **PASS (suite) / NOT VERIFIED (runtime)** | `tests/migration` green except fixture-guarded skips (10 tests unverified) |
| 14 | No production config/user data deleted | **PASS** | only artifacts created in this session were removed (`.next-audit`, scratch, disposable Mongo data); `.env`, `.next`, `.next-build`, `tmp/`, reports untouched. `next-env.d.ts` (generated, ignored) was rewritten by my builds and has the stale reference removed |
| 15 | All deletions documented; uncertainties reported | **PASS** | manifest + "PRESERVED — REQUIRES MANUAL REVIEW" |

## Defects found and fixed during this verification (all in earlier work, none caused by the cleanup)
1. **Login crash** — `DataCloneError` from Mongoose arrays in JWT claims (since `3319dd87`); every credential login on a tenant with an organization would have failed on the optimization branch. Fixed + test.
2. **Outbox/model-registry regression** (since `855646a0`) — lock conflict on first accounting transaction in a fresh database. Fixed + test.
3. **Scheduler health endpoint unreachable** (since `209c61bf`) — admin-session gate blocked it. Fixed + test.

## Unchanged release blockers (kept separate, as instructed)
- **G2** query optimisation: INCOMPLETE (244 unbounded `find`, 71 unbounded `aggregate`).
- **G6** AI outbox: INCOMPLETE (non-transactional producers, per-workflow idempotency, measured cadence).
- **G7** scheduler: INCOMPLETE (GitHub secrets, function limit, second trigger unverifiable).
- Production telemetry (CPU, invocations, latency, cold starts): NOT MEASURED.
- 18 production-dependency advisories (3 critical): not addressed.

## Recommendation
The cleanup is safe to review and merge locally-wise: it removed only verified-unreferenced code and unused packages, and verification found and fixed three real defects. **Do not treat this as production-ready**: the three blockers above remain, UI flows were not exercised in a browser, and the default `tsc` run needs the owner to refresh stale generated artifacts.
