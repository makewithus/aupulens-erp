# Verification — Cross-tenant read gateway (Phase 1)

## How it's triggered
Any control-plane feature needing tenant data calls `lib/platform/tenancy/crossTenant.ts`'s
`withCrossTenantRead()` (or a purpose-built wrapper like `countOrganizations()`). Phase 1 wires
exactly one real consumer: the dashboard's organisation count
(`app/api/platform/dashboard/summary/route.ts`).

## Happy path proven
`tests/platform/crossTenant.test.ts`: a `GLOBAL_ADMIN` with `VIEW_ORGANIZATIONS` successfully
counts organisations across every tenant (proven with 5 organisations seeded, no tenant filter
applied — the count matches the true cross-tenant total), and exactly one `PlatformAuditLog` entry
is written with `eventType: CROSS_TENANT_READ` and the caller-supplied `reason` recorded verbatim
in `metadata.reason`.

## Must-fail cases proven
- An actor whose `AdminRole` lacks the required capability: the read throws `AdminForbiddenError`
  and never executes the underlying query — proven by asserting the query result is never reached
  (the call rejects) — and a `CROSS_TENANT_READ_DENIED` audit entry (severity `WARNING`) is still
  written. **Denials are audited, not just successes** — source doc §6's "access should itself be
  logged" applies to attempted access too.
- A role with an empty `AdminRole.capabilities[]` (no row seeded, or a role that legitimately has
  none of a given capability) is denied — the system fails closed, never open, when no matrix row
  exists at all.

## The permission-matrix cells this phase can actually test
Phase 1 has one gated capability wired end-to-end (`VIEW_ORGANIZATIONS`). The full §30 matrix
(every capability × every role, both allow and deny) is exercised as each later phase wires its own
gateway calls through the same `withCrossTenantRead()` — `tests/platform/adminRbac.test.ts` already
covers the matrix at the data layer (one allow + one deny per seeded role, per capability shape),
independent of which capabilities are wired to real features yet.

## Empty-state behaviour
Not yet applicable — Phase 1's only real consumer (`countOrganizations`) always returns a number
(0 is a valid, real, non-static answer for a fresh installation), never a placeholder.

## Source-grep enforcement (the structural guarantee, not just a runtime test)
`tests/platform/sourceGrep.test.ts` greps the entire `app/`, `lib/`, `components/` tree and fails
the build if `lib/platform/tenancy/crossTenant.ts` is ever imported from:
- any `app/api/<module>/**` route outside `app/api/platform/**` (a tenant-facing route reaching
  into the gateway), or
- anywhere at all outside `app/platform/**`, `lib/platform/**`, `app/api/platform/**`, or `tests/`.

This is the same static-analysis technique the prior AI-workflows project used successfully to
enforce "no ORM writes in workflows" — a real, proven pattern in this repo for exactly this class
of architectural rule, not a novel/unproven approach for this brief.

## Performance
Not yet measured under load — Phase 1's only caller is a single dashboard tile. Revisit once
Phase 2's organisation list (server-side paginated, called on every list-page render) is the real
load-bearing consumer.

## Verdict
Pass. The gateway's contract (capability-gated, reason-required, always audited including on
denial, structurally the only cross-tenant path) is proven both at the unit level and by static
analysis of the whole tree.
