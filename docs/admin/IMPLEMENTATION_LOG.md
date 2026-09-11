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

**Could not do / deferred**: Phase 3b (enforcement on tenant-facing routes) is deliberately not
started — the brief itself splits this out as "the single most dangerous change in this project."
No UI exists yet to configure a `Plan`'s own features (only to view the catalogue and assign a
plan to an org) — not required by this phase's exit gate, which only asks for a working resolver
and non-destructive assignment.

**Commit**: local only, branch `global/admin`, no push.
