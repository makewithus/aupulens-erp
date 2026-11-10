# Resource Optimization Remediation — Security Final (G4, G5, G8, G9)

Branch `feature/resource-optimization-remediation`. Evidence = code + the tests named. "Not verified" is stated where it applies.

## G4 — JWT entitlement freshness & revocation
**Previous finding:** `orgModuleData` copied into the JWT at login and trusted for the full 8 h; suspension/downgrade/disable not seen; paid upgrades falsely blocked.
**Root cause:** the `jwt` callback never re-reads the org; middleware used `user.orgModuleData ?? fetch`.

**Implementation**
- `models/admin/Organization.ts`: `entitlementVersion` (monotonic). Schema hooks (`pre('save')`, `pre(updateOne|updateMany|findOneAndUpdate)`) bump it whenever `tier`, `subscriptionStatus`, `trialEndDate`, `isActive`, `status`, `settings.enabledModules/disabledModules` change (`lib/platform/entitlements/version.ts`). `models/platform/OrganizationEntitlement.ts` hooks (save/update*/delete*) bump the owning org's version. Centralised, so new mutation routes cannot bypass it as long as they use Mongoose. Raw-driver writes/`bulkWrite` do not run middleware (none exist today: grep for `Organization.collection|bulkWrite` is empty); `bumpEntitlementVersion()` is provided for them.
- JWT carries `orgModuleData`, `entitlementVersion`, `entitlementCheckedAt` (stamped at sign-in; refreshes never re-stamp it).
- `lib/middleware/entitlementFreshness.ts` (Edge-safe): claims are trusted ≤ 60 s (`ENTITLEMENT_MAX_AGE_MS`); older, absent (legacy), unstamped or far-future claims ⇒ server re-read. Unavailable ⇒ **deny** (`503 ENTITLEMENT_UNAVAILABLE`, `private, no-store`), never fall back to stale claims or fail open.
- `middleware.ts`: cache created with `staleMs: 0` (no stale-while-revalidate past the bound), `freshMs` 30 s; cache key `tenant|user`.
- `/api/internal/org-tier`: returns `entitlementVersion`, `entitlementCheckedAt`, `isActive`, `userActive` (user `status === 'active'`); all error responses `no-store`.
- Org deactivation (`isActive=false`) now blocks (`isSubscriptionBlocked`); a deactivated user gets `401 USER_REVOKED` (API) or a redirect to `/auth` with cookies cleared (pages).

**Worst-case staleness:** JWT claims ≤ 60 s; server path ≤ 30 s (edge cache) + 5 s (resolver cache) = 35 s. No re-login required.

**Tests added** (all passing): `entitlementFreshness.unit.test.ts` (19), `entitlementLifecycle.test.ts` (19, real route + real DB: downgrade, suspension, org deactivation, module disable/enable, trial expiry, trial→paid, plan up/down, user deactivation/reactivation, legacy token, service down, version bumps incl. 20 concurrent updates = +20), `middlewareEntitlements.test.ts` (9, real `middleware` function). Existing `usageNavigation.test.ts` fixture changed: it mocked an unavailable entitlement lookup and expected pass-through (the old fail-open); it now supplies a healthy org. No assertion was weakened.

**Remaining risks:** (1) tested with the real middleware *function* and mocked Auth.js wrapper/cache, not in a deployed Edge runtime. (2) Entitlement enforcement remains middleware-centred (pre-existing architecture); API handlers do their own RBAC/tenant checks but do not re-check module entitlement. (3) Plan-definition edits (not per-org) do not bump a version; they are picked up by the ≤ 35 s server re-read. (4) After the first minute of a session most requests use the server path again, so the "no org-tier hop" saving is largely gone and the no-SWR cache can add latency on expiry — **NOT MEASURED**. (5) Per-user cache keys increase org-tier calls vs the previous per-tenant key — **NOT MEASURED**.

**Status: PASS** (middleware boundary, with the risks above).

## G5 — tenant-sensitive HTTP caching
**Previous finding:** `private, max-age=60, stale-while-revalidate=300` on banking-rules, accountants, account-types, HR departments — URL-keyed browser cache survives logout/account switch; no mutation invalidation.
**Implementation:** `lib/api/noStore.ts` (`private, no-store`) applied to success **and** 401/500 paths of those four GET handlers. No `s-maxage`/`public` anywhere in `app/`, `lib/`, `middleware.ts`, `next.config.ts` (grep). `/api/internal/org-tier` errors also `no-store`.
**Tests:** `noStoreCache.test.ts` (10): headers on all four endpoints for two organisations, 401 not cacheable, Org A's custom department never in Org B's response, newly created department visible on the next request.
**Not verified:** a real browser cache across logout (HTTP semantics: with `no-store` nothing is stored). Other GET endpoints without any `Cache-Control` rely on default heuristics (no `Last-Modified`/`ETag` ⇒ not heuristically cached); a full header audit of all 336 GET routes was not done.
**Status: PASS** for the four endpoints; wider audit **INCOMPLETE**.

## G8 — Upstash rate limiter
**Previous finding:** `INCR` then a separate best-effort `PEXPIRE` (errors swallowed) ⇒ counter without TTL ⇒ permanent lockout (reproduced).
**Implementation:** single Lua `EVAL` (INCR; PTTL; if new or no TTL → PEXPIRE; return `{count, ttl}`) through Upstash's documented REST command API (`POST /` with `["EVAL", script, 1, key, ms]`); window validated (positive integer ≤ 24 h); response validated; constructor rejects malformed URL/token; limit-aware `remaining`/`allowed`; `X-RateLimit-Remaining` now real. Policies unchanged: sensitive-auth routes fail **closed** (429 + `Retry-After: 3`), ordinary routes fail **open**.
**Tests:** `upstashRateLimit.test.ts` (12) against an in-process Redis emulator that implements the script's semantics: first request/single round-trip, sequential, expiry, 90 concurrent increments across 3 store instances, request failure leaves no half-written key, **repair of a pre-existing TTL-less key**, malformed config/window/response, DEL, outage fail-closed/fail-open, 429 headers, malformed env config.
**Not verified:** the Lua script was **not executed on a real Redis/Upstash** (none installed, no credentials); the emulator mirrors the script by hand. `UPSTASH_REDIS_REST_*` appear in no env file, workflow or deploy config — **production activation is not shown**. Needs a staging check.
**Status: PASS** (code + emulated tests); activation **NOT MEASURED/INCOMPLETE**.

## G9 — middleware matcher
**Previous finding:** the extension exclusion also applied to `/api/**`, so e.g. `/api/sales/invoice-templates/x.json` skipped middleware.
**Implementation:** `(?!api/).*\.(ext)$` inside the exclusion lookahead — extensions are excluded only outside `/api/`. Explicit matchers untouched.
**Tests:** `middlewareMatcher.test.ts` (32) evaluates the real matcher array from `middleware.ts` with Next's own `path-to-regexp`: static assets/_next/favicon/robots/sitemap/manifest/`/api/auth/*` bypass; `/api/**` ending `.json/.txt/.xml/.js/.png`, the three `[key]` routes, finance/admin/internal/cron APIs all run middleware; pages run it.
**Not verified:** Next's runtime matcher compilation in a deployed build (the build succeeded; matcher semantics tested via the same library).
**Status: PASS.**
