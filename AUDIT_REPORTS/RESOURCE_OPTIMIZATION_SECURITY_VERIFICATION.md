# Resource Optimization — Security & Reliability Verification

Scope: JWT entitlements, tenant cache isolation, AI outbox, scheduler, Upstash/Edge, `.lean()` safety. Evidence is code reading plus the probes noted. "Not tested live" is stated where applicable.

## 1. JWT entitlement security — **FAIL**

**What changed.** `auth.ts#authorize` now resolves `{tier, enabledModules, subscriptionStatus, trialEndDate, resolvedModules}` once and puts it in the token (`auth.config.ts#jwt`). `middleware.ts` uses `user.orgModuleData ?? getOrgModuleData(...)`.

**Before.** `orgTierCache` (`lib/middleware/orgTierCache.ts`): 30 s fresh + 180 s stale-while-revalidate, with a fresh read from `/api/internal/org-tier` (`x-entitlement-check: fresh`).
**After.** Freshness bound = JWT lifetime = `AUTH_SESSION_MAX_AGE_SECONDS` = **8 h**. The `jwt` callback only copies `user.orgModuleData` at sign-in; on every later call it never re-reads the org, and `updateAge` refresh re-issues the same data.

| Scenario | Result (from code) |
|---|---|
| Tier downgrade | User keeps old tier's modules up to 8 h |
| Module disabled by admin | Still reachable up to 8 h |
| Subscription `suspended` / `cancelled` | `isSubscriptionBlocked` reads the embedded status → **not blocked** up to 8 h (was ≤ ~3.5 min) |
| Trial expired | Still enforced: it compares the embedded `trialEndDate` to `Date.now()` |
| Trial → paid upgrade | **False block**: embedded status is `trial` with a past `trialEndDate` → paying customer is blocked until re-login |
| Plan upgrade / new module | Not visible until re-login |
| User revoked / deactivated | Unchanged by this commit (pre-existing: `authorize`-time check; token valid until expiry or `tenantSessionStaleReason`) |
| Legacy token without `orgModuleData` | Falls back to the HTTP path — works |
| Token size | Adds module arrays to every cookie; not measured |

Signature integrity is fine (JWE); the problem is *freshness*, not forgery. A signature check alone does not establish current authorization — which is the exact principle the task states.

**Required mechanism (recommendation, not implemented):** add an `entitlementVersion` (monotonic counter or `updatedAt`) on the Organization/Entitlement, bumped by every plan/module/status mutation; embed `entitlementVersion` + `entitlementCheckedAt` in the JWT; in middleware, if `now − checkedAt > 60 s`, revalidate via the existing cached `/api/internal/org-tier` (30 s/180 s cache) and compare versions; on mismatch deny/refresh. Keep `suspended/cancelled` as a live check. That preserves most of the saved hops (revalidation only every minute, and via the cache) while bounding revocation latency.

## 2. Tenant cache isolation — **FAIL (D4)** / not tested in a browser

Headers added: `private, max-age=60, stale-while-revalidate=300` on:
`/api/finance/accounting/banking-rules`, `/accountants`, `/account-types`, `/api/hr/departments`.

- `private` correctly keeps shared CDNs out. No `s-maxage` was added anywhere (verified by grep).
- But the browser cache key is the URL, not the cookie/session. On a shared browser, after logout and login as a different org, `GET /api/hr/departments` within 60 s is served from disk without contacting the server; within 360 s it is served stale while revalidating. The responses carry no `Vary: Cookie`, and nothing sends `Clear-Site-Data` on logout (grep: none).
- No mutation invalidation: a `POST`/`PUT` to `/[id]` does not invalidate the cached list URL, so a user can create a department and not see it for up to 60 s.
- Banking rules (finance/banking) and HR departments are sensitive categories per the task's wording.

**Recommendation:** use `private, no-store` on all four. If caching is wanted, move it into client state (SWR/React Query keyed by `tenantId + userId`, cleared on sign-out) rather than HTTP caching.
Accountants endpoint is global (not tenant-scoped, pre-existing) so it is the only one whose body is not tenant data.

## 3. AI outbox reliability — **INCOMPLETE / defects**

Lifecycle: `safeEmitEvent` → (post-commit via `deferUntilAccountingCommit`) `AiEvent.create(status: pending)` → hourly `ai-runtime-sweep` job → `sweepPendingEvents(200, 240 s)` (the scheduler registry job; note the cron route was tightened to 50 / 45 s but the scheduler calls the default) → `dispatchEvent`.

| Requirement | Finding |
|---|---|
| Durable persistence | Yes (`AiEvent`), unique partial index on `{tenantId,eventKey,dedupeKey}` |
| Business-transaction consistency | **Not transactional outbox.** The write is deferred until after commit and executed in a separate call; a crash between commit and insert loses the event. Any DB error is swallowed by `catch {}` — silent loss with no log |
| Duplicate handling | OK: `findOne` + catching `E11000` |
| Worker concurrency / atomic claim | **Absent.** `sweep` does `find(pending/failed).limit()`, `dispatchEvent` does `findById` then `status=processing; save()`. Two sweeps (cron route + scheduler job, or two runs) can dispatch the same event twice |
| Crash recovery | **Absent.** A worker killed mid-dispatch leaves `status: processing`; the sweep selects only `pending/failed`, so the event is stranded forever |
| Retry backoff | None (retried every sweep; comment claims "next hourly sweep") |
| Max retries / DLQ | Present: `MAX_ATTEMPTS = 5` → `dead_letter` |
| Stuck-pending detection | None (no alert on backlog age/size) |
| Idempotent workflows | Not verified per-workflow (31 workflows) |
| Cron auth | Bearer `CRON_SECRET`, fails closed if unset — OK |
| Time budget | Enforced between events only; one slow event can still overrun |
| Latency | Inline dispatch is gone from `safeEmitEvent`; an event now waits up to the 60-min job interval, and throughput is capped at 200 events/hour per sweep. A burst > 200/hr grows an unbounded backlog |

"Events are not lost" is **not proven**: the success path is durable, but the crash/`processing` path and the swallowed-insert path both lose events. Existing tests only cover `emitEvent`/sweep happy paths and dedupe; nothing tests `safeEmitEvent`'s new branch.

Recommended (not implemented): atomic claim via `findOneAndUpdate({status:{$in:[pending,failed]}, nextAttemptAt:{$lte:now}}, {status:processing, leaseUntil:+N min, $inc attempts})`; sweep also reclaims `processing` with expired lease; `nextAttemptAt` exponential backoff; log (not swallow) insert failures; backlog-age alert; sweep more often than hourly or drain after a burst.

## 4. Scheduler — **PASS with caveats**
All 13 registered jobs still reachable via GitHub Actions `run-due`; Bearer auth, unique-index lock with TTL, stale alerts. Caveats: sole trigger, no fallback; failed job waits a full interval; **D3 stale-alert regression**; no `maxDuration`; whether GitHub secrets exist is unknown.

## 5. Upstash / Edge — **INCOMPLETE; defect D2**

Probe against a mock Upstash REST server (real INCR/PTTL/PEXPIRE/DEL semantics), using a copy of `rateLimit.ts`:

| Test | Result |
|---|---|
| Sequential increments | 1, 2, 3 |
| Expiry (300 ms window) | Counter reset to 1 after expiry |
| 50 concurrent increments | counts 1..50, all distinct (atomic INCR) |
| PEXPIRE call fails | **Counter never expires** (`exp: null`, count kept growing) → permanent block |
| Redis down | `increment` throws; sensitive auth endpoints → 429 fail-closed; ordinary endpoints (e.g. `/api/crm/search`) → **allowed (fail-open)** |

Also: `increment()` always returns `allowed: true, remaining: 0` (the caller derives allow/deny from `count`, so behaviour is correct but the fields are misleading). Fix: use one atomic `SET key 1 PX window NX` + `INCR`, or a Lua `EVAL`, or Upstash `@upstash/ratelimit`.
"Independent instances" are satisfied by construction (state lives in Redis), not separately run. **Production activation is NOT shown**: `UPSTASH_REDIS_REST_URL/TOKEN` appear in no `.env`, `.env.example`, workflow or doc. Without them (and without `RATE_LIMIT_STORE=mongo`), production still throws in `configuredStore()`, as before.

Middleware matcher: the catch-all excludes `.json|.txt|.xml|.js|.css|.map|…` for every path. Existing explicit entries (`/admin/:path*`, `/finance/:path*`, …, `/api/crm/:path*`) keep covering those prefixes, but `/api/**` outside `/api/crm` is only matched via the catch-all. Dynamic non-ObjectId API segments (`/api/sales/invoice-templates/[key]`, `/api/sales/email-templates/[key]`, `/api/platform/plans/[key]`) therefore skip middleware for a value like `x.json` (no current handler exposes data for such a key — latent). Recommend restricting the extension exclusion to non-`/api` paths.

## 6. Mongoose / `.lean()` — **PASS**
- 8 modified sites inspected. None has a downstream `.save()` on the lean result; the three schemas (`AccountType`, `Accountant`, `Account`) define no virtuals/getters/`toJSON` transforms; `populate("accountType")` works with `lean`.
- The 4 "dangerous" files are untouched and still use hydrated documents with `.save()`.
- `safeEmit.ts` imports `AiEvent` after `connectDB()` (models registered); the model uses the `mongoose.models.X ||` guard, so no `OverwriteModelError`. The full suite shows no `MissingSchemaError`/`OverwriteModelError`.
- `connectBaseDB` and `connectDB` share one `cached` connection — no duplicate pools; but `connectBaseDB` has no callers.
- Tenant scoping/RBAC code was not touched by any change in this branch.
