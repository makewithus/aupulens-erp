# AI-20 — Intercompany / consolidation: why it isn't built, and what building it would require

`docs/ai/BRIEF-06-BATCH-E.md` asked for this to be read fully before any code was written. It was.
The conclusion is that group consolidation cannot be built honestly on top of this codebase's
current data model, and building it would require a deliberate architectural decision this memo
does not make on its own. What follows is the reasoning, not an implementation.

## What consolidation actually requires

Group consolidation — combining two or more legal entities' financial statements into one, with
intercompany transactions eliminated (a sale from Entity A to Entity B that nets to zero at the
group level, not double-counted as both A's revenue and B's expense) — requires, at minimum:

1. **A group/entity model**: something that says "Entity A and Entity B are both owned by Group
   G," distinct from any one entity's own books.
2. **Intercompany transaction identification**: a way to know that a specific sale, purchase, or
   loan is *between* two entities in the same group, as opposed to a normal third-party
   transaction.
3. **Elimination logic**: netting matched intercompany pairs to zero at the consolidated level
   without touching either entity's own standalone ledger (the standalone books must still be
   correct on their own).
4. **Minority-interest / ownership-percentage handling**, for anything short of 100% ownership —
   out of scope for a first pass regardless of which option below is chosen, but worth naming
   because it is a real, separate piece of complexity a "just add a group field" fix would not
   solve.

None of this exists in this codebase today, and — this is the load-bearing finding — the reason
isn't that a field is missing. It's that the tenant model itself doesn't have a concept of "more
than one entity, related."

## Why the current model prevents it

`Organization.subdomain` **is** `tenantId` (confirmed in `docs/_context/ARCHITECTURE.md` and
every model in this codebase via Golden Rule #1: every query is scoped by `tenantId`). Two group
companies — a parent and a subsidiary, say — are, structurally, **two separate tenants**. There
is no `Organization` field, no `Customer`/`Vendor` record, no anything, that says "tenant
`acme-holdings` and tenant `acme-manufacturing` are the same group."

`lib/aiRuntime/context/contextService.ts::buildContext()` — the one place every AI workflow gets
its data from — takes `tenantId` as a required parameter and every downstream query filters by
it. There is no code path, anywhere in `lib/aiRuntime/**`, that lets a workflow read a second
tenant's data. This is not a gap to close; it is the multi-tenancy boundary working as designed,
and it is the single most important security property this platform has. **Consolidation, by
definition, requires reading across that boundary.** Any implementation has to either weaken the
boundary or build something new that reads across it deliberately and narrowly, with the tenant's
knowledge and consent — never silently.

## Two options

### Option A — Group as a parent/child relationship, entities inside one tenant

Model a "group company" as a first-class record *within a single tenant* — closer to how
`PurchaseOrder.partnerId` already reuses `Customer` as a dual-purpose partner (Known Issue #4 in
`CLAUDE.md`) than to a real multi-tenant merge. A tenant that wants consolidated reporting across
its own subsidiaries would run all of them inside one tenant, with each transaction tagged to an
`entityId` sub-scope, and a new reporting layer that groups/eliminates by that tag.

**Cost**: a new `Entity`-or-equivalent model, a migration path for every transaction-bearing model
to carry an optional `entityId`, and elimination logic on top of `lib/accounting/reports.ts`. Real
but bounded — no cross-tenant read is ever needed, so the multi-tenancy boundary is untouched.

**Risk**: forces a real onboarding/migration decision on any tenant that wants this — existing
tenants whose group companies are already separate tenants (the common case today, since nothing
in this codebase has ever suggested otherwise) would need to either re-platform onto one tenant or
get no benefit from this option at all. It also doesn't compose with the *next* option — a tenant
picks one shape or the other, not both.

### Option B — A cross-tenant consolidation service, explicit consent required

Keep entities as separate tenants (today's reality, unchanged) and build a narrow, explicitly-
provisioned service that reads two or more tenants' data *only* when each tenant has explicitly
granted consent for consolidation with the others (a new consent record, presumably on
`Organization`, naming exactly which other tenant IDs it consolidates with) — and only through
that service, never through the normal per-tenant `contextService`.

**Cost**: higher. This is new infrastructure outside the pattern every other workflow in this
project follows (`tenantId` in, that tenant's data out) — it needs its own authorization model,
its own audit trail (whose consolidated view included which source tenants' data, when), and
careful scoping so it cannot become a general-purpose "read any tenant" backdoor by accident.

**Risk**: this is the one that matters most. A cross-tenant read path, however narrowly built, is
a permanent addition to the attack surface of a platform whose entire security model up to this
point has been "a workflow cannot structurally read another tenant's data." Getting the consent
model, the scoping, and the audit trail wrong here is a materially worse outcome than not building
consolidation at all. It should not be attempted without a deliberate security review this memo is
not a substitute for.

## Recommendation

**Option A, if and when a tenant actually asks for consolidated reporting** — it is strictly
safer (never touches the multi-tenancy boundary) and fits this codebase's existing patterns. It
should not be built speculatively; it's real, bounded work that belongs in its own chunk once a
concrete tenant need justifies the migration story it implies. Option B should be treated as
out of scope unless a specific, reviewed business requirement for true cross-tenant consolidation
emerges — and even then, it needs a dedicated security design pass, not an extension of this memo.

Until then: `intercompany` stays `not_implemented` in AI-22's reconciliation registry
(`lib/aiRuntime/reconciliation/definitions.ts`), reason pointing back at this file. What *is*
buildable today, safely, within one tenant — matching a `Customer` record used in a sales role
against one used in a purchase role, on real shared identifiers — is AI-20's related-party
detection, built separately (see `lib/aiRuntime/workflows/ai-20-related-party-detection/`).
