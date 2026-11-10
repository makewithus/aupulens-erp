# Resource Optimization — Independent Audit

Date: 2026-11-10 · Branch `feature/resource-optimization` · Base `f38af917` · Commits `3319dd87`, `e20680af`
Auditor method: read the actual diff, re-ran tests/tsc/lint, probed new code with a mock Redis server. Nothing was pushed, deployed, or changed in production. No source files were modified.

## 0. Headline

The earlier "Results" report says "All approved optimizations across Phases 1 through 5 have been implemented and verified" and "ready for testing team validation". **The evidence does not support that.**

- The query-optimization phase (pagination / aggregation) was **not implemented at all**. The unbounded `find()` count is identical at base and HEAD (266 by my scan, 266 → 266). Only `.lean()` was added to 5 unbounded queries and 3 already-limited ones.
- Three of the changes introduce **verified defects or security regressions** (JWT entitlement staleness, Upstash counter that can never expire, stale-status alert logic).
- **Zero test files were added or changed.** None of the new code (Upstash store, JWT embedding, outbox write path, cache headers, `connectBaseDB`) has a test.
- The production build could **not** be verified: the disk filled (ENOSPC) during `next build`.

## 1. Git verification

| Check | Result |
|---|---|
| Working repo | `/home/krrish/Desktop/Aupulens-ERP/Aupulens-ERP-main` (the parent `Aupulens-ERP/.git` is an empty directory, not a repo) |
| `git status` | `On branch feature/resource-optimization`, clean at audit start |
| Log | `e20680af` (HEAD, docs) → `3319dd87` (perf) → `f38af917` (= `main` = `origin/main`) |
| Diff stat | 46 files, +1613 / −2924 |
| `3319dd87` | 41 files, +203 / −2924 |
| `e20680af` | 5 docs files, +1410 |
| Test files in diff | **0** |
| `package-lock.json` in diff | **No** — lock root (line 66) still declares `"three": "^0.185.1"` while `package.json` dropped it (lockfile drift; `npm ci --dry-run` did not error, real `npm ci` not verified) |

Real source changes are ~20 files: 8 API routes, `auth.ts`, `auth.config.ts`, `middleware.ts`, `lib/db.ts`, `lib/middleware/rateLimit.ts`, `lib/aiRuntime/runtime/safeEmit.ts`, 3 scheduler files, `adminSession.ts`, `package.json`, `Logo.tsx`. The other 2,900 deleted lines are 20 removed components + 1 PNG.

### Claim-vs-code

| Claim | Verdict |
|---|---|
| Scheduler decoupled from admin requests | Code verified. But it removed the only fallback trigger (see §6). |
| `raiseStaleAlerts` reuses statuses — "50% fewer DB ops" | Reuse verified (one `SchedulerJobRun.find` fewer per run). Percentages unmeasured. **Introduces a regression**, see D3. |
| AI runtime decoupled from CRUD via outbox | Write path verified; reliability gaps in §5 below. |
| Matcher excludes static assets | Verified; over-broad extension list, see S4. |
| `orgModuleData` in JWT eliminates the hop | Verified; **loses entitlement freshness**, see D1. |
| Upstash Edge limiter added | Code exists; TTL defect D2; no deployment evidence. |
| `minPoolSize: 0`, `connectBaseDB()` | Pool change verified. `connectBaseDB` has **zero callers** — "faster cold starts" is not realised anywhere. |
| `.lean()` applied to read-only queries | Verified on 8 query sites; safe (no virtuals/getters on the 3 schemas; no `.save()` downstream). |
| Private caching on tenant master data | 4 routes. Safe for HR/finance? No — see §4/D4. |
| Mutation endpoints "strictly preserved" | True but trivially: they were never touched. Note baseline error: `migration/batches/[id]/invalid` GET already used `.lean().limit(500)`; its `save()` is on a separate `findOne`. |
| 795/795 tests | Subset only. Full suite below. |
| 20 dead components removed | Not independently re-proven, but `tsc` and the full suite pass with them gone. |

## 2. Test-suite verification (full, QA replica set on port 27184, fresh temp datadir, `rs0` PRIMARY)

| Metric | Value |
|---|---|
| Test files discovered | 370 |
| Passed / failed / skipped files | 364 / **5** / 1 |
| Tests | 4,273 total: 4,198 passed, **0 failed**, 75 skipped |
| Exit code (full run) | **1** (5 files failed on `beforeAll` hook timeouts at 60 s, no assertion failures) |
| Failing files | `adminDashboardPerformance.route`, `golden/ai27.golden`, `remediation/parts_4_5_6_remediation`, `platform/globalSearch`, `ai/aiRuntime/ai12TaxIntelligence` |
| Re-run of those 5 in isolation | 5/5 files, 63/63 tests pass, exit 0 |

Interpretation: the 5 failures are load-induced timeouts (vitest runs hundreds of Mongo-backed files in parallel; `vitest.config.ts` already documents this class of noise). They are not shown to be regressions, but the full run **does not exit 0**, and I did not verify these 5 against the base commit. Nothing was skipped or weakened.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| Clean production build | **INCOMPLETE** — `next build` (fresh `distDir`) died with `ENOSPC` (disk 98 % full; `.next` 3.3 GB and `.next-build` 1.9 GB are the user's and were not touched). The partial `.next-audit` I created was deleted. This says nothing about code correctness. |

## 3. Defects found

| ID | Severity | Defect |
|---|---|---|
| D1 | **High (security)** | Entitlements/subscription frozen into the JWT at login for up to 8 h. See Security report §1. |
| D2 | **High** | `UpstashRedisRateLimitStore` sets TTL in a separate best-effort call whose failure is swallowed. If `PEXPIRE` fails, the counter never expires → permanent lockout of that IP/account (incl. login). Reproduced: after a failed PEXPIRE and the window elapsing, count kept climbing (3, TTL `null`). |
| D3 | Medium | `runDueJobs` passes **pre-run** statuses to `raiseStaleAlerts`. A job that was stale and just ran this tick still reads `isStale` → alert re-raised/not auto-resolved until the next tick. No test covers it. |
| D4 | Medium | `Cache-Control: private, max-age=60, stale-while-revalidate=300` on banking-rules, accountants, account-types and HR departments. Browser caches key on URL, not session: after logout / account switch in the same browser, Org B can be served Org A's body for up to 60 s, and stale for up to 6 min. Banking and HR data should be `private, no-store`. |
| D5 | Medium | Outbox: no atomic claim/lease, no stale-`processing` recovery, no backoff — see §5. |
| D6 | Low | Matcher excludes `.json/.txt/.xml/.js/.css/...` for **all** paths incl. `/api/**`; latent middleware bypass for dynamic API segments (`/api/sales/invoice-templates/[key]`, `/api/platform/plans/[key]`). Handlers still authenticate; module/tier/subscription gating would be skipped. |
| D7 | Low | `package-lock.json` not regenerated after removing `three`. |
| D8 | Low | `connectBaseDB()` is dead code. |
| D9 | Info | `GET /api/finance/accounting/accountants` is not tenant-scoped (global directory, pre-existing); the new `private` cache header is harmless but it is not "tenant data". |

## 4. Tenant-scoped caching / JWT — see Security report.

## 5. AI outbox — see Security report §3 (reliability).

## 6. Scheduler — summary

- Single external trigger: `.github/workflows/scheduled-jobs.yml`, every 15 min → `POST /api/platform/scheduler/run-due` (Bearer `CRON_SECRET`, `after()` background). `vercel.json` is `{}`; `vercel.cron.example.json` is inert.
- All 13 jobs are still in `JOB_REGISTRY` (verified), so none was silently dropped. **But** the opportunistic trigger was the only second path. Now if the GitHub workflow stops (secret missing, repo inactivity disables scheduled workflows, 60-day rule), nothing runs, and stale-job alerts (raised only inside `runDueJobs`) cannot fire. Not measured: whether `CRON_SECRET`/`DEPLOYMENT_URL` are configured.
- Locking: unique-index doc + 15-min TTL — correct duplicate prevention. Retry: a failed job still advances `lastRunAt`, so it next runs after a full interval (daily jobs retry in ~24 h). `run-due` route has no `maxDuration`; a 240 s global budget may exceed the plan's function limit (pre-existing, unmeasured).
- Cross-tenant: jobs iterate tenants sequentially in one process; per-tenant error isolation inside each handler was not audited.

## 7. Performance evidence

Nothing was measured on Vercel or MongoDB. Every percentage in `RESOURCE_OPTIMIZATION_RESULTS.md` ("80–90 %", "30–40 %", "40–80 ms", "50 %") is an **estimate**. Only these are code-verifiable structural facts: fewer middleware matches for static files; no `/api/internal/org-tier` hop when `orgModuleData` is in the JWT; no AI-runtime import on `safeEmitEvent`; one fewer status query per scheduler run; `minPoolSize` 0.

Before/after measurement plan:

| Metric | Source | Method |
|---|---|---|
| Active CPU | Vercel Usage → Fluid Active CPU | Same 7-day window pre/post deploy, normalise per 1k requests |
| Function invocations | Vercel Usage | Split by route; expect `/api/internal/org-tier` and `/api/platform/*` to fall |
| Middleware invocations | Vercel Usage → Edge Middleware | Compare per 1k page views |
| DB ops / connections | Atlas metrics (opcounters, connections) | Same window; watch connection count with `minPoolSize: 0` |
| CRUD latency | Vercel observability p50/p95 for invoice/bill/customer POST | Pre/post |
| AI queue latency | New: `now − AiEvent.createdAt` at processing; backlog = count(pending) | **Must be added — currently latency can be up to 60 min** |
| Scheduler overhead | `SchedulerJobRun.lastRunDurationMs`, GH run time | Pre/post |
| Cold starts | Vercel function logs (init duration) | p95 |
| Bundle / Function Storage | `next build` output + Vercel deployment size | Needs a working build first |

## 8. Not done in this audit (honest scope limits)

- No live two-organisation browser test; the cache-isolation conclusions are from HTTP caching semantics and the code, not a browser run.
- No end-to-end token-lifecycle test (JWTs issued before an entitlement change); conclusion is from code reading of `auth.config.ts` + `middleware.ts`.
- No production env inspection; `UPSTASH_*` appears in no `.env`, `.env.example`, workflow, or doc (only in `rateLimit.ts`).
- Build verification blocked by disk space.
