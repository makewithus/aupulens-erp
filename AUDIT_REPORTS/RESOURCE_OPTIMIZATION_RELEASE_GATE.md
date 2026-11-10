# Resource Optimization — Release Gate

Branch `feature/resource-optimization` @ `e20680af` (base `f38af917`).
Legend: **PASS** supported by code + test evidence · **FAIL** verified defect/regression · **INCOMPLETE** unfinished implementation/verification · **NOT MEASURED** needs production telemetry.

## Overall: **NOT READY FOR RELEASE**
Blocking: G4, G5, G6, G8, G10 (FAIL) and G2, G3, G7 (INCOMPLETE).

| # | Item | Status | Evidence |
|---|---|---|---|
| G1 | Git integrity (commits exist, scope matches diff, nothing pushed/deployed by audit) | **PASS** | Both commits resolve; 46 files; docs-only second commit. Caveat: `package-lock.json` not updated (D7) |
| G2 | Query optimization phase (164 pagination / 43 aggregation) | **INCOMPLETE** | 0 queries paginated, 0 aggregated; unbounded count 266 → 266. Only 5 `.lean()` additions |
| G3 | Production build | **INCOMPLETE** | `next build` hit `ENOSPC` (disk 98 %); not a code verdict |
| G3a | `tsc --noEmit` | **PASS** | exit 0 |
| G3b | ESLint | **PASS** | exit 0 |
| G3c | Full test suite | **FAIL** (exit code 1) | 370 files: 364 pass / 5 fail (60 s `beforeAll` timeouts) / 1 skip; 4,198 pass, 0 assertion failures, 75 skipped. The 5 files pass in isolation (63/63) → likely load flakiness, but the gate run is not green and they were not compared with base |
| G3d | Tests for new behaviour | **FAIL** | 0 tests added/changed; Upstash store, JWT embedding, outbox write path, cache headers, `connectBaseDB` untested |
| G4 | JWT entitlement freshness / revocation | **FAIL** | Embedded at login, valid ≤ 8 h: suspended/downgraded/disabled-module tenants keep access; upgraded/paid tenants falsely blocked (trial status). Was ≤ ~3.5 min |
| G5 | Tenant cache isolation | **FAIL** | `private, max-age=60, swr=300` on banking-rules, accountants, account-types, HR departments: URL-keyed browser cache survives logout/account switch; no invalidation. Use `private, no-store`. (No shared-CDN header found — good.) Not browser-tested |
| G6 | AI outbox reliability | **FAIL** | No atomic claim, no lease/`processing` recovery (stranded events), no backoff, silent insert failures, non-transactional post-commit write, no backlog alert. DLQ/max-attempts/dedupe/cron auth OK. "No events lost" not proven |
| G7 | Scheduler reliability | **INCOMPLETE** | 13/13 jobs reachable via `run-due`; lock + auth OK. Sole trigger with no fallback; GH secrets unverified; failed job waits a full interval; no `maxDuration` |
| G7a | Stale-alert logic | **FAIL** | `raiseStaleAlerts(statuses)` uses pre-run statuses (D3) |
| G8 | Upstash distributed limiter | **FAIL** | Failed `PEXPIRE` ⇒ immortal counter ⇒ permanent lockout (reproduced). Atomicity/expiry/concurrency OK otherwise; fail-closed for auth, fail-open for others |
| G8a | Upstash production activation | **INCOMPLETE** | No env/deploy evidence anywhere. Do not claim active |
| G9 | Edge matcher | **INCOMPLETE** | Static-asset exclusion works, but extension list also applies to `/api/**` (latent bypass for dynamic `[key]` segments). No test |
| G10 | `.lean()` / Mongoose safety | **PASS** | 8 sites safe; 4 `.save()` routes untouched; no Missing/Overwrite errors in 4,273 tests; one shared connection. (`connectBaseDB` unused — INCOMPLETE benefit, not a defect) |
| G11 | Tenant isolation / RBAC / ledger logic unchanged | **PASS** | Diff touches none of it; security/accounting suites pass |
| G12 | Dead-code removal (`three`, 20 components, duplicate PNG) | **PASS** (with D7) | `tsc`, lint, suite pass; lockfile drift remains |
| G13 | Active CPU reduction | **NOT MEASURED** | All percentages in the Results report are estimates |
| G13a | Function / middleware invocation reduction | **NOT MEASURED** | structural reasoning only |
| G13b | DB ops, connection count, latency, cold starts, bundle/Function storage | **NOT MEASURED** | plan in Independent Audit §7 |
| G14 | AI queue processing latency | **NOT MEASURED** (likely worse: up to 60 min, 200/hr) | needs instrumentation |

## Minimum to reach a releasable state (proposed — not started)
1. Entitlement version + ≤60 s revalidation (G4); `no-store` on the four routes (G5).
2. Atomic claim/lease/backoff for `AiEvent`, log insert failures, backlog alert, sweep cadence (G6).
3. Atomic Upstash TTL (G8); pass refreshed statuses to `raiseStaleAlerts` (G7a).
4. Narrow matcher exclusion to non-API paths (G9).
5. Add tests for each of the above; regenerate `package-lock.json`; free disk and run a clean `next build`; rerun full suite (consider `--maxWorkers` to remove hook-timeout flakiness).
6. Deliver a real, reviewed pagination/aggregation plan (G2) — an API-contract change needing UI work, not a mechanical edit.
7. Capture production telemetry before/after for the NOT MEASURED rows.
