# Verification — Plans and the entitlement resolver (Phase 3a)

## How it's triggered
`/platform/plans` (catalogue view), the Subscription tab's "Assign plan" action on an organisation
detail page. API: `GET/POST /api/platform/organizations/[id]/plan`, `GET /api/platform/plans`.

## Happy path proven
- Automated: `resolveEntitlements.test.ts` (assigned plan resolves correctly; a pre-existing
  `Organization.tier` bridges to a sensible `PLAN_KEY` for tenants with no entitlement row yet;
  overrides layer on top of a base plan without duplicating it — proven by changing the base
  plan's own feature and confirming an override-holding tenant picks up the new base value for
  every field it didn't override; caching — a second call within the TTL makes no new DB query).
- Manual, over real HTTP: seeded all 7 plans, created a real organisation (tier-fallback resolved
  it to `starter`), assigned `pro` via the API, and confirmed the resolved entitlements changed to
  `pro`'s real feature set (`maxUsers: 50`, `aiCreditsPerMonth: 2000`, 6 modules) — not a
  simulated/mocked response.

## Must-fail / must-not-fail cases proven
- **The resolver never locks a tenant out on its own failure** (Part 2.4): a corrupted/missing
  plan reference returns the permissive default (a generous, real result set — not an empty
  module list), and emits a `SECURITY`-severity `PlatformAuditLog` entry so the failure is visible
  to a human without becoming a live incident for the tenant. Proven directly.
- **A downgrade deletes zero tenant data** (Hard Rule 7): `assignPlan.test.ts` seeds 5 real
  `Account` documents and a real tenant `User`, assigns `PRO` then downgrades to `STARTER`, and
  asserts the exact same document counts before and after — not an assumption, a real count
  comparison against real collections.
- A reason is mandatory for every assignment; an actor without `ASSIGN_PLAN` is denied and no
  `OrganizationEntitlement` document is created.
- Full history: every assignment records `fromPlanKey`/`toPlanKey`/`reason`/`actorId` in
  `SubscriptionEvent` (Phase 2's own append-only precedent, extended) and is separately audited.

## Empty-state / no-static-data behaviour
The Plans page (`/platform/plans`) renders exactly the `Plan` documents in the database — an empty
catalogue renders an empty grid, not a hardcoded list. No `if (plan === "PRO")` exists anywhere in
this phase's code; every plan-aware decision (module list, limits) reads through
`resolveEntitlements()`.

## Verdict
Pass. The resolver is provably permissive-on-error rather than lockout-on-error, a downgrade is
provably non-destructive, and the override-layering semantics for custom plans are provably correct
rather than assumed.
