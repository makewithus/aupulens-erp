# SYSTEM_INVENTORY_DELTA.md — Phase 0 discovery for the Global Admin Control Plane

> Produced 2026-09-09, branch `global/admin` (branched from `main`, 0 commits ahead at the time
> this was written). `docs/ai/SYSTEM_INVENTORY.md`, `GLOSSARY.md`, `DECISIONS.md` (from the prior
> AI-workflows project) are still accurate for the tenant data plane and are not repeated here —
> this file only adds what `BRIEF-GLOBAL-ADMIN.md` needs that the prior inventory didn't cover, and
> corrects a few things the brief itself assumed. Every claim below is grounded in a file path
> checked directly in this session (agent investigation + direct verification).

---

## 0. Corrections to the brief's own assumptions (per Part 6 — report these early)

1. **`docs/ai/audits/TIME_AUDIT.md` does not exist.** The brief cites it for UTC/timezone handling
   guidance. No file by that name or similar exists anywhere in the repo (`find . -iname
   "*time_audit*"` → zero hits). There is no dedicated time-audit document to read. Timestamp
   conventions must be inferred from the general `{ timestamps: true }` Mongoose convention and
   spot-checking date-handling code as Phase 4+ needs it.
2. **`docs/ai/AI_Workflow_Test.md` does not exist.** The brief asks the new
   `docs/admin/GLOBAL_ADMIN_Test.md` to match its shape. The closest real analogue is
   `docs/ai/PRODUCT_TEST.md` — use that as the shape reference in Phase 8 instead.
3. **`BASELINE_FAILURES.md` lives at `docs/ai/BASELINE_FAILURES.md`**, not at the repo root as the
   brief's routing table implies.
4. **`docs/ai/CONVENTIONS.md` does not exist** — the real file is `docs/_context/CONVENTIONS.md`
   (304 lines). Used for this delta.
5. **The recorded "0 known failures" baseline in `docs/ai/BASELINE_FAILURES.md` (dated
   2026-09-03) no longer holds on this branch.** See §5 below — a fresh run on `global/admin`
   found 5 new, fully deterministic (non-flaky) test failures across 3 files, unrelated to
   anything in scope for this brief. Recorded as the real current baseline, not fixed (Hard
   Rule 1/scope).
6. **`master-admin` is not vestigial and not a "partial ancestor."** It is a fully live,
   deeply-wired, tenant-resident super-admin role that already implements a meaningful slice of
   what source-doc §25 wants — tenant-isolation bypass, full RBAC bypass, its own portal. This is
   the single most important finding of Phase 0 and materially affects the Phase 1 admin-identity
   design. Full writeup in §1 and `OPEN_QUESTIONS.md` #1.
7. **`artifacts/api-surface.txt` / `artifacts/routes.txt` were stale** (412/239, recorded
   2026-08-31–09-03) — current tree has 424 API routes and 240 pages. Both files have been
   refreshed in this session to the current tree so they're a true zero-point baseline for this
   brief's own regression diffing going forward.

---

## 1. `master-admin` — full investigation (brief Part 2.2, "first task in Phase 1")

**What it is today**: a `role` enum value on `models/auth/User.ts` (`admin | finance | hr | sales
| inventory | project | manufacturing | master-admin`). A `master-admin` user is a normal `User`
document, typically with `tenantId: "default-tenant"`, that logs in through the *same* NextAuth
credentials provider as every tenant user, distinguished only by a portal-string match in
`auth.ts` (`portal.includes("/auth/master")` → looks up `User.findOne({ email, role:
"master-admin" })` instead of scoping by `tenantId`).

**What it already does** (all confirmed by direct file read, see agent report above for exact
quotes):
- `middleware.ts` exempts it from the tenant-mismatch check entirely (`user.role !== "master-admin"`
  guards the 403/redirect branch) — it can act across tenants at the request layer.
- `middleware.ts` gates `/master-admin/:path*` and `/api/master-admin/:path*` to require exactly
  this role, and forces a redirect to `/` if a subdomain (`tenantId`) is present — the portal is
  main-domain-only, matching the "control plane sits above tenants" model this brief wants.
- `lib/org/rbac.ts`'s `ORG_ADMIN_ROLES` and `lib/crm/rbac.ts`'s admin bypass both treat it as
  full-access, in every tenant.
- `lib/middleware/moduleGate.ts` bypasses subscription-tier/module gating entirely for this role.
- `app/api/master-admin/tenants/**` already implements: list tenants, create a tenant (see §2),
  check subdomain availability — a real, working, minimal tenant-management API.
- It has its own sidebar (`config/sidebar/master-admin.ts`) and portal shell, but the sidebar is a
  visibly incomplete stub — imports `Users`, `Building2`, `Globe`, `Activity`, `Shield`, `Settings`
  icons and never uses any of them; only one nav item exists (`/master-admin` dashboard).
- No seed script creates a `master-admin` user — provisioning one today is a manual DB write.
- It is exercised by real tests: `tests/auth/requireAdmin.test.ts`, `tests/crm/rbac.test.ts`,
  `tests/ai/aiRuntime/rbacRouter.test.ts`, `tests/saas/moduleGate.test.ts` (which explicitly
  asserts `"/master-admin/* is always ungated"` and `"master-admin bypasses module gate on any
  path"`).

**What it is not**: it has no MFA, no elevated-session model, no audit trail beyond whatever
`ActivityLog` free-text entries happen to get written, no time-boxing, no approval workflow, no
role granularity (it's a single all-or-nothing role, not the seven-role matrix in source-doc §25),
and it is stored in the *same* `User` collection and cookie/session domain as every tenant user —
exactly the architecture Hard Rule 3 and source-doc §33 forbid for the new Global Admin identity.

**Decision needed, recorded in `OPEN_QUESTIONS.md` #1** (per the brief's own instruction not to
silently change its behavior): does `master-admin` (a) stay exactly as-is, untouched, as a
tenant-level "god mode" role that existing code depends on, while the new `AdminUser`/`AdminSession`
domain is built entirely alongside it with zero interaction; or (b) get formally deprecated in
favor of the new domain once Phase 1 ships (a larger, riskier migration, out of scope for this
brief's additive mandate)? **This brief proceeds with (a)** — `master-admin` is left completely
untouched (Hard Rule 1 forbids changing it anyway), and the new platform control plane is built as
a fully separate, parallel system per Part 2.2. The existing `/master-admin` portal and its API
routes are not touched, not extended, and not used as a foundation for anything in this brief.

---

## 2. Organization creation — three existing, divergent paths

No single canonical "create a tenant" function exists. Three real code paths call
`Organization.create(...)`, each with different side effects:

| Path | Who can call it | Seeds Chart of Accounts? | Records `SubscriptionEvent`? | Sets `settings{}`? |
|---|---|---|---|---|
| `app/api/master-admin/tenants/route.ts` POST | `master-admin` only | No | No | No (defaults only) |
| `app/api/auth/register/route.ts` POST | Public self-service signup | Yes (best-effort, try/catch) | Yes (`CREATED`) | Yes (country/timezone/currency/GST) |
| `app/api/auth/org/create/route.ts` POST | Any authenticated user (add another org) | No | Yes (`CREATED`) | No (defaults only) |

**Implication for Phase 2** (§5, "reuse the existing onboarding path if one exists"): there isn't
one single path to reuse — the public self-service flow (B) is the most complete (COA seeding +
settings + subscription event) and is the best template to follow for Global-Admin-initiated
tenant creation, but Global Admin's own creation flow must be written fresh inside
`app/api/platform/**` calling the same underlying seeding utilities (`lib/accounting/coa-seeder`,
`lib/accounting/coa-feature-seeder`, `appendSubscriptionEvent`) directly — not by calling the
public registration route itself, since that route is unauthenticated-by-design and not an
admin-actor-aware entry point. This does not consolidate the three existing paths (out of scope,
Hard Rule 1) — it adds a fourth, admin-actor-aware, audited one.

---

## 3. Existing platform-billing surface (thinner than the brief assumes, but not absent)

There is **no** `Plan`, `ApiKey`, or platform-level `Invoice`/payment-gateway model. But
`Organization` already carries a thin plan-like surface directly on its own schema:
`tier` (enum, default `starter`), `maxUsers` (default 5), `aiCallsPerMonth` (default 100),
`subscriptionStatus` (enum, default `TRIAL`), `trialEndDate`. Tier *limits* (what each tier
actually grants) are hardcoded in `lib/constants/tiers.ts`, read via `getTierLimits(tier)` from
`lib/ai/tenantAi.ts` and elsewhere — this is exactly the "if (plan === 'PRO')"-shaped hardcoding
Hard Rule 6 forbids extending further, and existing code already exhibits the anti-pattern the
brief warns against (pre-existing, not this brief's to fix, but the new `Plan`/`PlanFeature`
model in Phase 3a must supersede reading `lib/constants/tiers.ts` for anything the control plane
touches, without breaking the existing tenant-facing reads of it).

`models/admin/SubscriptionEvent.ts` is a real, append-only (no update/delete routes exist for it),
tenant-scoped event log: `{tenantId, type, tier, amount, currency, occurredAt, externalEventId?,
meta?}`, deduped on `{tenantId, externalEventId}` when present. Only `created`/`upgraded`/
`downgraded` event types are ever actually written today (from the three creation paths above, and
from a manual master-admin tier-change action) — no `payment_succeeded`/`payment_failed`/`renewed`
event fires anywhere, because **no payment gateway is wired in for platform billing** (Razorpay/
Stripe integration exists only for tenant-internal sales in `lib/sales/paymentGateway.ts`, and is
explicitly commented as future work there). This confirms source-doc §24's MRR/ARR requirement:
**MRR/ARR cannot be derived from real data today** — there is no price actually charged anywhere
in the platform-billing sense, only a `tier` label. Recorded in `OPEN_QUESTIONS.md` #4 per Part
4.5's explicit instruction to flag this rather than fabricate a number.

`models/sales/Subscription.ts` is unrelated — it is a **tenant's own customer's** recurring-billing
record (created from Sales quotes), not the tenant's subscription to Aupulens itself. Do not
confuse the two when building the AI-metering or billing-dashboard pieces.

---

## 4. Logging — confirms and sharpens the prior inventory

`models/admin/ActivityLog.ts` is confirmed free-text (`activity: string`, `details?: string`, no
enum, no structured entity/action-type field) and has no immutability guard. Its **only** writer
in the entire codebase is `lib/logger.ts::logActivity()` — every other file that touches
`ActivityLog` only reads it. This means: the new `PlatformAuditLog` does not need to worry about
`ActivityLog` gaining new uncontrolled writers; it is a small, single-choke-point model to leave
alone and build beside.

`models/crm/CrmAuditLog.ts` is a materially better precedent than `ActivityLog` for the new
`PlatformAuditLog`'s shape: it already has an **enum-constrained `action` field** (not free text)
and **real immutability guards** (`pre("updateOne")`, `pre("findOneAndUpdate")`, `pre("deleteOne")`,
`pre("findOneAndDelete")`, `pre("deleteMany")` all throw). `PlatformAuditLog`'s append-only
enforcement (Hard Rule 6 test requirement) should copy this exact Mongoose middleware pattern,
not invent a new one.

---

## 5. Test/build baseline — current, as of this branch (2026-09-09)

Superseding `docs/ai/BASELINE_FAILURES.md`'s "0 known failures" for the purposes of this brief's
own regression comparisons going forward:

```
npm test (constrained: npx vitest run --maxWorkers=3 — full default-parallelism run produces
42 spurious connection-timeout failures from mongod contention on this shared machine, exactly
the resource-contention issue BASELINE_FAILURES.md documented previously; --maxWorkers=3 is the
same mitigation that document already recommended)

Test Files  3 failed | 156 passed (159)
     Tests  5 failed | 1353 passed (1358)
```

The 3 failing files/5 failing tests are **fully deterministic** — reproduced identically 3 times,
including a fully sequential (`--maxWorkers=1`) run of just those 3 files in isolation. This rules
out flakiness/contention as the cause; it is a real, pre-existing defect that appeared on `main`
sometime after 2026-09-03 (when `docs/ai/BASELINE_FAILURES.md` last recorded 0 failures) and
before this branch was cut:

- `tests/ai/aiRuntime/ai07AccrualIntelligence.test.ts` — "accuracy tracking: a matching bill
  updates the learning store with the delta"
- `tests/ai/aiRuntime/ai21StatementIntelligenceEdgeCases.test.ts` — "adversarial: balance sheet
  balances in total... while a material control line is unsupported underneath"
- `tests/ai/aiRuntime/ai29ControlMonitoringEdgeCases.test.ts` — 3 failures: concurrent duplicate
  dispatch idempotency, 10k-journal-entry volume test, kill-switch-off write-suppression test

**None of these files are anywhere near this brief's scope** (AI accrual/statement/control-
monitoring workflow logic, not admin/platform code) — not touched, not fixed here, per Hard Rule
1 and the brief's own "not yours to fix" framing for `BASELINE_FAILURES.md`. Recorded in
`OPEN_QUESTIONS.md` #5 as a real product issue for the human to triage, same treatment as the
four pre-existing broken UI routes.

`npx tsc --noEmit`: **clean, exit 0.**

Eslint: not re-run repo-wide this session (the existing `docs/ai/BASELINE_FAILURES.md`'s
~18,819-problem count, dominated by one generated file, remains the reference point per its own
"standing rule" — lint only files this brief actually touches, each phase).

**Comparison rule for this brief, going forward**: `Test Files 3 failed | 156 passed (159)` /
`Tests 5 failed | 1353 passed (1358)` (run via `--maxWorkers=3`, or fewer, on this machine) is the
zero-point. A regression is: any of the 156 currently-passing files starts failing, any new admin
test fails, or the known 5 failures change in identity or grow in count.

---

## 6. UI baseline

Not re-run as a full 239→240-route production-build sweep this session (that sweep is
expensive on this shared machine per `docs/ai/UI_REGRESSION.md`'s own findings, and Phase 0 has
no UI diff to check yet — there is no admin UI code written). The four pre-existing broken routes
recorded in `docs/ai/BASELINE_FAILURES.md` (`/finance/returns`, `/hr/attendance`, `/hr/leave`,
`/sales/invoices/new`) are carried forward as the standing baseline; Phase 1 will run a real
targeted scan once `app/platform/**` exists to scan, following `docs/ai/UI_REGRESSION.md`'s
methodology exactly (targeted route list = new platform routes + a fixed 20-route canary).

---

## 7. NextAuth / session architecture — implication for Phase 1

`session.user`/JWT shape is defined via module augmentation directly in `auth.ts`/`auth.config.ts`
(`id, role, tenantId, permissions?`), read directly (not through an abstraction) by every
tenant-facing route and by `middleware.ts`. There is no seam to inject a platform-admin identity
into this shape without polluting every tenant session's type and risking every existing
`session.user.role`/`.tenantId` read path. Confirms Part 2.2's requirement exactly: `AdminUser`/
`AdminSession` must be a **fully separate NextAuth instance** (its own `handlers`/`signIn`/
`signOut`/`auth` export, own JWT secret, own cookie name) — not an extension of the existing
`auth.ts`. This is a new file, e.g. `lib/platform/auth/adminAuth.ts`, never imported by any
tenant-facing route, enforced by the same source-grep technique Part 2.3 mandates for the
cross-tenant gateway.
