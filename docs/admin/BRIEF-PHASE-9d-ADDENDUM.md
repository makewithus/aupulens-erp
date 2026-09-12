# AUPULENS — GLOBAL ADMIN, PHASE 9 ADDENDUM D
# Read alongside `BRIEF-PHASE-9-COVERAGE.md` and Addenda A, B and C.

> Report 2c accepted. The claims audit paid for itself immediately — one of four "impossible"
> claims was simply wrong, and you reclassified it rather than leaving it standing. And building
> the permission-failure alert surfacing that `requireCapability()` wasn't auditing denials
> platform-wide is the same pattern: the feature you were told to build exposed a gap in the data
> underneath it.
>
> **But the `vercel.json` finding outranks everything else in this phase.** Part 0 first.
>
> Save this to `docs/admin/BRIEF-PHASE-9d-ADDENDUM.md`.

---

# PART 0 — THE CRON DEREGISTRATION: A LIVE PRODUCTION INCIDENT

> *"`git log` on `vercel.json` shows a commit titled 'Cron is removed' from 2026-09-05 that
> deregistered 8 real, pre-existing cron jobs — CRM automations, contract/SLA checks, sales
> reminders, subscription billing, business-health, both AI-runtime jobs. The routes still exist;
> only the schedules were removed."*

You were right not to restore them unilaterally, and right to surface it. Here is what to do.

## 0.1 Quantify it before anyone decides

Produce `docs/admin/CRON_INCIDENT.md` with the facts, not a recommendation:

- The exact eight entries removed, recovered verbatim from `git show` of the parent commit —
  schedule, path, and what each route does.
- The commit hash, author, date, and full message; and whether anything else in that commit or its
  immediate neighbours touched `lib/aiRuntime/**`, `lib/sales/**`, `lib/crm/**` or `app/api/cron/**`.
- **For each of the eight, what has not happened since 5 September.** Concretely: no sales
  reminders sent, no subscription billing run, no CRM automations fired, no SLA or contract checks,
  no business-health snapshot, and — the one that matters most for the demo — **no AI runtime
  sweep and no AI usage rollup.** The AI workflows described as "continuously running" have not
  been triggered on a schedule for over a week.
- Whether each route still exists and still responds correctly to a `CRON_SECRET`-authenticated
  call. Verify by calling each one locally; a route that has silently broken while unscheduled
  would turn a restore into an incident of its own.
- Any observable evidence of the impact in the data — for instance, whether `AiEvent` rows are
  sitting `pending`, whether the last `AiUsageDaily` rollup predates 5 September, whether
  `SubscriptionEvent` shows a gap.

That last point is the difference between "the schedules are missing" and "here is what it cost."

## 0.2 Prepare the restoration; do not apply the decision

Build the fix as a **separate, clearly labelled commit on its own** — not folded into Group C or D
— containing only the restored `vercel.json` entries, verbatim from the parent commit, with any
path corrections needed for routes that have since moved. Add your two new platform crons alongside
them.

Then **stop and report.** Do not push, and do not assume the restoration should ship. The commit
that removed them has a deliberate title, and there may be a reason — a Vercel plan cron limit, a
cost decision, an incident being contained. Your user needs to decide with the facts in front of
them, and the commit being ready means the decision is a one-line answer rather than another day.

If the restoration is approved, it needs its own verification: each route called once manually,
each one's idempotency confirmed (a sweep that has not run for ten days will process a backlog on
its first execution — make sure that is safe rather than assuming it), and the AI runtime's
dead-letter behaviour checked for anything that accumulated.

## 0.3 A lead on the three AI-runtime test failures

The timing is worth chasing. `docs/ai/BASELINE_FAILURES.md` recorded zero failures on 3 September;
`ai07AccrualIntelligence`, `ai21StatementIntelligenceEdgeCases` and `ai29ControlMonitoringEdgeCases`
were failing deterministically by 9 September. The cron removal is dated 5 September, squarely in
that window.

Test failures do not usually come from a `vercel.json` change — but **whatever else that commit or
its neighbours touched might be the cause**, and you will already be reading that part of the log
for 0.1. Check it while you are there. If the same commit range touched `lib/aiRuntime/**` or the
accounting libraries those three tests exercise, you have found the root cause of a separate
release-blocking problem for free.

---

# PART 1 — TWO SMALLER ITEMS FROM YOUR REPORT

## 1.1 The data-export alert is now buildable — build it

`lib/crm/exportEngine.ts` exists; it just has no audit signal. Adding one is a thin additive hook
at the export call site, the same shape as the `master_data.changed` and `emitEvent()` hooks used
throughout both projects: wrapped so it can never throw back into the export, recording actor,
tenant, record count and export type.

Then the §28 "mass data export" condition becomes real, with a configurable record-count threshold.
That takes you to **6 of 10 alert conditions implemented**, and it is a genuine security signal —
a departing employee exporting a customer list is exactly what that alert exists to catch.

Update the matrix: the claim moves from `DECLARED_NOT_POSSIBLE` to `IMPLEMENTED`, and the audit
note should record that it was found by the 0.2 claims audit, not by the original triage.

## 1.2 `requireCapability()` now audits every denial — check the volume

Auditing every capability denial platform-wide is the right call, but it changes the write volume
on `PlatformAuditLog` in a way nothing has measured. A UI that optimistically renders a control and
gets denied, or a poller hitting a gated endpoint, could write hundreds of rows a day per admin.

Check it: exercise the admin UI as each role and count the denials generated. If a single page load
produces repeated identical denials, dedupe at the emitter (same actor, same capability, same
minute) rather than letting the audit store fill with noise — a security log nobody reads because
it is 95% routine denials is a security log that fails at its job.

Also confirm the retention policy covers these; they are `SECURITY` severity and will be the
highest-volume category in the store.

---

# PART 2 — GROUPS C AND D

Unchanged. The parts most likely to bite, briefly:

**Group C**
- §3 list must show the **resolved plan**, not the legacy tier label — list and detail disagreeing
  is the first thing QA will find after Group A's bridge.
- §7: the four remaining tabs; Storage and Monthly Revenue as labelled, explained empty states.
- §24: every KPI real data supports; the rest as explained empty tiles, never absent. All six
  operational panels — and "System Errors" now has a plausible source if 0.1's investigation turns
  up an error signal worth aggregating.
- §18: every filter the data supports; the unavailable ones stated in the UI, not silently inert.

**Group D**
- §25: IP/device visibility, and privileged-action confirmation on delete organisation, manage
  global admins, security configuration. Reuse the plan-editor confirmation pattern.
- §31: `PlatformSystemLog` / `PlatformSecurityLog`, or a documented decision that
  `PlatformAuditLog` covers both via severity views. With §28's four new security alerts and 1.2's
  denial stream, a dedicated security view is now clearly justified — I would build it.

**After each group:** clean tree, fresh-worktree build and test, `noStaticData.test.ts`, and the
relevant existing test files.

---

# PART 3 — THE RELEASE GATES

Reordered, because 0.1 changes the priorities:

1. **The cron incident** — quantified, restoration prepared, reported. Nothing else in this project
   is currently affecting production.
2. **The three AI-runtime failures** — with 0.3's lead to start from.
3. **The full targeted UI regression scan** — still never run, against ~135 touched files.
4. **The remaining integration seam proofs.**
5. **The browser SELFRUN pass** and the QA document extended to cover Groups A–D.

---

# PART 4 — REPORTING

**Report 2d — after Part 0.** Lead with the cron incident: the eight jobs, the measurable impact,
whether the routes still work, and the 0.3 lead's result. This is the report your user needs
fastest, so send it on its own rather than waiting for Groups C and D.

**Report 2e — after Parts 1 and 2.**

**Report 3 — final.** The Phase 9 stop gate with evidence, the AI-runtime diagnosis, the UI scan
and API diff, the integration seams, and the browser SELFRUN summary, plus an explicit list of
everything still open.

---

Two notes.

**The cron finding is the most valuable thing this phase has produced, and it came from an
integration check nobody expected to find anything.** The instruction in the Phase 9 brief was to
confirm your two new cron entries didn't disturb the pre-existing ones. There were no pre-existing
ones. That is worth remembering the next time a verification step feels like a formality.

**You are close.** Groups C and D are additive UI over backends that are already built, tested and
now independently verified from a clean checkout. Keep the changes narrow, run the existing test
file after each one, and let the release gates — not the feature list — decide when this is ready
for the test team.
