# DECISIONS.md

> Product/architecture decisions made across the AI-native finance chunks that should not be
> re-litigated without a real reason to revisit them. Each entry: the decision, the date/chunk it
> was made, who accepted it, and why — so a future session can tell "settled" from "still open"
> (the latter lives in `OPEN_QUESTIONS.md`).

## AI-20 — group consolidation: Option A, build only on real demand

**Decision**: If/when group consolidation is ever built, it should be **Option A** — a
parent/child entity model *within a single tenant* (an `Entity`-or-equivalent record, transactions
tagged with an optional `entityId` sub-scope, elimination logic layered on
`lib/accounting/reports.ts`) — **not** Option B (a cross-tenant consolidation service reading
across tenant boundaries with explicit consent).

**Why**: Option A never touches the multi-tenancy boundary (`tenantId`-scoped reads are this
platform's core security property, per `docs/ai/AI-20-ARCHITECTURE-NOTE.md`). Option B is a
permanent addition to the attack surface of a platform whose entire security model has been "a
workflow cannot structurally read another tenant's data," and getting its consent/scoping/audit
model wrong is a materially worse outcome than not building consolidation at all.

**Status**: Accepted as the product decision, Chunk 7 (`docs/ai/BRIEF-07-BATCH-F.md` preamble),
originating from the Chunk 6 architecture note (`docs/ai/AI-20-ARCHITECTURE-NOTE.md`).

**Still not built**: this is a decision about *which shape to use if built*, not a decision to
build it now. Consolidation itself remains `not_implemented` in
`lib/aiRuntime/reconciliation/definitions.ts`'s `intercompany` entry until a specific tenant need
justifies the migration story Option A implies. Do not build speculatively.

## Open product question — should `lib/org/rbac.ts` gain an authority-tier concept?

**Question, not a decision**: AI-29's `approver_authority` control (Chunk 7) can only check that
an approver's `User.role` is in a plausible set (`finance`/`admin`/`master-admin`) — `lib/org/
rbac.ts` has no concept of approval *limits* (e.g. "this role may approve up to ₹X") at all, only
`canManageOrg()`-style admin gates. So the control observes plausibility, never enforces a real
authority tier.

**Raised**: Chunk 8a (`docs/ai/BRIEF-08a-BATCH-G.md` 0.4), recorded here rather than answered,
because it is a real product/RBAC design decision (does this org want tiered approval limits at
all, and if so, per-role or per-user) that a workflow chunk should not decide unilaterally by
building against an assumed shape.

**Status**: open. Will keep surfacing (AI-29's `approver_authority`, any future approval-chain
work) until a human decides whether to build it, and if so, what an authority tier should actually
gate — approval amount ceilings, specific transaction types, or both.
