# AUPULENS — GLOBAL ADMIN, PHASE 9 ADDENDUM A
# Read alongside `docs/admin/BRIEF-PHASE-9-COVERAGE.md`. Parts 2 and 4–7 of that brief still stand.

> Report 1 accepted, and the two findings in it are exactly the right kind. You stopped before
> building on an assumption that would have silently changed real tenants' access, and you noticed
> that the specification this whole project is measured against was never actually in the repo.
> Both answered below.
>
> Save this to `docs/admin/BRIEF-PHASE-9a-ADDENDUM.md`.

---

# PART 0 — THE SOURCE DOCUMENT

## 0.1 Save it this time

You are right: `docs/admin/BRIEF-GLOBAL-ADMIN.md` was never committed, and neither was the CTO
specification. That is a process gap worth closing permanently, because every coverage claim this
project makes is measured against a document nobody can open.

**The full CTO specification is being supplied to you alongside this addendum.** Save it verbatim
to `docs/admin/SOURCE-SPEC.md`, commit it, and re-run the coverage matrix against the complete
text rather than against reconstructed fragments. Also save this addendum and the Phase 9 brief.
From here on, any brief you are given gets committed before work starts on it.

Expect the re-run to move some rows. Fragments are good evidence but they are not the document,
and a requirement nobody quoted in nine phases is precisely the kind that gets missed.

## 0.2 §17 and §22, verbatim — you can close these immediately

**§17 — AI Usage Logs**
> Every AI request should generate a usage record.
>
> Policy: Do not store sensitive AI prompt/response content in normal operational logs by default.
> If retained, it should follow explicit privacy, retention, and access-control policies.

**§22 — Log Severity**
> Every event should have severity: INFO, WARNING, ERROR, CRITICAL, SECURITY.

Both are already satisfied by what you built — `AiUsageRecord` writes one row per request with no
prompt or response text, and `PLATFORM_SEVERITY` carries exactly those five values. Mark them
`IMPLEMENTED` with the evidence, and note against §17 that the "if retained" branch is moot here
because nothing is retained.

---

# PART 1 — THE STARTER MISMATCH: DECIDED

You found that the Phase 3a `Plan` catalogue's STARTER (`admin/finance/sales`) contradicts the
pre-existing, tested `tiers.ts` STARTER (`admin/hr/inventory`), and that naively bridging them
would change real tenants' access and break
`tests/saas/moduleGate.test.ts`'s "finance NOT accessible on starter".

**Stopping there was the correct call.** Here is the decision.

## 1.1 `tiers.ts` wins for the legacy tiers

The existing tier definitions describe what real tenants can do **today**. The Phase 3a catalogue
was a seeded default invented during this project, with no customer attached to it and no product
decision behind its module list. So:

- **Correct the `Plan` catalogue** (`lib/platform/entitlements/planCatalog.ts`) so that every plan
  key which maps to an existing `Organization.tier` value has **exactly** the module set and limits
  that `lib/constants/tiers.ts` defines for that tier. Byte-for-byte.
- The plan keys with no legacy counterpart (the new ones from §8's seven) keep their catalogue
  definitions — nothing real depends on them yet.
- `tests/saas/moduleGate.test.ts` must continue to pass **completely unmodified**. That is the
  regression proof, exactly as it was for the inventory route in Phase 3b. If you find yourself
  editing that test, the bridge is wrong.

Any future change to what STARTER grants then happens deliberately, through the §8 plan-management
UI, by a named admin, with an audit record — which is what §10 was asking for in the first place.

## 1.2 The bridge must be non-breaking by construction, not by care

Do not make `moduleGate` resolve through entitlements for everyone and rely on the catalogue
matching. Make the two paths *provably* identical for any tenant that hasn't been touched:

```
moduleGate / getTierLimits resolution order:
  1. Does an explicit OrganizationEntitlement row exist for this tenant?
       NO  → use lib/constants/tiers.ts exactly as today. Zero change. Zero risk.
       YES → use resolveEntitlements(), which is an admin's deliberate, audited intent.
  2. Resolver error → fall back to tiers.ts and audit at SECURITY severity
       (the permissive-on-error behaviour you already built — keep it).
```

With 1.1 applied, both branches return the same answer for a legacy tier anyway. But the structure
means that even if the catalogue drifts later, an untouched tenant cannot be affected. That is the
difference between "we checked it matches" and "it cannot break."

**Add a test that asserts the equivalence directly:** for every legacy tier value, assert
`getTierLimits(tier)` and `resolveEntitlements()` for a tenant on that tier return the same module
set and the same limits. If someone edits the catalogue in six months, that test fires.

## 1.3 What this buys you

`moduleGate` already covers ~346 of 448 API routes plus their pages — 77% — wired once in
`middleware.ts`. With the bridge in place, §10 becomes genuinely true across all of it in **one
integration point**, not 423 route edits. Phase 3b's `enforce.ts` then has one job: the routes
`moduleGate` does not cover.

**Reconcile the two explicitly.** Either `enforce.ts` becomes a thin wrapper over the same
resolution path, or it is retired in favour of `moduleGate` for anything `moduleGate` reaches.
Document which, and add a source-grep test that the two cannot diverge — the same technique that
has caught two real problems in this codebase already. Do not leave two enforcement mechanisms
with two resolution paths.

---

# PART 2 — THE BUILD PLAN FOR THE 15 PARTIAL SECTIONS

Work in these four groups, in this order, each as its own commit set with its own verification.
Re-scope after the coverage matrix re-run in 0.1 if it moves anything.

## Group A — Entitlements (§10, §8, §11)

1. **The bridge** per Part 1, plus the equivalence test and the `enforce.ts` reconciliation.
   This closes §10 and is the highest-value change in the phase.
2. **§8 plan management UI** — create and edit a plan's own configuration: price, billing cycle,
   max users, max companies, storage, API requests, AI credits, AI requests, available modules,
   automation limits, document limits, support level, feature flags. Editing a plan is a privileged
   action: audited, reason required, and it must show **how many organisations are on this plan**
   before the admin saves, because editing a plan changes every one of them at once.
3. **§11 custom enterprise override editor** on the organisation's Subscription tab — the override
   layer already exists in `OrganizationEntitlement`; give it a UI. Unlimited users, higher company
   counts, custom AI credits, custom module set, all as overrides on a named base plan.

## Group B — AI configuration (§14, §15, §16)

4. **§15 AI limit editor** — monthly credits, daily credits, max requests, max tokens, max cost,
   plus the at-limit behaviour selector (BLOCK / THROTTLE / ALLOW_WITH_OVERAGE / ALLOW_AND_LOG).
   Gated on `CONFIGURE_AI_LIMITS`, which per the corrected matrix means `AI_ADMIN` and
   `GLOBAL_SUPER_ADMIN` only — **not** `GLOBAL_ADMIN`. Test that a `GLOBAL_ADMIN` session is
   refused; it is the cleanest proof the corrected matrix is live.
5. **§16 overage controls** — enabled, rate, soft limit, hard limit, alert thresholds.
6. **§14 feature breakdown** — the two uninstrumented buckets stay honest zeros with the existing
   `AI_FEATURE_MAP.md` note. If instrumenting `lib/docIntel/` through `tenantAi.ts` is genuinely
   small, do it and close the gap; if it is not, leave it declared. Do not half-instrument.

## Group C — Surfaces (§3, §7, §24, §18)

7. **§3 list columns** — Organisation ID, Region, Usage %, and the **resolved plan** rather than
   the legacy `tier` label. That last one matters: after Group A, list and detail must agree.
8. **§7 tabs** — Modules, Configuration, Security, Billing. Storage and Monthly Revenue as
   labelled, explained empty states rather than absent fields.
9. **§24 KPIs and panels** — every KPI real data supports; the rest as explained empty tiles.
   All six operational panels.
10. **§18 activity filters** — implement every filter the data supports; state in the UI which are
    unavailable and why. Never a filter control that silently returns everything.

## Group D — Security and logs (§25, §21, §31, §33)

11. **§25** — IP/device visibility (an admin sessions view, a flag for a session from a new IP) and
    **privileged-action confirmation** on delete organisation, manage global admins, and security
    configuration.
12. **§31** — build `PlatformSystemLog` / `PlatformSecurityLog`, or document that
    `PlatformAuditLog` covers both through severity-filtered views. Decide; don't leave it open.
13. **§21 / §33** — whatever the coverage matrix shows as partial once re-run against the full text.

## A standing rule for all of Group A–D

Every one of these adds admin UI. Every one of them is therefore subject to
`tests/platform/noStaticData.test.ts`, which you built for exactly this moment. Run it after each
group, not once at the end — it is cheaper to find a hardcoded placeholder in the commit that
introduced it.

---

# PART 3 — UNCHANGED FROM THE PHASE 9 BRIEF

These still stand and are not superseded:

- **Part 4** — the three AI-runtime test failures. Diagnose, root-cause against `git log` between
  2026-09-03 and 2026-09-09, fix in separately-labelled commits, report separately. These are the
  workflows being demoed.
- **Part 5** — the full targeted UI regression scan (never yet run in this project) and the
  route-by-route API surface diff.
- **Part 6** — every QA case re-run in a real browser, SELFRUN updated to say "browser", and the
  document extended to cover everything Part 2 adds.
- **Part 3.2** — the integration seam proofs, including the `vercel.json` cron discrepancy.

---

# PART 4 — REPORTING

**Report 2a — after Part 0 and Group A.** The re-run coverage matrix (and what moved once you had
the real document), the bridge result including the equivalence test, the `enforce.ts`
reconciliation decision, and confirmation that `moduleGate.test.ts` passes unmodified.

**Report 2b — after Groups B, C, D and Part 4's AI diagnosis.**

**Report 3 — final.** The Phase 9 stop gate with evidence, the browser SELFRUN summary, the UI scan
and API diff, and an explicit list of anything still open.

---

Two notes to carry into the build.

**The STARTER mismatch is the shape of thing to keep looking for.** Two definitions of the same
concept, both plausible, in code nobody had reason to compare. You found it because you checked
before wiring rather than after. The plan catalogue and the tier constants were the obvious pair;
there may be others between the control plane and the tenant plane — plan limits versus
`Organization.maxUsers`, AI credits versus `aiCallsPerMonth`. Check each as you touch it.

**Everything in Group A–D is additive UI over backends that already work and are already tested.**
That is a good position to be in this late. Keep the changes narrow, run the relevant existing test
file after each one, and resist the pull to tidy anything you pass on the way.
