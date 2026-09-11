# Verification — Organisation management (Phase 2)

## How it's triggered
`/platform/organizations` (list), `/platform/organizations/new` (create),
`/platform/organizations/[subdomain]` (detail tabs). API:
`app/api/platform/organizations/**`.

## Happy path proven
- Automated: `organizationList.test.ts` (pagination via `.skip()/.limit()` — not an in-memory
  filter, proven by asserting page 1 and page 2 return disjoint rows over 30 seeded orgs; search
  filter; derived fields — active user count from real `User` documents, last-meaningful-activity
  from real `ActivityLog`/`Organization.updatedAt`, AI usage % from real `AiUsage` rows), `organizationCreate.test.ts`
  (Organization + owner User + seeded Chart of Accounts + `SubscriptionEvent` + audit record, all
  real), `organizationStatus.test.ts` (every documented transition, suspend/reactivate).
- **Manual, over real HTTP** (`curl` against `next dev`, local MongoDB): logged in as a seeded
  `GLOBAL_SUPER_ADMIN`, listed organisations (real, empty-then-populated), created a real
  organisation via the API (`Smoke Test Co` / `smoketestco`), confirmed the list and detail-overview
  responses reflected real `OrganizationType`-derived defaults (`maxUsers: 10`,
  `aiCallsPerMonth: 200`, `enabledModules: ["finance","sales","inventory"]` — the SME type's
  seeded config, not hardcoded), and **confirmed the tenant owner account could actually log in**
  to the real tenant app (`/api/auth/callback/credentials`, redirect to the base URL with no error
  param) — proving the created tenant is genuinely usable, not just a database row.

## The critical must-fail case, proven over real HTTP (not just unit-tested)
Suspension must actually block something (source doc §33 rule 8) — a status field that changes
nothing is worse than no feature. Sequence, all via real HTTP against a running dev server:
1. Tenant owner logs in successfully (redirect to base URL, no `error` query param).
2. Global Admin calls `POST /api/platform/organizations/smoketestco/status` with
   `{status: "suspended", reason: "smoke test suspension"}` (after first transitioning
   `onboarding → active`, since `onboarding → suspended` is correctly rejected by the state
   machine — confirmed the rejection itself works too, a useful side-finding).
3. Same tenant owner, same credentials, attempts login again:
   **`redirect to /auth?error=Configuration`** — genuinely blocked, not the same success path as
   before. This is `auth.ts`'s pre-existing, real `!org.isActive` check firing — Phase 2 didn't
   invent a new enforcement point, it wired `SUSPENDED` to flip the one that already existed and
   already worked (docs/admin/OPEN_QUESTIONS.md #2's decision, now verified in practice, not just
   in theory).

## Must-fail cases proven (automated)
- Invalid state transitions rejected (`ARCHIVED → ACTIVE`, `INVITED → ACTIVE`), no side effects
  (no `SubscriptionEvent`, no audit record) on rejection.
- A reason is mandatory for every status change.
- An actor without `SUSPEND_ORGANIZATION`/`MANAGE_ORGANIZATIONS` is denied and no data changes.
- Duplicate subdomain, invalid subdomain slug, short owner password all rejected before any write.
- Inactive tenant users are excluded from `activeUserCount` (proven with a mixed
  active/inactive fixture).

## Empty-state behaviour
AI Usage and Billing detail tabs return `{available: false, reason: "..."}` — never a placeholder
number (Hard Rule 3). A fresh organisation with no `ActivityLog` entries falls back to
`Organization.updatedAt` for "last meaningful activity" rather than showing nothing or a fabricated
date.

## Performance
List query batches derived-field lookups (`User`/`ActivityLog`/`AiUsage` aggregations) per page,
not per row — one aggregation query per signal per page, not N+1. Not yet load-tested at the
brief's stated 10k-organisation scale; revisit if this becomes the bottleneck once real tenant
volume exists.

## Verdict
Pass. Every list/detail figure is real and live; creation produces a genuinely usable tenant
(verified by an actual successful login, not just a database write); suspension genuinely and
verifiably blocks login over real HTTP, not just in a mocked unit test.
