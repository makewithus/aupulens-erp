# PHASE-3a-plan.md — Plans, entitlements, resolver (enforcement is Phase 3b)

## Existing code this phase calls
- `lib/constants/tiers.ts` (`getTierLimits(tier)`) — read as a migration source for seeding real
  `Plan` documents from the tiers that already exist; **not called by the new resolver** going
  forward (Hard Rule 6 — the new resolver must not perpetuate the hardcoded-by-tier pattern for
  anything the control plane itself touches). Existing tenant-facing code that already calls
  `getTierLimits` is untouched (Phase 3b's own concern, not this phase's).
- `models/admin/SubscriptionEvent.ts` — extended (additive event type) for plan-assignment history,
  per Phase 2's own precedent, rather than a parallel history model.
- `models/admin/Organization.ts` — additive `planId?` field pointing at the new `Plan` model,
  alongside the untouched pre-existing `tier` field (both exist during the transition; `tier`
  remains authoritative for existing tenant-facing reads until Phase 3b explicitly migrates a given
  route, per the brief's own phased-enforcement mandate).

## New models
- `models/platform/Plan.ts`: `{key (unique), name, description, priceMonthly, priceYearly,
  billingCycleOptions, isCustom, basedOnPlanKey?, features: {modules[], maxUsers, maxCompanies,
  storageGb, apiRequestsPerMonth, aiCreditsPerMonth, aiRequestsPerMonth, automationRunsPerMonth,
  documentLimitPerMonth, supportLevel, featureFlags: Record<string,boolean>}, active}`. Source doc
  §8's plan list (`FREE, STARTER, GROWTH, PRO, BUSINESS, ENTERPRISE, CUSTOM`) seeded via
  `scripts/seed-platform-plans.ts`.
- `models/platform/OrganizationEntitlement.ts`: `{tenantId (unique), planId, overrides?: Partial<PlanFeatures>,
  effectiveFrom, computedAt}` — a cached, invalidate-on-change snapshot of what `resolveEntitlements`
  would compute, so reads don't hit `Plan` + override-merge logic on every request once Phase 3b
  wires enforcement. Custom enterprise plans (§11) are `overrides` layered on `basedOnPlanKey`'s
  plan, never a full copy — proven by a test that changing the base plan's feature (before it's
  overridden) changes what a custom-plan tenant resolves to.

## `lib/platform/entitlements/`
- `resolveEntitlements(tenantId)`: `Plan` (by the org's `planId`, falling back to a lookup by the
  pre-existing `tier` string for tenants with no `planId` yet — a real migration bridge, not a
  guess) → merge `OrganizationEntitlement.overrides` → return `{modules, limits}`. Cached
  (in-process, invalidated by `assignPlan`). **Errors default to permissive** (Part 2.4: "default
  to permissive when the resolver errors, and log it") — proven by a test that a thrown DB error
  still returns an all-modules-enabled result, not a lockout, and emits a `SECURITY`-severity audit
  event so the failure is visible without being a live incident for the tenant.
- `assignPlan(actor, tenantId, planKey, effective: "immediately" | "next_billing_cycle", reason)`:
  records previous/new plan, changed-by, reason, effective date (extends `SubscriptionEvent` with
  a `plan_assigned` type, additive) — full history via `SubscriptionEvent.find({tenantId, type:
  "plan_assigned"})`, no separate history table needed (Phase 2's own precedent). **A downgrade
  deletes no tenant data** — proven by a test that asserts document counts across every tenant
  collection are identical before and after a downgrade; only the resolved entitlement changes.

## Tests
`resolveEntitlements.test.ts` (base plan, override layering, tier-fallback bridge, permissive
default on error), `assignPlan.test.ts` (history recorded, downgrade deletes nothing — real
document-count assertion, not a mock), `customPlan.test.ts` (override-layer semantics).

## Exit gate
Plans are configurable via `Plan` documents; `resolveEntitlements()` returns correct output for
every seeded plan and for a custom override; a downgrade deletes zero tenant documents (asserted,
not assumed).
