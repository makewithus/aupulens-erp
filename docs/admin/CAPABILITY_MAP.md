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

## Phase 2 — Organisation management

| Capability | Status | Evidence |
|---|---|---|
| Organisation list w/ server-side pagination/filter | **MISSING** as an admin UI. `app/api/master-admin/tenants/route.ts` GET lists tenants today but is tenant-count-small and not built for the §3 column set (AI usage %, last-meaningful-activity, etc.) — new admin API needed. |
| Organisation status model (`INVITED..ARCHIVED`) | **MISSING.** `Organization.subscriptionStatus` (TRIAL/ACTIVE/etc., see `lib/constants/tiers.ts`-adjacent enum) and `isActive: boolean` exist but do not match source-doc §3's status set or have transition tracking. New enum + transitions in `lib/constants/statuses.ts`, additive alongside the existing fields — do not repurpose `subscriptionStatus`, it means something narrower (billing state) and existing code reads it. |
| Suspension that actually blocks something | **MISSING.** `Organization.isActive` is read at login (`auth.ts`'s `authorize()` rejects if `!org.isActive`) — this is a real, working enforcement point already, but it's binary (active/not) and doesn't match the richer status model. New admin-driven suspension must decide whether it maps onto `isActive` (reuses working enforcement, but loses granularity) or needs its own enforcement point — flagged for the Phase 2 plan, not decided here. |
| Organisation types (`SME`, `Enterprise`, etc.) | **MISSING.** No `OrganizationType` model or field. |
| Create organisation (admin-initiated) | **PARTIAL.** Three existing divergent paths (`SYSTEM_INVENTORY_DELTA.md` §2) are a real precedent for what steps a creation flow needs (COA seeding, `appendSubscriptionEvent`, settings shape) but none is the admin-actor-aware, audited flow this phase needs — a new one, calling the same underlying seeders. |
| Organisation detail panel (§7 tabs) | **MISSING.** No such UI exists in `app/master-admin/**` today (single dashboard page only). |

## Phase 3a/3b — Plans, entitlements

| Capability | Status | Evidence |
|---|---|---|
| `Plan`/`PlanFeature` models | **MISSING.** Only `Organization.tier` (enum label) + hardcoded `lib/constants/tiers.ts` limits exist — no configurable plan record. |
| `OrganizationSubscription`/`OrganizationEntitlement` | **MISSING.** |
| Entitlement resolver | **MISSING.** No `resolveEntitlements()`-shaped function anywhere; `getTierLimits(tier)` in `tenantAi.ts` is the closest analogue and is exactly the hardcoded-by-tier pattern Hard Rule 6 says the new resolver must not perpetuate for anything the control plane touches. |
| Plan assignment history | **MISSING** as its own record, but `models/admin/SubscriptionEvent.ts` (append-only, `{tenantId, type, tier, occurredAt, meta}`) is a real, working precedent for exactly this shape — `upgraded`/`downgraded` events already fire from the one existing manual master-admin tier-change action. Strongly consider extending this model (additively) rather than building a parallel history table. |
| Entitlement enforcement on tenant routes | **MISSING** (Phase 3b, deliberately deferred per the brief). |

## Phase 4 — AI metering

| Capability | Status | Evidence |
|---|---|---|
| Per-request AI usage records (tokens/model/latency/cost) | **MISSING.** `models/admin/AiUsage.ts` is a coarse `{tenantId, period, count}` monthly counter only — success-only, no token/cost/latency/model detail. |
| Single instrumentation point to extend | **EXISTS.** `lib/ai/tenantAi.ts::callClaudeForTenant()` (and its streaming counterpart) is the one real chokepoint every tenant-facing AI call already goes through — confirmed kill-switch + monthly-cap enforcement lives here today. New `AiUsageRecord` writes are additive calls at the end of this function (after `incrementAiUsage`/`incrementGlobalAiUsage`), never a parallel instrumentation path. |
| Rollups (`AiUsageDaily`/`AiUsageMonthly`) | **MISSING.** |
| Cost rates (`AiCostRate`) | **MISSING.** No cost-per-token concept anywhere; `lib/ai/featureLimits.ts` only caps `max_tokens` per feature, never computes a currency cost. |
| Per-org AI limits + 4 at-limit behaviors | **PARTIAL.** `tenantAi.ts` already has `AI_LIMIT_REACHED`/`AI_GLOBAL_LIMIT_REACHED` — currently only implements `BLOCK`. The other 3 behaviors (`THROTTLE`/`ALLOW_WITH_OVERAGE`/`ALLOW_AND_LOG`) are new branches inside the existing check, gated by a new per-org config field, `BLOCK` remaining the default so no existing tenant's behavior changes. |
| AI workflow-run metering (automation usage) | **PARTIAL — real, rich data already exists**, just not yet aggregated as "usage." `models/ai/AiWorkflowRun.ts` (per-run: `tenantId, workflowId, metrics{scanned,matched,exceptions,autoActioned,policy_overrides}, startedAt, finishedAt`) and `models/ai/AiDecisionTrace.ts` (per-run reasoning/tool-call detail) are written today by the AI runtime's 10-stage executor for every real workflow run. The Phase 4 rollup job should read these directly for the "AI Automation"/"AI Agents" feature buckets in source-doc §14, not invent a second recording mechanism. |
| Feature-bucket mapping (chat vs. document processing vs. automation vs. reports vs. agents) | **MISSING** as an explicit mapping — must be authored in Phase 4 and recorded in `docs/admin/AI_FEATURE_MAP.md` per the brief's own instruction, based on which call sites use which `AiFeature` key in `lib/ai/featureLimits.ts` plus which `AiWorkflowRun.workflowId`s exist. |

## Phase 5 — Logging, audit, retention

| Capability | Status | Evidence |
|---|---|---|
| `PlatformAuditLog` (§31 shape) | **MISSING** — see Phase 1 row above (same model, listed here too since §5's scope references it directly). |
| Event taxonomy | **MISSING** (see Phase 1 row). |
| Org-type log profiles | **MISSING** — depends on `OrganizationType` (Phase 2) existing first. |
| Retention policy + job | **MISSING.** No retention/TTL-by-policy concept exists for any log model today (Mongoose TTL indexes exist elsewhere in the codebase for narrow cases like `AiActionProposal.expiresAt`, but nothing configurable per org-type/event-type/compliance-requirement). |

## Phase 6 — Dashboard, search, alerts, API monitoring

| Capability | Status | Evidence |
|---|---|---|
| Platform KPI dashboard | **MISSING.** `app/master-admin/page.tsx` exists as a shell but (per the incomplete sidebar stub) has no built-out KPI surface confirmed in this session — needs a direct read in Phase 6's own discovery step before assuming it's empty vs. partially built. |
| MRR/ARR | **NOT COMPUTABLE from real data today** — no payment-gateway-backed revenue event exists anywhere in the platform-billing sense (see `SYSTEM_INVENTORY_DELTA.md` §3). Must render as an honest "unavailable" tile per source-doc §24 + Hard Rule 3, not a fabricated number. Recorded in `OPEN_QUESTIONS.md` #4. |
| Global search across control-plane entity types | **MISSING.** `lib/search/universalSearch.ts` exists for tenant-scoped search (treats `master-admin` as full-visibility) but is not a cross-tenant control-plane search — a new implementation behind the cross-tenant gateway is needed, not an extension of this file. |
| Alerts (in-app/email/webhook) | **MISSING** for platform-level alerting. Tenant-level `models/crm/Notification.ts` and the inbound `lib/integrations/` webhook gateway are unrelated, wrong-direction precedents (inbound only, per `SYSTEM_INVENTORY.md`'s "message bus" finding — no outbound internal event/notify mechanism exists in this codebase at all, confirmed by the prior project's exhaustive grep). This is new infrastructure, matching the "new stored outbox + cron sweep" verdict the prior project already reached for the AI runtime's own event bus — the same pattern applies here. |
| `ApiKey`/`ApiUsage` (external API monitoring) | **MISSING entirely — no external API exists yet.** No API-key model, no external-facing API surface distinct from the browser-session-authenticated `/api/**` routes found anywhere. Per source-doc §29's own fallback instruction: build the models and monitoring UI with honest empty states, record as pending in `OPEN_QUESTIONS.md`, do not fabricate traffic. |

## Phase 7 — Impersonation / organisation access

| Capability | Status | Evidence |
|---|---|---|
| `AdminAccessRequest` (reason → approval → time-boxed session) | **MISSING.** `master-admin`'s tenant-mismatch bypass in `middleware.ts` is the closest existing analogue and is exactly the "invisible login-as-user" anti-pattern source-doc §26 forbids (Part 7 item 7) — not a foundation to build on, a cautionary example of what not to repeat. |
| Visible elevated-session banner | **MISSING.** No such UI component exists. |

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
