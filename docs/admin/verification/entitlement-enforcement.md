# Verification — Entitlement enforcement, Phase 3b (deliberately one route)

## How it's triggered
`app/api/inventory/orders/route.ts` POST calls `requireModuleEnabled(tenantId, "inventory")`
immediately after resolving `tenantId`, before any business logic.

## Happy path proven
- `enforce.test.ts`: a module present in the resolved plan passes through
  (`requireModuleEnabled` returns `null`).
- `tests/inventory/orders.route.test.ts`: all 5 pre-existing tests for this route — unmodified —
  still pass. This is the regression check: none of them seed an `Organization`/`Plan` for their
  tenant, so the resolver falls into its own permissive-default path and enforcement allows the
  request through, exactly as it behaved before this phase. **Wiring enforcement into a route
  changes nothing for a tenant with no plan configured yet** — proven, not assumed.

## Must-fail case proven, against a real restrictive plan (not a mock)
A new test seeds a real `Organization`, a real `Plan` (key `starter`, `modules: ["admin",
"finance"]` — deliberately no `"inventory"`), and a real `OrganizationEntitlement` pointing that
tenant at it. `POST /api/inventory/orders` for that tenant returns **403** with a message naming
the missing module (`"...does not include the \"inventory\" module..."`), and — critically —
**zero `InventoryOrder` documents are created** (asserted via `countDocuments`, not inferred from
the response alone).

## The "never lock out an entitled tenant" property
`enforce.test.ts`'s fourth case: when the resolver itself falls back to its permissive default
(e.g. a corrupted/missing plan reference), `moduleIsEnabled`/`requireModuleEnabled` **always
allow** — the resolver's own "never a lockout on its own error" contract (Phase 3a) is proven to
propagate all the way to the enforcement point, not get silently converted into a block partway
through the call chain. This is the single most important property of this phase: a wrong ALLOW
here is recoverable; a wrong BLOCK is a paying customer locked out of their own accounting (the
brief's own stated risk).

## Scope, honestly stated
423 of 424 API routes are untouched by this phase and enforce nothing — see
`docs/admin/OPEN_QUESTIONS.md` #8 for why that is the deliberate reading of "route by route,
regression-checked each time," not a gap to be embarrassed about.

## Verdict
Pass, within its intentionally narrow scope: the primitive is correct, fails open on its own
error, and one real route proves the wiring pattern end-to-end with a genuine before/after
regression check.
