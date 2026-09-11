# OPEN_QUESTIONS.md — Global Admin Control Plane

> Decisions that need a human, not a guess. Per Part 1.2: implement the read/display side fully,
> guard the mutating side, raise the question here rather than assume. Grouped by phase.

---

## Phase 0

### 1. `master-admin` — keep as-is, build fully parallel (see `SYSTEM_INVENTORY_DELTA.md` §1)

`master-admin` is a live, deeply-wired tenant-resident super-admin `User.role`, not a vestigial or
partial ancestor of the new control plane. **Decision made for this brief**: leave it completely
untouched (Hard Rule 1 requires this regardless) and build `AdminUser`/`AdminSession` as a fully
separate identity domain with zero code-level interaction. **Confirm**: is there an intent to
eventually deprecate `master-admin` in favor of the new domain? If yes, that is a separate,
larger, non-additive migration project — explicitly out of scope here. If no, both will coexist
indefinitely, which means two different "root admin" concepts exist in the platform going forward
(a support engineer or new hire could reasonably ask "which admin login do I use"). No action
taken pending an answer; not a blocker to Phase 1.

### 2. Organisation status model vs. existing `subscriptionStatus`/`isActive`

Source-doc §3 wants `INVITED, ONBOARDING, TRIAL, ACTIVE, SUSPENDED, PAYMENT_HOLD, CANCELLED,
ARCHIVED`. `Organization` already has `subscriptionStatus` (billing-cycle state) and `isActive`
(boolean, enforced at login in `auth.ts`). **Decision needed**: should the new admin-facing
`status` field be a distinct field from both (safest — no risk to existing `isActive`/
`subscriptionStatus` readers), or should `SUSPENDED`/`ACTIVE` transitions in the new field also
flip `isActive` so suspension actually blocks login (source-doc §33 rule 8's requirement)?
**Default taken for Phase 2 planning**: add a new `status` field (additive), and have the
`SUSPENDED` transition **also** set `isActive = false` (an additive side-effect on an existing
field, not a repurposing of it) — this reuses the one real, working enforcement point
(`auth.ts`'s `!org.isActive` check) rather than inventing a second one, which is the safer
"suspension does something real" path. Flagged here because it does touch a field
tenant-facing login logic already depends on; revisit if this causes any issue in Phase 2 testing.

### 3. Approval-authority tiers (carried over from the AI-workflows project's own `DECISIONS.md`)

That project's `docs/ai/DECISIONS.md` already flagged: `lib/org/rbac.ts` has no concept of
per-role/per-user approval amount ceilings. This resurfaces here because source-doc §25's admin
role matrix (`GLOBAL_SUPER_ADMIN` vs `GLOBAL_ADMIN` vs others) has the same shape of question for
*admin* actions — e.g. should `BILLING_ADMIN` have a spend/refund ceiling distinct from
`GLOBAL_SUPER_ADMIN`? **Not answered here.** The §30 permission matrix as specified is a
capability allow-list (can/cannot perform an action type), not an amount-tiered one — implemented
as specified, with no invented amount ceilings unless the source doc's own matrix specifies one.

### 4. MRR/ARR cannot be computed from real data

No payment-gateway-backed revenue event exists anywhere in the platform-billing sense — see
`SYSTEM_INVENTORY_DELTA.md` §3. `Organization.tier` is a label; nothing charges anything today for
platform access itself. **Decision needed**: does Aupulens track revenue for its own tenants in a
system outside this codebase (a separate billing/CRM tool) that could later be integrated, or
should MRR/ARR simply stay "unavailable" indefinitely? **Default taken**: the Phase 6 dashboard
renders these tiles as an explicit "No billing data available — platform billing is not yet
integrated" empty state, never a computed-from-`tier`-label estimate. Revisit if a real billing
integration is planned.

### 5. Pre-existing test failures found on `global/admin` branch, unrelated to this brief

`tests/ai/aiRuntime/ai07AccrualIntelligence.test.ts`, `ai21StatementIntelligenceEdgeCases.test.ts`,
and `ai29ControlMonitoringEdgeCases.test.ts` (5 tests total) fail deterministically on this branch
as of 2026-09-09, which was not true of the same code as of `docs/ai/BASELINE_FAILURES.md`'s last
recording (2026-09-03, 0 failures). This is a real regression in AI-runtime workflow logic,
**unrelated to Global Admin scope** — flagged for separate triage, same treatment as the four
pre-existing broken UI routes already on record. Not fixed here (Hard Rule 1 / out of scope).

---

*(Phase 1+ entries will be appended here as later phases' own discovery/build steps surface
questions, per the working protocol.)*
