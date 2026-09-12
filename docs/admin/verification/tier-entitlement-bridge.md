# Verification — tier/entitlement bridge (Phase 9, Addendum A Part 1)

## What existed before

Two independent, unreconciled sources of truth for "which modules can this tenant use":

1. `lib/constants/tiers.ts::getTierLimits()` — hardcoded, pre-existing, wired into
   `lib/middleware/moduleGate.ts`, itself wired once into `middleware.ts` and covering ~346 of 448
   API routes (77%) plus their page-route counterparts. This is what real tenants have been
   governed by since before this project started.
2. `lib/platform/entitlements/resolve.ts::resolveEntitlements()` — built in Phase 3a, data-driven,
   wired into exactly one route via `lib/platform/entitlements/enforce.ts` (Phase 3b).

Phase 9's Part 3.1 investigation found that naively wiring (1) to call (2) for every tenant would
have silently changed real STARTER-tier tenant access, because the Phase 3a `Plan` catalogue's
STARTER definition (`modules: admin/finance/sales`) directly contradicted `tiers.ts`'s STARTER
definition (`modules: admin/hr/inventory`) — and would have broken
`tests/saas/moduleGate.test.ts`'s own "finance NOT accessible on starter" assertion. Reported, not
fixed, in Phase 9's Report 1.

## The decision (Addendum A Part 1)

`tiers.ts` wins for the three legacy tier values (STARTER, PROFESSIONAL, ENTERPRISE) — it describes
real, live, tested tenant behaviour today. The Phase 3a catalogue was a seeded default with no
customer or product decision behind its numbers.

## What changed

1. **`lib/platform/entitlements/planCatalog.ts`** — `PLAN_KEY.STARTER`/`PRO`/`ENTERPRISE` corrected
   to match `tiers.ts`'s module set, `maxUsers`, and AI-call ceiling (`aiCreditsPerMonth` /
   `aiRequestsPerMonth`) byte-for-byte for the three overlapping fields. Fields `tiers.ts` doesn't
   define (storage, API requests, automation runs, document limits, support level) are untouched.
   `PLAN_KEY.GROWTH`/`BUSINESS`/`CUSTOM` (no legacy-tier counterpart) are untouched.

2. **`app/api/internal/org-tier/route.ts`** — the one place with a live Mongoose connection in the
   middleware request path. Now checks whether an `OrganizationEntitlement` row exists for the
   tenant:
   - **No row** → `resolvedModules` is omitted from the response entirely. `resolveEntitlements()`
     is never called. Zero new code path for the ~100% of tenants this project has not touched.
   - **Row exists** → calls `resolveEntitlements()`. If it resolved cleanly (`source !==
     "permissive_default"`), `resolvedModules` carries the real resolved module list. If the
     resolver itself hit its own internal error path, `resolvedModules` is left undefined rather
     than trusting the permissive-default's all-modules list as if it were a real entitlement —
     `resolveEntitlements()` has already audited that failure at SECURITY severity by the time it
     returns.

3. **`lib/middleware/moduleGate.ts`** — `OrgModuleInfo` gained an optional `resolvedModules` field;
   `isModuleAccessible()` gained an optional 5th parameter of the same name, used as the tier
   ceiling in place of `getTierLimits(tier).enabledModules` when present, falling back to the
   original lookup when absent. Every existing call site with 4 arguments is unaffected — this is
   why `tests/saas/moduleGate.test.ts` needed zero edits.

4. **`lib/platform/entitlements/enforce.ts`** — reconciled, not retired (see its own doc comment).
   It remains the correct primitive for routes outside moduleGate's 7 covered prefixes; for routes
   inside them it is now redundant-but-harmless defense-in-depth, kept because it's what makes that
   route's entitlement behaviour unit-testable without a running server.

## Proof

- `tests/platform/tierEntitlementBridge.test.ts` (17 tests): `getTierLimits()` vs
  `resolveEntitlements()` equivalence for all 3 legacy tiers; `isModuleAccessible()`'s bridge logic
  (absent `resolvedModules` reproduces `tiers.ts` exactly; a present one overrides it; trial bypass
  still wins over both); `enforce.ts` vs `moduleGate` agreement across every module for every legacy
  tier; a dedicated regression test proving a STARTER tenant can now correctly use "inventory" via
  `enforce.ts` (this was silently broken before the catalogue fix — the old STARTER definition
  omitted "inventory" entirely, so any route wired to `enforce.ts` would have incorrectly 403'd a
  real STARTER tenant for that module; no such route existed in production before this phase, so
  this was a latent bug, not a live incident).
- `tests/internal/orgTier.route.test.ts` (3 tests): the actual route's `resolvedModules` behaviour
  — absent for an untouched tenant, populated for an entitled one, absent (not falsely permissive)
  when the entitled tenant's Plan document is missing.
- `tests/saas/moduleGate.test.ts` — **zero modifications**, all passing. This is the regression
  proof: the pre-existing, tested behaviour for every tenant this project has not touched is
  provably unchanged.
- Full platform + moduleGate + inventory-route suite: 490 tests, all passing. `tsc --noEmit` clean.

## What this does NOT yet do

Reading `resolvedModules` in `moduleGate` makes the *module ceiling* entitlement-aware. It does not
enforce `maxUsers`, AI limits, or any other `Plan.features` value at the middleware layer — those
remain enforced at their own existing points (`lib/platform/ai/limitBehavior.ts` for AI,
sign-up/invite flows for user counts). Not a gap against this phase's scope, which was specifically
the module-access seam Phase 3a/3b/9 all touched — noted so a future reader doesn't assume more was
wired than was.
