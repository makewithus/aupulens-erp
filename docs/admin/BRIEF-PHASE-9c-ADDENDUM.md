# AUPULENS — GLOBAL ADMIN, PHASE 9 ADDENDUM C
# Read alongside `BRIEF-PHASE-9-COVERAGE.md` and Addenda A and B.

> Report 2b accepted. The matrix re-run did exactly what it was supposed to do — five sections
> moved, two of them because the real document says something your fragments didn't carry, and one
> because you checked a claim instead of trusting it.
>
> Save this to `docs/admin/BRIEF-PHASE-9c-ADDENDUM.md`.

---

# PART 0 — TWO FINDINGS IN YOUR REPORT THAT NEED STRUCTURAL ANSWERS

## 0.1 The unstaged file — make commit hygiene a check, not a habit

> *"Also caught and fixed a commit-hygiene gap from Group A (a file that was on disk and tested but
> never staged.)"*

You fixed the instance. Close the class, because it is worse than it sounds: **the test suite was
passing against code that was not in the commit.** Every "706 tests passing" claim in this project
is only meaningful if the tests ran against what is actually committed. If a reviewer had checked
out Group A's commit, it would not have built.

Add two checks and run both at every phase gate from here:

1. **Clean tree.** `git status --porcelain` must be empty before you report a phase complete. Not
   "only untracked files" — empty. An untracked file is precisely the failure you just had.
2. **Fresh-checkout verification.** At each remaining gate, clone or worktree the branch into a
   clean directory, install, and run `tsc --noEmit` plus the platform test suite there. That is the
   only proof that what is committed is what was tested.

Record the result of both in `IMPLEMENTATION_LOG.md` for every remaining group. This is a five
minute check that protects every number in your reports.

## 0.2 The `docIntel` finding — audit the rest of your own claims

> *"found a real bug while checking `lib/docIntel/` — it always called the real chokepoint
> (contradicting this project's own prior doc), but never tagged its `feature`."*

This is the third time in this programme that a document asserted something the code contradicted.
Phase 4 recorded that `lib/docIntel/` "isn't instrumented through `tenantAi.ts` yet," and reported
Document Processing usage as an honest zero on that basis. The zero was real; **the stated reason
was wrong**, and the actual defect — an untagged `feature` causing silent misattribution — is more
serious than the gap that was documented, because miscounted usage is worse than absent usage.
Absent usage is visible. Miscounted usage looks correct.

So: **audit the remaining claims in your own documentation that were asserted rather than
verified.** Specifically go back through `AI_FEATURE_MAP.md`, `CAPABILITY_MAP.md` and the
`DECLARED_NOT_POSSIBLE` rows of `COVERAGE_MATRIX.md`, and for each one ask: *did someone check
this, or did someone infer it from another document?* Then check the ones that were inferred.

The four §28 conditions you just classified as "genuinely not possible" are the first place to
apply this. "No data-export feature exists" and "no error-aggregation pipeline exists" are exactly
the shape of claim that turns out to be half-true. Verify each against the code before it goes into
the handover as a permanent limitation.

Report what the audit found, including "all claims held" if that is the answer.

---

# PART 1 — §5: CLOSE THE TWO REAL GAPS

Your re-run confirmed both. The specification names them explicitly in the required-information
list, so neither is optional.

**Tax Jurisdiction.** Add it additively — `Organization.settings.taxJurisdiction` or an additive
top-level field, whichever matches how country/currency/timezone are already stored. Surface it on
the create form and on the §7 Configuration tab. Default it from country where a sensible default
exists, but let the admin override; jurisdiction and country diverge often enough to matter.

**Subscription Plan at creation time.** Today an organisation is created and a plan must be
assigned afterward, which means every new organisation exists briefly in an unplanned state. Add
plan selection to the create form and assign it **within the same flow** — calling the same
`assignPlan()` you already built, so the `SubscriptionEvent`, the audit record and the entitlement
row are all produced by the path that is already tested.

Two details worth getting right:
- If plan assignment fails after the organisation is created, do not leave a half-created tenant
  silently. Either make the sequence recoverable, or surface the partial state clearly with a
  "plan not assigned" indicator on the organisation. A quiet half-state is how support tickets are
  born.
- Default the plan selector to the organisation type's own default where the `OrganizationType`
  record defines one, so the two configuration systems agree rather than compete.

Currency and timezone auto-derived from country is fine and worth a line in the matrix saying so —
otherwise a future reader sees two spec fields with no form control and assumes they were missed.

---

# PART 2 — §20: DECIDE, THEN RECORD

You marked it `PARTIAL` rather than claiming a match, which was right. The specification's
per-organisation-type lists (SME → Accounting, Sales, Purchase, Inventory, Tax, AI, Users;
Enterprise → adds Finance, Procurement, HR, Payroll, Compliance, API, Security; and so on) are
**tenant module names**. What you built filters by platform audit category. Those are different
axes and calling them the same thing would have been the easy, wrong answer.

**Decision: implement what the data supports, declare the rest, in one pass.**

Check whether `ActivityLog` — or anything else written per-tenant — carries a module signal at all.
Your Phase 0 discovery says it is free text with a single writer, `lib/logger.ts::logActivity()`.
If a module can be derived reliably (from the writer's call site, a route prefix, or an existing
field), implement the per-type profile as a display filter on the organisation's Activity tab. If
it genuinely cannot, then §20's module-based profiles are `DECLARED_NOT_POSSIBLE` for the tenant
activity axis, and what you built — the platform audit-category profile — stands as the
implemented half.

Either way, record **both halves** in the matrix with their own status, and say plainly in the QA
document's known limits which one a tester is looking at. A tester who expects module-name filters
and finds category filters will file a bug, and they will be right to.

---

# PART 3 — §28: BUILD THE FOUR THAT ARE BUILDABLE

Your triage was good. Build these four, since the data is already captured:

| Condition | Source |
|---|---|
| Multiple failed logins | Admin login attempts; the lockout counter already exists |
| Large subscription downgrade | `SubscriptionEvent` — define "large" as configurable, default to a plan-tier drop of two or more, or any drop from an Enterprise/Business plan |
| Repeated permission failures | `PERMISSION_DENIED` audit events, per actor, over a window |
| AI cost spike | Rollups — a day's cost against a trailing average, threshold configurable |

Each one needs: a configurable threshold (never a hardcoded number), a dedupe so a sustained
condition raises one alert rather than one per occurrence, and an auto-resolve when the condition
clears. You already have that shape from the AI usage threshold crossings — reuse it, do not build
a second alerting path.

The four that are genuinely not possible — payment failure, unusual API usage, mass data export,
system error spike — go into the matrix and the QA known-limits section with their reasons, after
the 0.2 audit confirms each reason is real.

---

# PART 4 — GROUPS C AND D, AS PLANNED

Unchanged from Addendum A and B. Brief reminders of the parts most likely to bite:

**Group C**
- §3 list must show the **resolved plan**, not the legacy tier label. After Group A's bridge, list
  and detail disagreeing is the first thing QA will find.
- §7: the four remaining tabs; Storage and Monthly Revenue as labelled, explained empty states.
- §24: every KPI real data supports; the rest as explained empty tiles, never absent. All six
  operational panels.
- §18: every filter the data supports; the unavailable ones stated in the UI, not silently inert.

**Group D**
- §25: IP/device visibility, and privileged-action confirmation on delete organisation, manage
  global admins, security configuration. Reuse the confirmation pattern from the plan editor.
- §31: `PlatformSystemLog` / `PlatformSecurityLog`, or a documented decision that
  `PlatformAuditLog` covers both via severity views. With §28's new security alerts landing, a
  security log view is now easier to justify than it was.

**After each group:** clean-tree check (0.1), `noStaticData.test.ts`, and the relevant existing test
files. In the commit that introduced the change, not at the end.

---

# PART 5 — THE RELEASE GATES, STILL OUTSTANDING

These have been carried across three addenda now. None of them is build work; all four are what
stands between this branch and the test team.

1. **The three AI-runtime failures** — `ai07AccrualIntelligence`,
   `ai21StatementIntelligenceEdgeCases`, `ai29ControlMonitoringEdgeCases`. Diagnose, root-cause
   against `git log` between 2026-09-03 and 2026-09-09, fix in separately-labelled commits, report
   separately. These are in the workflows being demoed.
2. **The full targeted UI regression scan** — still never run in this project, against ~130 touched
   files. Production build, targeted route list plus the 20-route canary plus all `/platform/*`.
3. **The integration seam proofs**, including the `vercel.json` cron discrepancy — if the
   pre-existing crons really are unregistered, scheduled jobs are not running in production.
4. **The browser SELFRUN pass** — every QA case clicked through a real browser, SELFRUN updated to
   say "browser", and the document extended to cover everything Groups A–D added.

If time gets tight, that is the order I would do them in. Number 1 affects the demo; number 2
protects the existing product; number 3 may be a live production issue; number 4 is the handover.

---

# PART 6 — REPORTING

**Report 2c — after Parts 0–3.** The claims audit result (including "all held" if that is the
answer), §5 closed, the §20 decision, and the four new alert conditions.

**Report 2d — after Groups C and D.**

**Report 3 — final.** The Phase 9 stop gate with evidence, the AI-runtime diagnosis, the UI scan
and API diff, the integration seams, and the browser SELFRUN summary. Plus an explicit list of
everything still open, which is the section the test team will read first.

---

A note on the `docIntel` catch, because it is the most valuable thing in Report 2b and the easiest
to under-weight. A documented gap with a wrong reason is more dangerous than an undocumented gap,
because it stops anyone from looking again. You found it by checking a claim while doing adjacent
work — the same way the AI-11 false-completion was found in the previous project. That is twice
now that the thing nobody would have caught was caught by someone verifying rather than trusting.
Part 0.2 exists to make that deliberate instead of lucky.
