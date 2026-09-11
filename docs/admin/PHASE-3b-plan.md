# PHASE-3b-plan.md — Entitlement enforcement (deliberately narrow scope)

## Why this phase is scoped the way it is

The brief's own words: "Entitlement **enforcement**, wired route by route with a regression check
each time... the single most dangerous change in this project — a wrong check locks a paying
customer out of their own accounting." With 424 existing API routes and Hard Rule 2 ("zero
regression in the existing product"), retrofitting enforcement across the entire surface in one
pass is exactly the reckless move the brief is warning against. This phase instead:

1. Builds the reusable enforcement primitive, fully tested in isolation.
2. Wires it into **one** real, carefully chosen, low-blast-radius tenant route as a proven,
   working example — with its own before/after regression check.
3. Documents every other route as explicitly not yet enforced, in `OPEN_QUESTIONS.md`, so a future
   session (or this one, in a later pass) can extend it route by route without re-deriving the
   approach.

Building the primitive and stopping at one proof-of-concept route is the responsible reading of
"route by route" — it is not a shortcut, it is the brief's own risk framing taken seriously.

## Existing code this phase calls
- `lib/platform/entitlements/resolve.ts::resolveEntitlements()` — the only source of truth read.
- The existing per-route pattern (`auth()` → check `session.user.tenantId` → `connectDB()` →
  inline filter) — the enforcement check is inserted as one additional line in that same
  sequence, never a new abstraction layer replacing it.

## New file
`lib/platform/entitlements/enforce.ts`:
- `moduleIsEnabled(tenantId, moduleKey): Promise<boolean>` — thin wrapper over
  `resolveEntitlements()`.
- `requireModuleEnabled(tenantId, moduleKey): Promise<NextResponse | null>` — returns a 402/403
  JSON response (matching this repo's `{success:false, message}` shape) when the module is not in
  the resolved entitlement's `modules[]`, or `null` when the caller should proceed. **Fails open
  (returns `null`, i.e. allow) if `resolveEntitlements()` itself reports `source:
  "permissive_default"`** — the resolver's own permissive-on-error contract (Phase 3a) must
  propagate all the way to the enforcement point, not be silently converted into a block partway
  through the call chain.

## The one wired route
`app/api/inventory/orders/route.ts` POST — chosen because it already has a real test file
(`tests/inventory/orders.route.test.ts`) covering exactly this handler, so "no regression" is
checked by extending that same file rather than writing a fresh one with no prior coverage to
compare against. (Manufacturing was the first candidate but has no route-level test file for any
of its routes — confirmed by search — which would have meant writing the regression check from
scratch rather than proving an existing one still passes; inventory's existing coverage is the
more honest "route by room, regression-checked" proof of concept.)

## Tests
`enforce.test.ts` (module enabled → passes through; module not in the plan → blocked with the
right response shape; resolver in permissive-default mode → never blocks, regardless of the plan's
actual module list). Extend `tests/inventory/orders.route.test.ts` with: the existing valid-order
test still passes unmodified (regression check), plus a new case — a tenant whose resolved plan
excludes `inventory` is blocked with a clear message, not a bare 500.

## Exit gate
The one wired route: an entitled tenant's existing test still passes unmodified; a non-entitled
tenant is blocked with a clear reason. Every other route's enforcement status is recorded in
`OPEN_QUESTIONS.md`, not silently left ambiguous.
