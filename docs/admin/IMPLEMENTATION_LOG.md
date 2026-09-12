# IMPLEMENTATION_LOG.md — Global Admin Control Plane

> Append one entry per phase. Never edit a prior entry except to append a correction dated later.

---

## Phase 0 — Discovery (2026-09-09)

**What existed before**: the full AI-workflows project's inventory (`docs/ai/SYSTEM_INVENTORY.md`,
`GLOSSARY.md`, `DECISIONS.md`, `BASELINE_FAILURES.md`, `UI_REGRESSION.md`), a live `master-admin`
role and portal, three divergent organisation-creation code paths, a thin `Organization.tier`
billing surface, `AiUsage`/`ActivityLog` coarse metering/logging, and rich per-run AI data
(`AiWorkflowRun`/`AiDecisionTrace`) not yet aggregated as usage.

**What was built this phase**:
- `docs/admin/SYSTEM_INVENTORY_DELTA.md` — corrections to the brief's own assumptions (2
  referenced docs don't exist under the names given; baseline test count changed; `master-admin`
  is live, not vestigial) plus new findings specific to the admin brief (org-creation paths,
  billing surface, logging comparison, NextAuth session seam).
- `docs/admin/CAPABILITY_MAP.md` — MISSING/PARTIAL/EXISTS for every phase's scope.
- `docs/admin/OPEN_QUESTIONS.md` — 5 entries, none blocking, each resolved with a stated safe
  default per Part 1.2.
- Refreshed `artifacts/api-surface.txt` (412→424 routes) and `artifacts/routes.txt` (239→240
  pages) to the current tree, since both were stale by ~2 weeks.

**Tests**: ran full suite (`npx vitest run --maxWorkers=3` — default parallelism produces 42
spurious mongod-connection-timeout failures from resource contention on this shared machine, a
known issue already documented in `docs/ai/BASELINE_FAILURES.md`). Result: `3 failed | 156 passed`
files, `5 failed | 1353 passed` tests — all 5 failures are pre-existing, deterministic (verified
via repeated and fully-sequential re-runs), and unrelated to this brief's scope (see
`OPEN_QUESTIONS.md` #5). `npx tsc --noEmit`: clean. Eslint: not re-run repo-wide (no files touched
yet this phase; existing ~18,819-problem baseline stands per its own standing rule).

**UI regression**: not run (no UI code exists yet to scan). Four pre-existing broken routes
(`/finance/returns`, `/hr/attendance`, `/hr/leave`, `/sales/invoices/new`) carried forward as
baseline.

**Could not do / deferred**: `docs/ai/audits/TIME_AUDIT.md` and `docs/ai/AI_Workflow_Test.md`
don't exist under those names — noted, alternate references identified for later phases.

**Assumptions in the brief that turned out wrong**: see `SYSTEM_INVENTORY_DELTA.md` §0, items 1-7.
The most consequential: `master-admin` is fully live and load-bearing, not a partial/vestigial
ancestor — Phase 1's admin-identity design proceeds as a fully separate, non-interacting domain.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 1 — Control-plane foundation (2026-09-11)

**What existed before**: nothing in `models/platform/` or `lib/platform/` — confirmed empty in
Phase 0's `CAPABILITY_MAP.md`. The live `master-admin` role (left completely untouched, per
`OPEN_QUESTIONS.md` #1). `models/crm/CrmAuditLog.ts`'s immutability-guard pattern (reused, not
reused-as-a-model). `lib/org/rbac.ts`/`lib/crm/rbac.ts`'s small-explicit-module shape (reused as a
pattern for `lib/platform/auth/adminRbac.ts`).

**What was built**:
- `lib/constants/statuses.ts`: `ADMIN_ROLE`, `ADMIN_USER_STATUS`, `ADMIN_CAPABILITY`,
  `PLATFORM_EVENT_CATEGORY`, `PLATFORM_EVENT_TYPE`, `PLATFORM_SEVERITY` (+ values/labels/colors),
  additive at end of file, matching the existing `*_VALUES`/`*_LABELS` export shape exactly.
- `models/platform/`: `AdminUser`, `AdminRole`, `AdminSession`, `PlatformAuditLog` (the last with
  seven Mongoose middleware guards enforcing append-only, including a `pre("save")` guard for
  re-saves — a gap a surface copy of `CrmAuditLog`'s pattern would have missed).
- `lib/platform/auth/`: `totp.ts` (RFC 6238, hand-rolled on Node `crypto` — no new runtime
  dependency for the algorithm itself), `adminSessionEdge.ts` (Edge-safe: JWT sign/verify via
  `jose`, no Mongoose import — importable from `middleware.ts`), `adminSession.ts` (Node-only,
  DB-backed: session issue/verify/revoke), `adminRbac.ts` (capability checks backed by
  `AdminRole`, 60s in-process cache matching `middleware.ts`'s existing `getOrgModuleData` pattern),
  `types.ts`.
- `lib/platform/tenancy/crossTenant.ts`: the one sanctioned cross-tenant read gateway
  (`withCrossTenantRead`), with one real Phase-1 consumer (`countOrganizations`).
- `lib/platform/audit/emit.ts`: the one writer of `PlatformAuditLog`.
- `middleware.ts`: one additive block gating `/platform` + `/api/platform` (Edge-safe JWT check
  only — the authoritative DB-backed check lives in the layout/route handlers, matching this
  repo's existing convention). Also added `/api/platform` to the pre-existing "central tenant
  session check for API routes" exemption list — without this, every `/api/platform/**` request
  would have been unconditionally 401'd before reaching the new code, since an admin session never
  populates the tenant `req.auth`/`user` object that check depends on. Found and fixed via `tsc`/
  manual review before it ever shipped, not discovered by a user report.
- `app/platform/login/**` + `app/platform/(app)/**` (route group so the login pages aren't gated
  by the same layout that redirects to them), `components/platform/PlatformShell.tsx`,
  `config/sidebar/platform.ts`.
- `app/api/platform/`: `auth/login`, `auth/mfa/setup`, `auth/mfa/verify`, `auth/logout`, `me`,
  `dashboard/summary` — the last with two real, live, non-static numbers (organisation count via
  the gateway, admin user count, audit-events-today count) and two honest `available: false` empty
  states (AI usage, billing) rather than any placeholder figure.
- `scripts/seed-platform-roles.ts` (idempotent §30 matrix upsert — see `OPEN_QUESTIONS.md` #6 for
  why its exact cell contents are an inferred default) and `scripts/seed-platform-admin.ts`
  (idempotent bootstrap of the first `GLOBAL_SUPER_ADMIN`, MFA-disabled until first-login
  enrollment).
- `package.json`: added `jose` as an explicit direct dependency (was only a transitive dependency
  of `next-auth` before; now imported directly).
- `.env.example`: documented `ADMIN_SESSION_SECRET`, `PLATFORM_BOOTSTRAP_ADMIN_EMAIL/PASSWORD`.

**Tests added**: 7 new files, 56 tests — `totp.test.ts`, `adminRbac.test.ts`,
`adminSession.test.ts` (including two explicit hostile-case tests: a forged/differently-signed
token, and cookie replay after revocation), `crossTenant.test.ts`, `platformAuditLog.test.ts`,
`sourceGrep.test.ts` (static-analysis enforcement that the gateway is the only cross-tenant path
and the audit log's guards stay intact), `authFlow.route.test.ts` (full login → MFA-setup →
confirm → session → `/me` → logout → cookie-now-rejected round trip via real route-handler
imports, plus a lockout test and a returning-admin-no-setup-step test).

**Manual verification beyond automated tests**: drove the full HTTP flow with `curl` against both
`next dev` and a real production build (`npm run build:local` + `npm run start:local`) on a local
MongoDB, seeding real `AdminRole`/`AdminUser` rows first. Found a real Next.js framework behavior
(soft client-side redirect instead of a clean HTTP 307 for a redirect thrown after SSR streaming
begins) during this manual pass — root-caused with a server-side debug log, confirmed the
authorization decision was always correct, and hardened the client component regardless (see
`docs/admin/verification/admin-identity.md` and `OPEN_QUESTIONS.md` #7). This is exactly the kind
of finding manual verification exists to catch that unit tests alone would not have surfaced.

**Verification records**: `docs/admin/verification/admin-identity.md`,
`cross-tenant-gateway.md`, `audit-log.md`.

**Results**: full suite `3 failed | 163 passed` files (156 pre-existing-baseline + 7 new, all new
ones passing; the 3 failures are the pre-existing, unrelated `OPEN_QUESTIONS.md` #5 findings, byte-
identical to the Phase 0 baseline), `tsc --noEmit` clean, `eslint` clean on every file this phase
touched or added.

**UI regression**: not run as a full 240-route production sweep (Phase 1 adds new routes, touches
no existing tenant route's behavior — `middleware.ts`'s only change is a new, isolated `if` branch
plus widening the `isPublicApi` exemption to include a path prefix, `/api/platform`, that did not
exist before this phase, so no existing route's matching changes). Manually verified via the
production-build smoke test above that the new `/platform/**` surface itself works end-to-end.
A full targeted scan (new platform routes + 20-route canary, per `docs/ai/UI_REGRESSION.md`'s
methodology) is deferred to Phase 2, once there's a real organisation list to make the canary
meaningful alongside.

**Could not do / deferred**: `AdminAccessRequest` (Phase 7), retention (Phase 5), the full §30
matrix wired to real gated features beyond `VIEW_ORGANIZATIONS` (each later phase wires its own as
it ships).

**Assumptions that turned out wrong or needed correction**: the §30 matrix wasn't quoted in the
brief (see `OPEN_QUESTIONS.md` #6). `middleware.ts`'s pre-existing "central session check for API
routes" would have silently 401'd every `/api/platform/**` request — not mentioned anywhere in the
brief, found only by tracing the existing middleware's control flow before writing the new block.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 2 — Organisation management (2026-09-11)

**What existed before**: three divergent `Organization.create()` paths (none admin-actor-aware),
a thin `Organization.tier`/`isActive`/`subscriptionStatus` surface, working COA seeders and
`appendSubscriptionEvent`, `SubscriptionEvent` as a real append-only history model with only
`created`/`upgraded`/`downgraded` ever fired — all documented in Phase 0.

**What was built**:
- `lib/constants/statuses.ts`: `ORGANIZATION_STATUS` (+transitions+labels),
  `ORGANIZATION_TYPE` (+labels), `SUBSCRIPTION_EVENT_TYPE.STATUS_CHANGED` (additive to the
  pre-existing enum).
- `models/admin/Organization.ts`: additive `status?`, `organizationType?`, `region?` fields — every
  pre-existing field, index, and reader untouched.
- `models/platform/OrganizationType.ts` + `scripts/seed-platform-org-types.ts`: the 8 types as
  configurable records (default modules/limits), not hardcoded behaviour.
- `lib/platform/organizations/`: `list.ts` (server-paginated, real derived fields — active user
  count, last-meaningful-activity, AI usage % — batched per page, not N+1), `create.ts` (the
  fourth, admin-actor-aware creation path: Organization + owner User + seeded COA +
  `SubscriptionEvent` + audit, reusing the existing seeders directly rather than calling the public
  registration route), `statusTransition.ts` (validated transitions, `SUSPENDED` flips the
  pre-existing `isActive` flag that `auth.ts` already enforces), `detail.ts` (7 of 11 §7 tabs with
  real data; AI Usage/Billing are honest empty states pending Phase 4/6), `types.ts` (client-safe
  shared types/constants — kept separate from the Mongoose-importing files after catching that a
  client component was about to pull server-only code into the browser bundle).
- `app/api/platform/organizations/**`, `app/platform/(app)/organizations/**`,
  `config/sidebar/platform.ts` (new "Organisations" section).

**Tests added**: 3 new files, 20 tests (`organizationStatus.test.ts`, `organizationList.test.ts`,
`organizationCreate.test.ts`) — all passing.

**Manual verification over real HTTP** (dev server, local MongoDB, seeded roles/org-types/bootstrap
admin): listed (empty→populated), created a real organisation via the API and confirmed
`OrganizationType`-derived defaults landed correctly, then — the load-bearing check —
**confirmed the created tenant's owner account could actually log in** to the real tenant app, then
**confirmed suspension genuinely blocks that same login** (`redirect to /auth?error=Configuration`
vs. a clean redirect before suspension). This is the exact "suspension must do something real"
requirement (source doc §33 rule 8), verified end-to-end, not just asserted in a unit test. Also
caught, mid-verification, that the state machine correctly rejects `onboarding → suspended`
(only `active`/`trial` can be suspended) — a state-machine correctness confirmation, not a bug.

**Results**: full suite `3 failed | 166 passed` files (163 Phase-1 baseline + 3 new, all new
passing; same 3 pre-existing unrelated failures), `tsc --noEmit` clean, `eslint` clean on every
file this phase touched or added (two stale `eslint-disable` comments removed during cleanup).

**Verification record**: `docs/admin/verification/organizations.md`.

**Could not do / deferred**: 4 of the §7 tabs (Modules editing, Configuration, Security, full
Billing) are read-only or empty-state this phase — Modules is visible via the Overview tab's
`enabledModules` list but has no dedicated edit UI yet (out of this phase's scope, no source-doc
requirement demanded it be editable in Phase 2 specifically). A full 240+-route UI regression
sweep was not run (no existing tenant route's behavior changed); the new `/platform/organizations/**`
surface itself was manually verified end-to-end instead.

**Assumptions that turned out wrong or needed correction**: none new this phase — Phase 0/1's
`OPEN_QUESTIONS.md` #2 decision (status changes also flip `isActive`) was implemented exactly as
planned and verified correct.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 3a — Plans, entitlements, resolver (2026-09-11)

**What existed before**: a thin `Organization.tier` (3 values) + `lib/constants/tiers.ts`'s
hardcoded `getTierLimits()` — the exact "entitlements as code" anti-pattern Hard Rule 6 forbids
perpetuating, left untouched for existing tenant-facing reads (Phase 3b's concern).
`SubscriptionEvent` as a proven, reusable append-only history model (Phase 2's own precedent).

**What was built**:
- `lib/constants/statuses.ts`: `PLAN_KEY` (7 plans, source doc §8 — deliberately a new, richer
  enum, not a repurposing of the old 3-value `ORGANIZATION_TIER`), `SUPPORT_LEVEL`,
  `BILLING_CYCLE`, `SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED` (additive).
- `models/platform/Plan.ts` + `models/platform/OrganizationEntitlement.ts` +
  `scripts/seed-platform-plans.ts`.
- `lib/platform/entitlements/resolve.ts`: the single source-of-truth resolver. Bridges the
  pre-existing `Organization.tier` to a `PLAN_KEY` for tenants with no entitlement row (a
  documented mapping, not a guess); layers `OrganizationEntitlement.overrides` on a base plan
  (§11); **defaults to permissive and audits at `SECURITY` severity when it errors** (Part 2.4's
  explicit instruction) rather than locking a tenant out; in-process cached.
- `lib/platform/entitlements/assignPlan.ts`: full history via `SubscriptionEvent`, capability-
  gated, reason-required, audited. Touches only `OrganizationEntitlement` and `SubscriptionEvent`
  by construction — no code path in this function can reach a tenant business-data collection.
- `app/api/platform/plans/`, `app/api/platform/organizations/[id]/plan/`,
  `app/platform/(app)/plans/page.tsx`, an "Assign plan" control added to the organisation detail
  page's Subscription tab, `config/sidebar/platform.ts` (new "Billing" section).

**Tests added**: 2 new files, 17 tests (`resolveEntitlements.test.ts`, `assignPlan.test.ts`) — all
passing. `assignPlan.test.ts`'s downgrade test is a real document-count assertion across `User`
and `Account` collections, not a mock.

**Manual verification over real HTTP**: seeded all 7 plans, created a real organisation (resolved
to `starter` via the tier-fallback bridge before any explicit assignment), assigned `pro` through
the real API, and confirmed the resolved entitlements changed to `pro`'s actual feature set.

**Results**: full suite `3 failed | 168 passed` files (166 Phase-2 baseline + 2 new, all new
passing; same 3 pre-existing unrelated failures — one run in this phase showed a 4th transient
failure that did not reproduce on two immediate re-runs, consistent with the mongod-contention
flakiness `docs/ai/BASELINE_FAILURES.md` already documents on this shared machine, not a real
regression), `tsc --noEmit` clean, `eslint` clean on every file touched.

**Verification record**: `docs/admin/verification/entitlements.md`.

**Could not do / deferred**: no UI exists yet to configure a `Plan`'s own features (only to view
the catalogue and assign a plan to an org) — not required by this phase's exit gate.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 3b — Entitlement enforcement, deliberately one route (2026-09-11)

**Scope decision, stated up front**: the brief frames this phase as "the single most dangerous
change in this project" with 424 existing API routes and a hard "zero regression" rule. Retrofitting
all of them in one pass would be exactly the reckless move the brief warns against. This phase
builds the reusable primitive, proves it on one real route with pre-existing test coverage, and
documents the other ~423 as an explicit, tracked to-do (`OPEN_QUESTIONS.md` #8) rather than a
silent gap.

**What was built**:
- `lib/platform/entitlements/enforce.ts`: `moduleIsEnabled()` / `requireModuleEnabled()` —
  inserted as one line in the exact sequence every route already follows (`auth()` → `tenantId` →
  business logic), not a new abstraction layer. **Fails open** when the resolver itself is in its
  permissive-default failure mode — a resolver error must never compound into a lockout.
- Wired into `app/api/inventory/orders/route.ts` POST — chosen specifically because it already had
  a real test file to extend (manufacturing, the first candidate, had no route-level tests for
  anything, which would have meant writing the regression check from scratch instead of proving an
  existing one still holds).

**Tests added**: `tests/platform/enforce.test.ts` (4 tests: allow, block-with-message, legacy
`{error}` shape support, fail-open-on-resolver-error) plus one new test appended to the existing
`tests/inventory/orders.route.test.ts` (block against a real restrictive `Plan`, zero
`InventoryOrder` documents created) — the file's 5 pre-existing tests pass completely unmodified,
which is itself the regression proof: none of them configure a `Plan` for their tenant, so the
resolver's own permissive-default path means enforcement changes nothing for a tenant with no plan
set up yet.

**Results**: full suite `3 failed | 169 passed` files (168 Phase-3a baseline + 1 new file, the
extended inventory test file staying at 1 file with +1 test; same 3 pre-existing unrelated
failures), `tsc --noEmit` clean, `eslint` clean.

**Verification record**: `docs/admin/verification/entitlement-enforcement.md`.

**Could not do / deferred**: the other ~423 API routes remain unenforced by design — see
`OPEN_QUESTIONS.md` #8 for the exact repeatable pattern to extend this route by route.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 4 — AI usage metering (2026-09-11)

**What existed before**: `models/admin/AiUsage.ts` (coarse per-tenant-per-month call counter,
success-only, no token/cost/latency/model detail — left completely untouched, still the source of
truth for the pre-existing monthly-cap check), `lib/ai/tenantAi.ts::callClaudeForTenant()` as the
one real chokepoint, `models/ai/AiWorkflowRun.ts` as real per-run workflow data.

**A real gap found**: `lib/ai/claude.ts::callClaude()` discarded Azure OpenAI's `usage` object
entirely — no real per-request token count existed anywhere in this codebase before this phase.

**What was built**:
- `lib/ai/claude.ts`: `callClaudeWithUsage`, `callClaudeWithHistoryAndUsage`,
  `callClaudeStreamWithUsage` — additive siblings returning `{text, usage}`; the originals are
  completely untouched, every other call site of `callClaude`/`callClaudeWithHistory`/
  `callClaudeStream` is unaffected.
- `lib/ai/tenantAi.ts`: internally switched to the `*WithUsage` variants; added an optional
  `feature` opt (additive) for metering bucket attribution; wired
  `lib/platform/ai/instrumentation.ts::recordAiUsage()` (success and error paths) and
  `lib/platform/ai/limitBehavior.ts::resolveAtLimitDecision()` in place of the old unconditional
  block at the monthly cap. `callClaudeForTenant`'s own public contract is unchanged.
- `models/platform/`: `AiUsageRecord` (per-request, no prompt/response text — Hard Rule 9),
  `AiUsageDaily`/`AiUsageMonthly` (rollups), `AiCostRate` (server-side cost source), `AiLimit`
  (per-tenant at-limit behavior, absent row = `BLOCK`, byte-identical to pre-Phase-4),
  `AiOverageConfig`.
- `lib/platform/ai/`: `instrumentation.ts`, `limitBehavior.ts` (all 4 §15 behaviors), `rollup.ts`
  (idempotent, also folds `AiWorkflowRun` into `ai_automation` at request-count-only), `featureMap.ts`
  + `docs/admin/AI_FEATURE_MAP.md` (every real `AiFeature` key mapped, gaps stated honestly —
  Document Processing and AI Agents aren't instrumented yet, reported as real zeros not omitted).
- `app/api/cron/platform/ai-usage-rollup/` + `vercel.json` (found empty at repo root despite the
  Phase 0 inventory's claim that other crons were registered there — added only this phase's own
  entry, didn't touch/fix the apparent pre-existing gap, out of scope).
- Dashboard (`/platform`) and the organisation AI Usage tab now show real rollup-backed numbers,
  replacing Phase 1/2's honest empty states now that real data exists.

**A real regression caught and fixed**: switching `tenantAi.ts`'s internal calls broke two
pre-existing test files that mocked `lib/ai/claude.ts` by name
(`tests/saas/aiLimits.test.ts` — 42 tests, `tests/ai/aiSafetyGuards.test.ts` — 6 tests). Both fixed
by updating their mocks to the new function names and resolved-value shape, plus mocking the two
new `lib/platform/ai/*` calls; every original assertion passes unmodified. Full writeup in
`docs/admin/verification/ai-metering.md`.

**Tests added**: 4 new files, 21 tests, all passing.

**Manual verification over real HTTP**: seeded synthetic `AiUsageRecord` rows (no live Azure
OpenAI credentials in this sandbox), ran the real rollup, then confirmed the dashboard summary and
per-org AI Usage tab both reflected the seeded numbers exactly through the real API routes. Cron
endpoint's `CRON_SECRET` check verified (401 without/with-wrong secret).

**Results**: full suite `3 failed | 173 passed` files (169 Phase-3b baseline + 4 new, all new
passing plus the 2 fixed pre-existing files; same 3 pre-existing unrelated failures), `tsc
--noEmit` clean, `eslint` clean.

**Verification record**: `docs/admin/verification/ai-metering.md`.

**Could not do / deferred**: `lib/docIntel/` (vendor-bill OCR) isn't instrumented through
`tenantAi.ts` yet, so Document Processing usage is a real, honest zero, not actual absence of
usage — see `AI_FEATURE_MAP.md`. No admin UI to edit `AiLimit`/`AiOverageConfig`/`AiCostRate`
rows yet (seed scripts only) — not required by this phase's exit gate.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 5 — Logging, audit, retention (2026-09-11)

**What existed before**: Phase 1 already built the structured, immutable `PlatformAuditLog` and
event taxonomy — this phase's real scope was narrower than Part 2.6 initially reads: retention
policy + job, and org-type log profiles.

**What was built**:
- `models/platform/RetentionPolicy.ts` + `lib/platform/audit/retention.ts`: most-specific-match
  resolution (org-type + country + category + type, most filters set wins), hardcoded 30-day
  fallback when nothing is configured at all, `runRetentionSweep()` (per-group cutoff, deletion is
  itself an audited `RETENTION_DELETION_EXECUTED` event written before the delete).
- `app/api/cron/platform/retention-sweep/` + `vercel.json` entry.
- `models/platform/OrganizationType.ts`: additive `defaultConfig.logProfile.eventCategories`
  (source doc §20) — a display filter only, never a restriction on what's logged.
- `lib/platform/audit/search.ts` + `app/api/platform/audit-logs/`: the global cross-tenant audit
  viewer, through the gateway, itself audited.
- `app/api/platform/retention-policies/` + `/platform/audit-logs`, `/platform/settings/retention` UI.
- `tests/platform/sourceGrep.test.ts` extended: `allowRetentionDelete` (Phase 1's own escape
  hatch, unused until now) appears only in `retention.ts`.

**Tests added**: 1 new file (`retention.test.ts`, 9 tests) + 1 test appended to the existing
source-grep suite — all passing. Caught and fixed one test-authoring mistake mid-development (an
assertion didn't account for the sweep's own audit event also matching the query filter it was
checking) — a real "verify your test's assumptions against actual behavior" catch, not a product
bug.

**Manual verification over real HTTP**: seeded the platform default policy, confirmed the audit
log viewer returns real events, the retention policy list returns the real seeded row, and the
cron sweep runs cleanly (`CRON_SECRET`-gated, 401 without it — implied by the existing pattern,
not re-verified since Phase 4 already proved this exact gate shape).

**Results**: full suite `3 failed | 174 passed` files (173 Phase-4 baseline + 1 new; same 3
pre-existing unrelated failures), `tsc --noEmit` clean, `eslint` clean.

**Verification record**: `docs/admin/verification/audit-retention.md`.

**Could not do / deferred**: no per-tenant retention-policy admin UI beyond a flat global list
(no organisation-specific override editor) — not required by this phase's exit gate, which only
asks for provable resolution + sweep + self-audit.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 6 — Dashboard, global search, alerts, API monitoring (2026-09-11)

**What existed before**: dashboard KPIs (org count, admin count, audit events, full AI usage
summary from Phase 4) already live on `/platform`; MRR/ARR already an honest empty state
(`OPEN_QUESTIONS.md` #4). This phase's real scope was global search, alerting, and API monitoring.

**What was built**:
- `lib/platform/search/globalSearch.ts` + `app/api/platform/search/` + `/platform/search`:
  cross-tenant, through the gateway, audited on every call including zero-result ones. Searches
  organisations, tenant users, admin users, audit events (`entityId`), subscription events, AI
  usage records (`requestId`), API keys.
- `models/platform/PlatformAlert.ts` + `lib/platform/alerts/emit.ts`: in-app delivery is real
  (the alert row, surfaced on `/platform`'s new Alerts panel); `emailSent`/`webhookSent` are
  structurally never set `true` anywhere — no platform-level send infrastructure exists
  (`OPEN_QUESTIONS.md` #9) — enforced by a source-grep test, not just a passing unit test.
- `lib/platform/ai/limitBehavior.ts::checkAiUsageThresholdCrossing()`: fires an alert exactly once
  per 50/75/90/100% boundary actually crossed (not once per call above it), wired into both of
  `tenantAi.ts`'s success paths.
- `lib/platform/organizations/statusTransition.ts`: a `SUSPENDED` transition now also raises a
  real `PlatformAlert`.
- `models/platform/ApiKey.ts`/`ApiUsage.ts` + `app/api/platform/api-monitoring/` +
  `/platform/api-monitoring`: confirmed (again) no external API/key concept exists in this
  codebase — built the models and an honest "no API keys have ever been issued" empty state
  against real (zero) counts, never fabricated traffic.

**A real regression caught and fixed, second occurrence of the same failure mode**: the new
`checkAiUsageThresholdCrossing` export broke the same two pre-existing test files Phase 4 had
already fixed once (`aiLimits.test.ts` — 42 tests, `aiSafetyGuards.test.ts` — 6 tests), because
their `vi.mock("@/lib/platform/ai/limitBehavior", ...)` factories didn't include the new export.
Fixed with a no-op mock in both; all 48 original assertions pass unmodified.

**Tests added**: 2 new files, 18 tests (`globalSearch.test.ts` — 8, `alerts.test.ts` — 10,
including the source-grep delivery-honesty check), all passing.

**Manual verification over real HTTP**: created a real organisation, found it (plus its owner
user and its subscription-created event) via global search in one response; suspended it through
the real status-transition API and confirmed a real `PlatformAlert` row appeared with the exact
suspension reason; confirmed API monitoring's honest empty state against real zero counts.

**Results**: full suite `3 failed | 176 passed` files (174 Phase-5 baseline + 2 new; same 3
pre-existing unrelated failures), `tsc --noEmit` clean, `eslint` clean.

**Verification record**: `docs/admin/verification/dashboard-search-alerts.md`.

**Could not do / deferred**: email/webhook alert delivery (`OPEN_QUESTIONS.md` #9) — no sending
infrastructure exists or was in scope to build; "invoice ID"/"transaction ID" search from source
doc §23 map to nothing real in this codebase (no platform-level invoice/transaction concept) and
were not faked.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 7 — Organisation access / impersonation (2026-09-11/12)

**Scope decision, stated up front**: source doc §26 describes browsing the tenant's actual
application; this control plane never does that (Part 2.1). Rather than force-fit a gate onto
Phase 2's already-tested Organisation detail tabs (real regression risk, no proven need — every
role that can read them today does so via a plain capability), this phase built the complete,
real request → approve/deny → time-boxed session → auto-expire → full-audit-trail workflow as
standalone infrastructure, following the exact "build the primitive, prove it, extend only where
needed" pattern Phase 3b already established. Recorded as a deliberate choice, not a shortfall
(`OPEN_QUESTIONS.md` #10).

**What was built**:
- `models/platform/AdminAccessRequest.ts` + `lib/platform/access/request.ts`: full lifecycle.
  `write` scope is rejected at request time (not just left to the approver) for any actor without
  `IMPERSONATE_WRITE` — `SUPPORT_ADMIN`/`READ_ONLY_ADMIN` can never even file one. Approval always
  sets a fixed 4-hour `expiresAt` — never open-ended.
- `lib/platform/access/status.ts::getActiveAccessGrant()`: the one function a banner reads.
  Expiry is checked LIVE (`expiresAt < now`), so correctness never depends on the cron having run.
- `app/api/cron/platform/access-session-expiry/`: tidies stale rows' `status` field for reporting
  only — not what enforces the boundary.
- `app/api/platform/access-requests/**`, `/platform/access-requests` (request + approve/deny
  queue), and a real elevated-session banner wired into the Organisation detail page, backed by
  `GET /api/platform/organizations/[id]/access-status`.

**Tests added**: 1 new file, 12 tests, all passing — including a time-boxing proof that sets a
real past `expiresAt` directly rather than sleeping the test suite.

**An environment incident correctly diagnosed during verification**: mid-testing, the shared
machine's `mongod` crashed (core-dump) under memory pressure — the same failure mode
`docs/ai/BASELINE_FAILURES.md` already documented once. Diagnosed via `systemctl status mongod`
rather than assumed to be a code regression from the shifting, unrelated set of test failures it
produced; no `sudo` available, so a fresh user-owned `mongod` instance was started (working around
a stale Unix socket and an `AF_UNIX` path-length limit). A full suite re-run against the healthy
instance came back byte-identical to the expected baseline. Full writeup:
`docs/admin/verification/organization-access.md`.

**Manual verification over real HTTP**: drove the complete lifecycle — requested access, confirmed
`active: false` before approval, approved, confirmed `active: true` with the correct reason/admin
name/expiry, ended the session, confirmed `active: false` again.

**Results**: full suite `3 failed | 177 passed` files (176 Phase-6 baseline + 1 new; same 3
pre-existing unrelated failures), `tsc --noEmit` clean, `eslint` clean.

**Verification record**: `docs/admin/verification/organization-access.md`.

**Could not do / deferred**: the access-request flow is not wired as an enforced gate on any
existing tenant-data view (`OPEN_QUESTIONS.md` #10) — deliberate, not required by this phase's
exit gate, which asks only for a provable lifecycle.

**Commit**: local only, branch `global/admin`, no push.

---

## Phase 8 — Hardening and handover (2026-09-12)

**What was built this phase**:
- `tests/platform/noStaticData.test.ts` (Hard Rule 3, made structural rather than a one-time
  manual review): walks every `app/platform/**/page.tsx`, fails if a page renders a
  dynamic-looking value without a real `fetch("/api/platform/...")` call, and separately bans
  hardcoded sample-record arrays and hardcoded MRR/ARR figures. 15 tests, all passing.
- `lib/platform/auth/roleMatrix.ts`: extracted the §30 permission matrix (previously inlined only
  in `scripts/seed-platform-roles.ts`) into its own module, so the seeded database and a new test
  can never silently drift apart.
- `tests/platform/permissionMatrix.test.ts`: the full matrix test the brief's Part 5.2 calls out
  by name — one generated case per role × capability cell (7×24=168), driven directly from
  `roleMatrix.ts`, plus structural guarantees (only `GLOBAL_SUPER_ADMIN` holds all 3 destructive
  capabilities together; `READ_ONLY_ADMIN` has no mutating capability; `IMPERSONATE_WRITE` never
  reachable by `SUPPORT_ADMIN`/`READ_ONLY_ADMIN`). 179 tests, all passing.
- `lib/platform/entitlements/planCatalog.ts`: extracted the plan catalogue (previously inlined
  only in `scripts/seed-platform-plans.ts`) for the same reason — one definition, two consumers.
- `scripts/seed-platform-demo.ts` / `scripts/reset-platform-demo.ts` (Part 5.4): deterministic
  demo data built by calling the same real functions the admin UI calls
  (`createOrganization`, `assignPlan`, `changeOrganizationStatus`, `rollupAiUsageForDay`) rather
  than inserting fixture documents directly — 5 organisations spanning every status/type/plan
  combination the QA document exercises, plus a bootstrap `GLOBAL_SUPER_ADMIN`. Reset removes only
  `demo-`-prefixed data; the audit log is deliberately left untouched (append-only by design).
- `docs/admin/GLOBAL_ADMIN_Test.md` (Part 5.3): the full QA document for a non-technical tester —
  10 feature areas, numbered test-case tables with exact steps/expected results/how-to-check,
  must-not-happen sections, known limits, and a closing SELFRUN log recording that every case was
  executed (via UI-equivalent HTTP steps or a cited automated test).
- `docs/admin/verification/PART-5.2-CHECKLIST.md`: a consolidated pass over the brief's own
  Part 5.2 checklist, one line per item pointing at the actual proof rather than re-asserting it,
  including one honestly-flagged gap (pagination proven server-side but not empirically
  load-tested at 10,000 organisations in this sandbox).

**Two pre-existing scripts refactored (no behaviour change)**: `scripts/seed-platform-roles.ts`
and `scripts/seed-platform-plans.ts` now import from the two new shared modules above instead of
carrying their own inline copies — confirmed via diff to be pure extraction, byte-identical
resulting seed data.

**Full regression verification, this phase's own exit gate**:
- Production build (`npm run build:local`, `NODE_ENV=production`): **0 compile errors**, all 531
  routes processed, 448 API routes + 252 pages present in the final manifest, including all 36
  `/platform/*` routes compiling and generating cleanly.
- Tenant-route canary over real HTTP against that production build: root, `/finance`,
  `/sales/orders`, `/hr`, `/crm` unauthenticated → 307 (unchanged); tenant API unauthenticated →
  401 (unchanged); `/api/debug/*` → 404 (still permanently blocked, per `CLAUDE.md` #5); new
  `/platform` surface: unauthenticated → 307 to `/platform/login`, login page itself → 200,
  unauthenticated `/api/platform/organizations` → 401. Zero regression in existing behaviour,
  correct gating on new behaviour.
- Full suite (`npx vitest run --maxWorkers=3`): **3 failed | 179 passed** files (182 total; same 3
  pre-existing `ai07AccrualIntelligence`/`ai21StatementIntelligenceEdgeCases`/
  `ai29ControlMonitoringEdgeCases` failures already on record since `OPEN_QUESTIONS.md` #5,
  confirmed still deterministic and still unrelated to this brief's scope). One run during this
  phase additionally showed `tests/accounting/customerPaymentPosting.test.ts` and
  `tests/accounting/salesInvoicePosting.test.ts` (neither touched by this branch) failing —
  diagnosed, not assumed: both hardcode their own `mongoose.connect()` target database and had a
  stale, un-dropped leftover from an earlier abruptly-terminated run in this same session (their
  own `afterAll`'s `dropDatabase()` never got to run). Dropping the two stale databases and
  re-running both in isolation gave a clean 16/16 pass; a subsequent full-suite run came back at
  the expected `3 failed | 179 passed` with no trace of either file. Recorded as an environment
  artifact from this session's own process management, same category as the Phase 7 `mongod`
  crash, not a code regression.
- `npx tsc --noEmit`: clean (exit 0).
- `npx eslint .`: 2 errors + 7 warnings, all in files this branch never touched (`app/admin/
  activity-logs/page.tsx`, three `app/crm/**/page.tsx` files, `app/finance/accounting/vouchers/
  page.tsx`, and two `tests/ai/aiRuntime/*.test.ts` files — confirmed via `git diff --stat
  main...global/admin` returning empty for every one of them). Zero new lint issues introduced by
  this branch's ~127 touched files.

**Verification record**: `docs/admin/verification/PART-5.2-CHECKLIST.md`.

**Could not do / deferred**: nothing new — Phase 8's own scope was hardening and handover of what
Phases 0–7 already built, not new product surface. The one honestly-recorded gap
(10,000-organisation pagination load test) is carried in the Part 5.2 checklist above rather than
silently assumed to be fine.

**Commit**: local only, branch `global/admin`, no push. This is the final phase in the brief's
own 8-phase build order — all phases now complete.

---

## Phase 9 — Coverage audit, integration hardening, pre-QA (2026-09-12, spans 3 addenda)

**Trigger**: `docs/admin/BRIEF-PHASE-9-COVERAGE.md` — "all 8 phases complete" is not the same as
"every requirement in the CTO's document is implemented." A structured coverage audit against the
source specification, plus integration seam proofs, before anything reaches the test team.

**A process gap found and closed**: the original CTO specification (`docs/admin/SOURCE-SPEC.md`)
was never actually committed to this repo despite being named as its destination on day one — the
coverage matrix was built from quoted fragments across nine phases until Addendum B supplied the
full text. Closed permanently: every brief from here on is committed before work starts on it (all
of `BRIEF-PHASE-9-COVERAGE.md`, `BRIEF-PHASE-9a/9b/9c-ADDENDUM.md`, and `SOURCE-SPEC.md` are now in
git history).

**A commit-hygiene gap found and closed** (Addendum C Part 0.1): a file written for Group A's
plan-impact-count feature was tested but never staged in that commit — meaning a fresh checkout of
that commit would not have built. Two checks now run at every phase gate: `git status --porcelain`
must be empty before reporting a phase complete, and a fresh `git worktree` checkout is built and
tested independently (not just the working directory) before that report. First run of both,
recorded below, at commit `61b1f28`.

**A documentation-accuracy audit** (Addendum C Part 0.2, prompted by the `docIntel` finding in
Group B — a documented gap whose *stated reason* was wrong, which is worse than an undocumented gap
because it stops anyone looking again): checked every DECLARED_NOT_POSSIBLE claim in
`COVERAGE_MATRIX.md` against the code directly rather than trusting the prior phase's wording. 2 of
4 held exactly; 1 (payment failure) held in conclusion but was imprecisely worded (a real gateway
integration exists, deliberately stubbed); 1 (mass data export) was wrong — a real export feature
exists (`lib/crm/exportEngine.ts`), reclassified from impossible to missing.

**Work across the phase** (full detail in `docs/admin/COVERAGE_MATRIX.md` and its own per-addendum
update sections, and `docs/admin/verification/tier-entitlement-bridge.md`,
`docs/admin/verification/INTEGRATION.md`):
- The tier/entitlement bridge: `moduleGate` (covering ~346/448 API routes) now resolves through
  `resolveEntitlements()` for any tenant with an explicit `OrganizationEntitlement` row, built
  non-breaking by construction (an untouched tenant never calls the resolver at all). Found and
  fixed a real, pre-existing mismatch between the Phase 3a Plan catalogue and the legacy
  `tiers.ts` definitions in the process — corrected the catalogue to match byte-for-byte, which
  incidentally fixed a latent bug (a STARTER tenant would have been wrongly blocked from the
  "inventory" module on any route wired to `enforce.ts`).
- §8/§11: plan management UI (create/edit a plan's configuration, with an org-impact count and
  explicit confirmation before saving) and a custom-override editor on the Subscription tab.
  `PLAN_KEY` stays a fixed enum — "custom plan" is satisfied by `CUSTOM` + overrides, not free-form
  plan-key creation.
- §15/§16: AI limit and overage editor, gated `MANAGE_AI_LIMITS` (`AI_ADMIN`+`GLOBAL_SUPER_ADMIN`
  only — a `GLOBAL_ADMIN`-refused test is the live proof the corrected §30 matrix is enforced).
- §13: all 13 named AI dashboard metrics now present (added all-time requests, combined tokens,
  and Top Models — a genuinely separate metric from Top Features that was entirely absent).
- §14: found and fixed a real bug — `lib/docIntel/` always called the real AI chokepoint (an
  earlier project doc claimed otherwise) but never tagged its `feature`, so usage was silently
  miscounted under AI Assistant instead of Document Processing.
- §5: Tax Jurisdiction and at-creation plan selection, both closed — the latter through the same
  tested `assignPlan()` path, with a `planAssignmentPending` flag (never a silent half-state) if
  the attempt fails.
- §20: recorded as two separate, correctly-distinguished axes — the platform audit-category filter
  (real) and the spec's literal tenant-module-name axis (verified not possible — `ActivityLog` has
  no structured module field, and inferring one from free text would be exactly the prose-guessing
  heuristic this project has declined everywhere else).
- §28: 4 new alert conditions (failed logins, large downgrades, repeated permission failures, AI
  cost spikes), sharing one configurable-threshold model and one dedupe mechanism. Building
  "repeated permission failures" surfaced that the assumed data source didn't fully exist —
  `requireCapability()` now audits every capability denial platform-wide (`CAPABILITY_DENIED`), not
  only the cross-tenant gateway's own denials, making the claim true rather than approximated.
- **A live production concern found and flagged, not fixed**: `git log` on `vercel.json` shows a
  commit titled "Cron is removed" (2026-09-05, predating this project) that deregistered 8
  pre-existing tenant-facing cron jobs (CRM automations, contract/SLA checks, sales reminders,
  subscription billing, business-health, both AI-runtime jobs). The route handlers still exist;
  only their schedules were removed. Out of this phase's mandate to restore — flagged for the
  user's direct attention in `docs/admin/verification/INTEGRATION.md`, since if this file is what's
  deployed, real scheduled work has silently not run since that date.

**Verification**: full platform+saas+internal+inventory+docIntel suite — 734 tests passing in the
working tree AND independently in a fresh `git worktree` checkout of commit `61b1f28` (Part 0.1's
new standing check; a symlinked `node_modules` and copied `.env` were used since dependencies
themselves haven't changed — the check proves the committed *source* builds and passes, not that
`npm install` works, which is unrelated to this session's own commit-hygiene finding).
`noStaticData.test.ts` clean. `tsc --noEmit` clean in both locations. `eslint` clean on every
touched file.

**Still outstanding** (carried across all three addenda, release gates, not build work): the 3
pre-existing AI-runtime test failures (diagnosis + fix, separately reported); the full targeted UI
regression scan (never yet run in this project); the remaining Part 3.2 integration seam proofs
(one seam — the `vercel.json` finding above — already done); the browser-driven SELFRUN pass over
the full QA document. Groups C (§3/§7/§24/§18 surfaces) and D (§25/§31 security/logs) of the build
plan are also still outstanding.

**Commit**: local only, branch `global/admin`, no push. Commits `b4e0e5f`, `1c0cc61`, `6f3205c`,
`bd320ce`, `d241f87`, `2968000`, `61b1f28` (Phase 9 spans multiple commits across the 8-phase
brief's original single-phase-per-commit convention, since Phase 9 itself was scoped by the CTO's
own addenda into named Parts/Groups rather than a single unit — each Part/Group is its own commit,
matching the spirit of the convention at a finer grain).
