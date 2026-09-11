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

## Phase 1

### 6. The §30 permission matrix's exact cell contents were inferred, not quoted

The implementation brief describes the source doc's §30 permission matrix as "the specification"
but does not quote its literal contents anywhere in the text handed to this session — only the
seven role names (§25) and the category list (§21) are given verbatim. `scripts/seed-platform-roles.ts`
therefore defines a principled default matrix from the roles' own names and Part 2.2's stated
exceptions (destructive actions need `GLOBAL_SUPER_ADMIN`): `GLOBAL_SUPER_ADMIN` gets everything;
`GLOBAL_ADMIN` gets everything except delete-organisation/manage-admin-users/manage-security-config;
`BILLING_ADMIN`/`AI_ADMIN` get platform-wide read plus their own domain's writes;
`SUPPORT_ADMIN` gets platform-wide read plus read-only impersonation request rights;
`SECURITY_ADMIN` gets platform-wide read plus security config/retention/alerts/access-approval;
`READ_ONLY_ADMIN` gets only read capabilities.

**Confirm**: does this match the actual source-doc matrix? Implemented entirely as data
(`models/platform/AdminRole.ts` rows, seeded by the script above) specifically so a correction is a
one-file re-run of the seed script, never a code change — per Hard Rule 6 and the brief's own Part
1.2 guidance for exactly this situation (unsure → implement the safe default, flag it, don't guess
silently).

### 7. A real Next.js framework behavior found during manual Phase 1 verification (not a defect in this brief's code, but worth knowing)

Manually driving the login/MFA/logout flow with `curl` against both `next dev` and a real
production build (`build:local`/`start:local`) found that `redirect()` thrown from
`app/platform/(app)/layout.tsx` (an async Server Component, gating every `/platform` page) does not
always produce a clean HTTP 307 — Next.js's own documented behavior for a redirect thrown after SSR
streaming has begun falls back to a client-side redirect (an injected script, near-instant in any
real browser, plus a 1-second meta-refresh belt-and-braces), while the initial HTTP response itself
still reports 200. No sensitive data is exposed either way — see
`docs/admin/verification/admin-identity.md` for the full writeup and the hardening applied
(`components/platform/PlatformShell.tsx` fetches its own identity client-side via
`/api/platform/me` rather than receiving it as a server-rendered prop, so even the framework's
soft-redirect fallback has nothing sensitive to leak). Not a blocking issue; recorded because a
future automated security scanner may flag "`/platform` returns 200 for an unauthenticated GET" —
the answer, if that's ever raised, is this entry, not a fresh investigation.
