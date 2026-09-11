# CAPABILITY_MAP.md — what exists vs. what must be built, per phase

> Per brief Part 1.1 Step 1: MISSING | PARTIAL | EXISTS, with file paths, so nothing gets rebuilt
> that already exists and nothing gets bolted onto the wrong existing thing. Updated as each
> phase's own discovery step runs; this file is the running source of truth for "am I extending
> or building new."

---

## Phase 1 — Control-plane foundation — ✅ DONE (2026-09-11)

| Capability | Status | Evidence |
|---|---|---|
| Admin identity (`AdminUser`, own collection, no `tenantId`) | **BUILT** | `models/platform/AdminUser.ts` — no `tenantId` field, bcrypt password, MFA fields, fully separate from `master-admin` (left untouched, `OPEN_QUESTIONS.md` #1). |
| Admin session (`AdminSession`, separate from tenant session) | **BUILT** | `models/platform/AdminSession.ts` + `lib/platform/auth/adminSession(Edge).ts` — own cookie (`aupulens_admin_session`), own secret (`ADMIN_SESSION_SECRET`), own claim shape. Hostile-case tested: forged token rejected, revoked-but-unexpired token rejected. |
| MFA | **BUILT** | `lib/platform/auth/totp.ts` (RFC 6238, hand-rolled, no new dependency), mandatory on every account (bootstrap admin is `mfaEnabled:false`, forced through enrollment on first login), backup codes. |
| Admin RBAC (7-role matrix, §30) | **BUILT as data.** `models/platform/AdminRole.ts` + `lib/platform/auth/adminRbac.ts`, seeded by `scripts/seed-platform-roles.ts`. Exact matrix cells are an inferred default — `OPEN_QUESTIONS.md` #6. |
| Cross-tenant read gateway | **BUILT.** `lib/platform/tenancy/crossTenant.ts`, structurally enforced as the only path via `tests/platform/sourceGrep.test.ts`. |
| Structured, immutable audit store | **BUILT.** `models/platform/PlatformAuditLog.ts`, 7 Mongoose guards (including the `.save()` re-save case `CrmAuditLog`'s pattern alone would have missed), single writer `lib/platform/audit/emit.ts`. |
| Event taxonomy enums | **BUILT.** `PLATFORM_EVENT_CATEGORY`/`PLATFORM_EVENT_TYPE`/`PLATFORM_SEVERITY` in `lib/constants/statuses.ts`. |
| Platform shell UI + sidebar | **BUILT.** `app/platform/login/**`, `app/platform/(app)/**`, `components/platform/PlatformShell.tsx`, `config/sidebar/platform.ts`. Not built on `app/master-admin/**` (wrong identity domain, per §2.2) — used only as a layout-shape reference. |
| Elevated/impersonation session model | **MISSING — Phase 7, as planned.** No `AdminAccessRequest`-shaped model or flow exists yet. |

## Phase 2 — Organisation management — ✅ DONE (2026-09-11)

| Capability | Status | Evidence |
|---|---|---|
| Organisation list w/ server-side pagination/filter | **BUILT.** `lib/platform/organizations/list.ts` + `app/api/platform/organizations/route.ts` — `.skip()/.limit()` at the query layer, proven with 30 seeded rows across 2 pages. |
| Organisation status model (`INVITED..ARCHIVED`) | **BUILT.** `ORGANIZATION_STATUS` + transitions in `lib/constants/statuses.ts`, additive `Organization.status` field. |
| Suspension that actually blocks something | **BUILT AND VERIFIED OVER REAL HTTP.** `SUSPENDED` flips the pre-existing `Organization.isActive` (`OPEN_QUESTIONS.md` #2's decision) — manually confirmed a suspended tenant's owner cannot log in (`/auth?error=Configuration`) where an active tenant's owner could. |
| Organisation types (`SME`, `Enterprise`, etc.) | **BUILT.** `models/platform/OrganizationType.ts`, configurable records, seeded via `scripts/seed-platform-org-types.ts`. |
| Create organisation (admin-initiated) | **BUILT — the fourth path.** `lib/platform/organizations/create.ts`, reuses the existing COA seeders + `appendSubscriptionEvent` directly. Verified end-to-end: the created tenant's owner account can actually log in. |
| Organisation detail panel (§7 tabs) | **PARTIAL — 7 of 11 tabs real.** Overview, Users, Subscription, Activity, Audit Logs are real data through the gateway; AI Usage and Billing are honest empty states (Phase 4/6); Modules/Configuration/Security have no dedicated tab yet (Modules visible via Overview's `enabledModules`). |

## Phase 3a — Plans, entitlements, resolver — ✅ DONE (2026-09-11) / Phase 3b — enforcement — deferred

| Capability | Status | Evidence |
|---|---|---|
| `Plan`/`PlanFeature` models | **BUILT.** `models/platform/Plan.ts`, 7 plans seeded via `scripts/seed-platform-plans.ts`. |
| `OrganizationEntitlement` | **BUILT.** `models/platform/OrganizationEntitlement.ts` — assignment record + override layer, one document per tenant. |
| Entitlement resolver | **BUILT.** `lib/platform/entitlements/resolve.ts::resolveEntitlements()` — permissive-on-error (audited at `SECURITY` severity), tier-fallback bridge for pre-existing tenants, override layering proven correct. |
| Plan assignment history | **BUILT — extended the existing precedent, not a parallel table**, exactly as anticipated: `SubscriptionEvent.type: "plan_assigned"` (additive), via `lib/platform/entitlements/assignPlan.ts`. |
| Entitlement enforcement on tenant routes | **PARTIAL BY DESIGN — Phase 3b done, 1 of 424 routes wired.** `lib/platform/entitlements/enforce.ts` built and proven on `app/api/inventory/orders/route.ts` POST (pre-existing test file extended, 0 regressions). The other 423 are explicitly tracked as not-yet-enforced in `OPEN_QUESTIONS.md` #8, with the exact repeatable pattern documented — never a silent gap. |

## Phase 4 — AI metering — ✅ DONE (2026-09-11)

| Capability | Status | Evidence |
|---|---|---|
| Per-request AI usage records (tokens/model/latency/cost) | **BUILT.** `models/platform/AiUsageRecord.ts`. Required fixing a real gap first: `lib/ai/claude.ts::callClaude()` discarded Azure OpenAI's `usage` object — new additive `*WithUsage` sibling functions capture it. |
| Single instrumentation point to extend | **USED, as anticipated.** `lib/ai/tenantAi.ts::callClaudeForTenant()`/`callClaudeForTenantStream()` now call `recordAiUsage()` on both success and error paths. |
| Rollups (`AiUsageDaily`/`AiUsageMonthly`) | **BUILT.** `lib/platform/ai/rollup.ts`, idempotent, cron-driven (`app/api/cron/platform/ai-usage-rollup`). |
| Cost rates (`AiCostRate`) | **BUILT.** Cost computed server-side only, proven never client-influenced. |
| Per-org AI limits + 4 at-limit behaviors | **BUILT.** `models/platform/AiLimit.ts` + `lib/platform/ai/limitBehavior.ts` — all 4 behaviors implemented; `BLOCK` proven byte-identical to pre-Phase-4 for an unconfigured tenant (all 48 tests in the two pre-existing tenantAi test files still pass unmodified). |
| AI workflow-run metering (automation usage) | **PARTIAL, as anticipated** — `lib/platform/ai/rollup.ts` folds `AiWorkflowRun` into the `ai_automation` bucket at request-count-only (no per-workflow token/cost data exists to aggregate, reported as honest 0, not estimated). |
| Feature-bucket mapping | **BUILT.** `lib/platform/ai/featureMap.ts` + `docs/admin/AI_FEATURE_MAP.md`, source-grep-checked so an unmapped `AiFeature` key fails a test. |

## Phase 5 — Logging, audit, retention — ✅ DONE (2026-09-11)

| Capability | Status | Evidence |
|---|---|---|
| `PlatformAuditLog` (§31 shape) | **BUILT in Phase 1**, unchanged here. |
| Event taxonomy | **BUILT in Phase 1**, unchanged here. |
| Org-type log profiles | **BUILT.** `OrganizationType.defaultConfig.logProfile.eventCategories`, seeded per type. |
| Retention policy + job | **BUILT.** `models/platform/RetentionPolicy.ts` + `lib/platform/audit/retention.ts`, most-specific-match resolution, self-audited deletion, cron-driven. |

## Phase 6 — Dashboard, search, alerts, API monitoring — ✅ DONE (2026-09-11)

| Capability | Status | Evidence |
|---|---|---|
| Platform KPI dashboard | **BUILT in Phase 1/4**, unchanged here (org count, admin count, audit events, full AI usage summary). |
| MRR/ARR | **Still an honest "unavailable" tile** (`OPEN_QUESTIONS.md` #4) — no platform-billing data exists. |
| Global search across control-plane entity types | **BUILT.** `lib/platform/search/globalSearch.ts`, cross-tenant via the gateway, audited on every call. |
| Alerts (in-app/email/webhook) | **PARTIAL, as anticipated.** `models/platform/PlatformAlert.ts` + `lib/platform/alerts/emit.ts` — in-app delivery real (AI usage threshold crossings, organisation suspension both wired); email/webhook structurally never sent (`OPEN_QUESTIONS.md` #9), source-grep-enforced. |
| `ApiKey`/`ApiUsage` (external API monitoring) | **BUILT, honest empty state confirmed.** No external API exists — models built, monitoring UI shows real zero counts and an honest explanation, never fabricated traffic. |

## Phase 7 — Impersonation / organisation access — ✅ DONE (2026-09-12)

| Capability | Status | Evidence |
|---|---|---|
| `AdminAccessRequest` (reason → approval → time-boxed session) | **BUILT.** `models/platform/AdminAccessRequest.ts` + `lib/platform/access/`, full lifecycle proven (request → approve/deny → active grant → expiry/end), never open-ended (fixed 4h, checked live at read time). `master-admin`'s tenant-mismatch bypass remains untouched, still the cautionary example this was built to avoid repeating. |
| Visible elevated-session banner | **BUILT.** Real banner on the Organisation detail page, backed by `GET /api/platform/organizations/[id]/access-status`. Deliberately not wired as a hard gate on the existing detail tabs — `OPEN_QUESTIONS.md` #10. |

## Phase 8 — Hardening and handover — ✅ DONE (2026-09-12)

| Capability | Status | Evidence |
|---|---|---|
| No-static-data grep test (Hard Rule 3, structurally enforced) | **BUILT.** `tests/platform/noStaticData.test.ts` — walks every `app/platform/**/page.tsx`, fails if a page renders dynamic-looking values without a real `fetch("/api/platform/...")`, and bans hardcoded sample-record arrays / hardcoded MRR-ARR figures. 15 tests, all passing. |
| Full §30 permission-matrix test (every role × every capability) | **BUILT.** `lib/platform/auth/roleMatrix.ts` extracted as the single source of truth (previously inlined in `scripts/seed-platform-roles.ts`); `tests/platform/permissionMatrix.test.ts` generates 168 cases (7 roles × 24 capabilities) directly from it, plus structural guarantee tests (only `GLOBAL_SUPER_ADMIN` holds all 3 destructive capabilities together; `READ_ONLY_ADMIN` has no mutating capability; `IMPERSONATE_WRITE` never reachable by `SUPPORT_ADMIN`/`READ_ONLY_ADMIN`). 179 tests, all passing. |
| Deterministic demo data for manual QA (Part 5.4) | **BUILT.** `scripts/seed-platform-demo.ts` — 5 demo organisations spanning every status/type/plan combination the QA doc exercises, built via the same real functions (`createOrganization`, `assignPlan`, `changeOrganizationStatus`, `rollupAiUsageForDay`) the admin UI itself calls, plus a bootstrap `GLOBAL_SUPER_ADMIN`. `scripts/reset-platform-demo.ts` removes only `demo-`-prefixed data (audit log left untouched, append-only by design). `lib/platform/entitlements/planCatalog.ts` extracted so both this script and `scripts/seed-platform-plans.ts` share one plan definition, never duplicated. |
| QA test document for a non-technical tester (Part 5.3) | **BUILT.** `docs/admin/GLOBAL_ADMIN_Test.md` — 10 feature areas, numbered test-case tables, must-not-happen sections, known limits, and a closing SELFRUN log recording that every case was executed (via UI-equivalent HTTP steps or a cited automated test). |
| Consolidated Part 5.2 checklist | **BUILT.** `docs/admin/verification/PART-5.2-CHECKLIST.md` — one line per mandated check, pointing at the actual test/evidence, with the one honest gap flagged (`[~]`): pagination is proven server-side but not empirically load-tested at 10k organisations in this sandbox. |
| Full-suite regression proof (Hard Rule 10, before/after every commit) | **VERIFIED.** Production build (`npm run build:local`): 0 compile errors, 531/531 routes processed, 448 API routes + 252 pages present in the final route manifest, including all 36 `/platform/*` routes. Full `vitest run --maxWorkers=3`: `3 failed | 179 passed` files (182 total; same 3 pre-existing `ai07`/`ai21`/`ai29` failures on record since `OPEN_QUESTIONS.md` #5, confirmed still unrelated and still deterministic). `tsc --noEmit`: clean. `eslint`: 2 errors + 7 warnings, all in files this branch never touched (confirmed via `git diff --stat main...global/admin`) — zero new lint issues introduced. Tenant-route canary over real HTTP against the production build (root, `/finance`, `/sales/orders`, `/hr`, `/crm` unauthenticated → 307; tenant API unauthenticated → 401; `/api/debug/*` → 404) came back byte-identical to pre-existing expected behaviour. |
| Environment hygiene found and fixed during this phase's own verification | **Documented, not silently worked around.** Two accounting test files (`tests/accounting/customerPaymentPosting.test.ts`, `tests/accounting/salesInvoicePosting.test.ts` — neither touched by this branch) failed on one full-suite run due to a stale, un-dropped database left over from an earlier abruptly-terminated run in this same session; confirmed via manual inspection and a clean isolated re-run after dropping the stale databases. Recorded as an environment artifact, not a code regression — same category as the Phase 7 `mongod` crash. |

---

## Cross-cutting: what's genuinely reusable vs. genuinely new

**Reusable patterns** (follow the shape, don't call the code):
- `lib/org/rbac.ts` / `lib/crm/rbac.ts` — small explicit capability-check module shape, for `lib/platform/auth/adminRbac.ts`.
- `models/crm/CrmAuditLog.ts` — enum action + Mongoose immutability-guard pattern, for `PlatformAuditLog`.
- `config/sidebar/*.ts` shape — for `config/sidebar/platform.ts`.
- `tests/accounting/_helpers/routeTestUtils.ts` + the direct-handler-import test pattern — for all new admin route tests.
- The Vercel-cron pattern (`app/api/cron/<domain>/<name>/route.ts` + `CRON_SECRET` bearer check) — for `app/api/cron/platform/**` rollup/retention jobs.
- `models/admin/SubscriptionEvent.ts` — strong candidate to extend (additively) for plan-assignment history rather than building a parallel model (Phase 3a discovery should confirm this before building new).

**Genuinely reusable data, not just pattern** (call directly, don't re-derive):
- `lib/ai/tenantAi.ts::callClaudeForTenant()` — the metering instrumentation point (Phase 4).
- `models/ai/AiWorkflowRun.ts` / `AiDecisionTrace.ts` — real per-run data for AI-automation usage (Phase 4).
- `lib/accounting/coa-seeder.ts` / `coa-feature-seeder.ts` / `lib/billing/appendSubscriptionEvent.ts` — for admin-initiated org creation (Phase 2).

**Genuinely new — no foundation exists at all, build from scratch**:
- `AdminUser`/`AdminSession`/MFA (Phase 1)
- Cross-tenant gateway (Phase 1)
- `Plan`/`PlanFeature`/entitlement resolver (Phase 3a)
- `AiCostRate`/cost computation (Phase 4)
- `PlatformAlert` + delivery (Phase 6)
- `ApiKey`/`ApiUsage` (Phase 6)
- `AdminAccessRequest`/impersonation session (Phase 7)
