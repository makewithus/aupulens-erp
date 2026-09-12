# AUPULENS — GLOBAL ADMIN CONTROL PLANE
# PHASE 10 — FINAL: CRON RESOLUTION, REMAINING BUILD, FULL VERIFICATION & RELEASE

> **This is the last brief before the test team.** It answers the cron question you held on,
> finishes what is unbuilt, verifies every requirement actually *works* rather than merely exists,
> fixes everything that verification finds, and closes the release gates.
>
> Save to `docs/admin/BRIEF-PHASE-10-FINAL.md` and commit it before starting.
>
> **Work from an explicit to-do list.** Build it in your first action from Part 9's checklist,
> keep it visible, and tick items off as you complete them. Do not hold the plan in your head —
> this brief has more than fifty discrete items and the failure mode at this stage is silently
> dropping one.
>
> **Ask before acting where this brief says to ask.** Everywhere else, proceed.

---

# PART 0 — THE CRON QUESTION: ANSWERED

## 0.1 The context you were missing

The removal was **deliberate and correct**. The platform moved from Vercel Pro to the free plan,
and the free plan does not support the cron configuration this project had. `b7fcdee` was not an
accident and **must not be reverted**.

So: **close the restore commit `792a06f` without applying it.** Keep it in the branch history as a
record, or drop it — your call — but do not merge it into the working set, and update
`CRON_INCIDENT.md` to record the resolution: deliberate, plan-driven, not to be reverted.

Your instinct to prepare it and stop was exactly right. Guessing would have re-broken a deploy.

## 0.2 But the problem underneath is real and is now yours to solve

The schedules are gone and are not coming back. What that means:

**What still works without cron.** The AI runtime's event bus dispatches inline and synchronously
at emit time — a bill created still triggers AI-01, a bank import still triggers AI-03. The
event-driven half of the product is intact. Say this clearly in the incident doc, because "the AI
isn't running" is the wrong conclusion and someone will reach it.

**What has silently stopped.** Anything whose only trigger was a schedule:

| Job | What is not happening |
|---|---|
| `ai/runtime-sweep` | Pending and dead-lettered events never drain; close-horizon and hourly sweeps never fire |
| `ai/metrics-snapshot` | No drift snapshots across the AI workflows |
| `platform/ai-usage-rollup` | **The AI dashboards read rollups. They are going stale as of the last run.** |
| `platform/retention-sweep` | Audit records past retention are never deleted |
| `crm/automations`, `crm/contract-check`, `crm/sla-check` | Automation rules, contract expiry, SLA breach checks |
| `sales/reminders-evaluation` | Payment reminders never sent |
| `sales/subscriptions-billing` | Subscription billing never runs |
| `business-health` | No daily AI business-health summaries |

The AI usage rollup one matters most for the immediate demo: a dashboard showing stale or empty
numbers in front of investors is worse than one showing honest zeros.

**And the real failure here is not the missing schedules — it is that nobody could tell.** Six days
passed with eight jobs silently not running, and there was no surface anywhere that would have
shown it. That is what to fix.

## 0.3 What to build: a scheduled-work runner that does not depend on a scheduler

Build `lib/platform/scheduler/` — one module, four triggers, full visibility.

**1. A job registry.** Every scheduled job registered as data: `{jobId, description, owner,
schedule (human-readable + interval), handler, lastRunAt, lastRunStatus, lastRunDuration,
nextDueAt, isStale}`. One place that knows what is supposed to run and when it last did.

**2. A single authenticated run-due endpoint.** `POST /api/platform/scheduler/run-due`, protected
by the existing `CRON_SECRET` pattern, which runs every job currently due and returns what it ran.
**This is the integration point for any external scheduler** — a free GitHub Actions scheduled
workflow, an uptime pinger, or an ops machine. Document that in `CRON_INCIDENT.md` as the
recommended operational answer, with a ready-to-use GitHub Actions YAML file in the repo. It costs
nothing and needs no plan upgrade.

**3. Opportunistic execution on real traffic.** On requests to the platform surface, check whether
any job is due and, if so, run it in the background — with a **distributed lock** so concurrent
requests cannot double-run a job, a rate limit so a busy minute cannot trigger a storm, and
strict isolation so a failing job can never affect the request that happened to trigger it. This
is what keeps the system roughly current with zero external dependency.

**4. Manual "Run now" per job**, in the admin UI, capability-gated and audited. Genuinely useful
for a control plane regardless of the cron situation — an operator wanting yesterday's rollup
immediately should not have to wait or ask an engineer.

**5. Visibility — the actual fix.** A **Scheduled Jobs panel** on the platform dashboard showing
every job with its last run, next due, and a clear stale indicator. And a `PlatformAlert` when a
job is overdue past a configurable multiple of its interval. **Had this existed, the six days
would have been six minutes.**

## 0.4 Correctness must not depend on any of it

The single best piece of design in this project is already the model here: you made
`getActiveAccessGrant()` check expiry **live at read time**, so an access grant expires correctly
whether or not the cron ran. The cron only tidies the status field.

**Apply that standard to every scheduled job.** For each of the twelve, answer in
`docs/admin/SCHEDULED_WORK.md`: *if this never runs, is anything incorrect, or merely stale?*

- **Incorrect** → fix it so correctness is computed at read time, and the job becomes an
  optimisation. The AI usage rollup is the first candidate: dashboards should fall back to
  computing from `AiUsageRecord` when the rollup is stale, and say which they used.
- **Merely stale** → fine. Show the staleness and move on.

Nothing in this platform should be *wrong* because a scheduler did not fire.

## 0.5 Keep the Pro path one step away

Leave `vercel.json`'s cron array empty but keep a commented, ready-to-restore block — or a
`vercel.cron.example.json` — containing all twelve entries, with a note that restoring them is a
one-file change if the plan is upgraded. Note the cron-count limit consideration you already
flagged.

---

# PART 1 — THE THREE AI-RUNTIME FAILURES

Your lead was right and it is now a tractable problem: `b7fcdee` also modified
`ai-21-statement-intelligence` and `ai-29-control-monitoring` and added the failing test files.

Do this before the remaining build work — these are in the workflows being demoed.

1. **`ai-29` (three failures, likely one root cause).** You suspect a shared dedupe/dispatch bug.
   Confirm it, fix the root cause, and verify all three clear from that one fix. If they do not,
   they were three problems and you say so.
2. **`ai-21`.** Diagnose against what `b7fcdee` changed in that workflow.
3. **`ai-07`.** This one matters beyond itself. A commit dated 2026-09-04 claimed *"Full suite now
   green… 1325/1325 passing"* and the same failure shape is present now. Establish which is true:
   did it regress after that commit, or was the claim wrong when it was made? **Say which**, plainly,
   in the report. This project has now found four cases of documentation contradicting code, and
   the pattern is more useful to your user than any individual fix.

Each fix: root cause, regression test, separate commit clearly labelled as AI-runtime work so it
can be cherry-picked independently of the admin branch.

---

# PART 2 — FINISH THE BUILD

## 2.1 Group C — Surfaces

- **§3 list**: Organisation ID, Region, Usage %, and the **resolved plan** — not the legacy tier
  label. List and detail disagreeing is the first thing QA will find.
- **§7 tabs**: Modules, Configuration, Security, Billing. Storage and Monthly Revenue as labelled,
  explained empty states — present, not absent.
- **§24 KPIs**: all eighteen named. Every one real data supports; the rest as explained empty
  tiles. "System Errors" now has a plausible source in the scheduler's failure records.
- **§24 panels**: all six — Recent Organisations, Recent Subscription Changes, AI Usage Alerts,
  Security Alerts, System Errors, Recent Global Admin Actions.
- **§18 filters**: every filter the data supports; the unavailable ones stated in the UI, never
  silently inert.

## 2.2 Group D — Security and logs

- **§25**: IP/device visibility (admin sessions view, new-IP flag) and **privileged-action
  confirmation** on delete organisation, manage global admins, security configuration. Reuse the
  plan-editor confirmation pattern.
- **§31**: build `PlatformSystemLog` / `PlatformSecurityLog`, or document that `PlatformAuditLog`
  covers both via severity views. With §28's security alerts and the capability-denial stream,
  I would build the security view.

## 2.3 Outstanding items from earlier addenda

- **§28 mass data export** — add the audit signal to `lib/crm/exportEngine.ts` (thin, additive,
  never throws back into the export) and build the alert with a configurable record-count
  threshold. That takes you to 6 of 10 conditions.
- **Capability-denial audit volume** — exercise the admin UI as each role, count the denials
  generated, and dedupe at the emitter if a single page load produces repeated identical rows.
  A security log that is 95% routine denials stops being read.
- **§20** — recorded as two honestly-distinguished axes. Make sure the QA document says which one
  a tester is looking at, or they will file a bug and be right.

---

# PART 3 — VERIFY EVERY FEATURE ACTUALLY WORKS

This is the part that separates "implemented" from "ready". Everything below is verification, not
building — but expect it to generate fixes.

## 3.1 The standard

A requirement is **VERIFIED** only when all five hold:

1. It is reachable through the UI by the role the §30 matrix says should reach it.
2. It works end to end against the demo tenant, observed — not asserted.
3. It is refused for a role that should not have it, observed.
4. It handles the empty case, the missing-configuration case, and at least one bad-input case
   without an error page or a fabricated value.
5. Its data is real — no static values, no placeholders, honest empty states with stated reasons.

## 3.2 The sweep

Go through `COVERAGE_MATRIX.md` section by section, §1 to §33, and verify every row against 3.1.
Record the result per row: `VERIFIED`, `VERIFIED-WITH-LIMITS` (named), or `FAILED` (with the fix).

Give particular attention to these, because they are where cross-phase work meets and where
integration bugs live:

| Area | What to prove |
|---|---|
| §3 / §7 / §9 | The plan shown in the list, the detail tab, and the AI allocation all agree for the same organisation, before and after a plan change |
| §9 / §10 | A downgrade deletes nothing: assert document counts across tenant collections before and after |
| §10 | The bridge holds — an untouched tenant's module access is byte-identical to pre-bridge; a tenant with an explicit entitlement gets the admin's intent |
| §15 / §30 | `GLOBAL_ADMIN` is refused AI-limit configuration; `AI_ADMIN` is allowed. Both observed in the UI, not just in a unit test |
| §26 / §30 | `SUPPORT_ADMIN` cannot open an organisation's detail tabs without an active grant; can with one; loses it on expiry |
| §33 rule 8 | Suspension blocks login; reactivation restores it. Re-verify now, at the end, not only when it was built |
| §6 / §33 rule 9 | Cross-tenant reads all go through the gateway and all write an audit record, including read-only and zero-result ones |
| §27 | Retention deletes what it should, keeps what it should, and the deletion is itself audited |
| §14 | The docIntel feature tagging fix actually buckets correctly — generate a real extraction and watch it land in Document Processing |

## 3.3 Edge cases, deliberately

For each major surface, test: empty state (no organisations, no usage, no alerts), a single record,
a large set (pagination at a few hundred organisations), missing configuration (no plan, no AI
limit, no retention policy), a suspended and an archived organisation, an organisation with no
users, and one with a name containing unicode or an apostrophe.

And the adversarial question, once per area: **what input would make this show a confidently wrong
number that an operator would believe?** A usage percentage against a null allocation, a cost
computed from a missing rate, a KPI summing across a stale rollup. Test the ones you find.

## 3.4 Fix everything

Every `FAILED` row gets fixed in this phase, with a regression test, and re-verified. If something
genuinely cannot be fixed here, it moves to the QA document's known limits **in plain English**,
and into the final report's open list. Nothing gets quietly left.

---

# PART 4 — THE RELEASE GATES

1. **Full targeted UI regression scan** — still never run in this project, now against ~140
   touched files. Production build, targeted route list plus the 20-route canary plus every
   `/platform/*` route. Compare to baseline; only the four known-broken routes may fail.
2. **API surface diff, route by route** — every added route enumerated, every pre-existing route
   confirmed unchanged.
3. **Integration seam proofs** — finish `INTEGRATION.md`: middleware, auth, `Organization` additive
   fields, `isActive`, `SubscriptionEvent`, `tenantAi`, `claude.ts`, `tiers.ts`, `ActivityLog`,
   and the scheduler's new hooks.
4. **Clean tree and fresh-worktree verification** at every gate, per Addendum C.
5. **Full suite, `tsc`, `eslint`, production build** — all green, baseline unchanged.

---

# PART 5 — THE QA HANDOVER

## 5.1 Extend `GLOBAL_ADMIN_Test.md`

Cover everything Groups A–D added: plan management, custom overrides, AI limits and overage, the
four new tabs, the eighteen KPIs and six panels, the new alerts, IP/device visibility, privileged
confirmation, the security log view, and the scheduled-jobs panel with its "Run now" controls.

Same shape as the existing sections: what it does, why it matters, preconditions, numbered cases
with exact steps and exact expected results, must-not-happen, known limits, how to report.

## 5.2 Re-run every case in a real browser

Every case, old and new, clicked through the interface against the demo tenant. Update the SELFRUN
log with **"browser"** as the observation method and a screenshot for anything visual. A case that
fails: fix the product and re-run. **Never soften an expected result** — the entire value of that
document is that QA can trust its expectations.

## 5.3 The known-limits section is the one they will read first

Plain English, no jargon, every item with its reason. It must include: MRR/ARR, storage, external
API traffic, invoice/transaction search, the two AI feature buckets, email/webhook alerts, the four
unbuildable §28 conditions, §20's tenant-module axis, the `PLAN_KEY` fixed-enum resolution, and —
newly — **the scheduling situation**: what runs on events, what needs the external trigger or a
manual run, and how a tester can tell.

## 5.4 Demo data

Confirm `seed-platform-demo.ts` and `reset-platform-demo.ts` cover every new surface, and that
reset genuinely returns a broken state to a clean one. Testers will break things; that is the job.

---

# PART 6 — WHERE TO ASK FIRST

Proceed on everything except these. Ask, then continue:

- If the scheduler's opportunistic-execution design would touch tenant-facing request paths in any
  way beyond a fire-and-forget check. Adding latency to a customer's request to run a background
  job is not acceptable, and if the design drifts that way, stop and say so.
- If a fix in Part 3 would require a non-additive change to existing tenant code.
- If the `ai-07` investigation shows the 2026-09-04 "all green" claim was wrong when made — report
  that immediately rather than at the end of the phase.
- If anything in Part 3's sweep turns out to be materially larger than a fix — a whole feature that
  does not work rather than a bug in one that does.

---

# PART 7 — HOW TO REPORT

Four reports. Send each when it is ready; do not batch.

**Report A — after Part 0 and Part 1.** The scheduler, and the three AI-runtime fixes with root
causes. Include the `ai-07` verdict on the 2026-09-04 claim.

**Report B — after Part 2.** What was built, what the matrix now says.

**Report C — after Part 3.** The verification sweep: how many rows verified, how many failed, every
fix made. **This is the most important report in this brief** — it is the evidence that the
features work, not just that they exist.

**Report D — final.** The release gates with evidence, the browser SELFRUN summary, the complete
known-limits list, and an explicit statement of readiness: what the test team is receiving, what is
verified, and what is knowingly not done.

---

# PART 8 — THE RULES, UNCHANGED

1. Additive only. Nothing existing is deleted, renamed, or changed in signature.
2. No static data anywhere in the admin UI. Honest empty states with stated reasons.
3. Every privileged action audited: actor, role, tenant, session, entity, old and new value, IP,
   user agent, outcome.
4. Entitlements stay configuration, never code.
5. A plan change never deletes tenant data.
6. Audit records stay append-only.
7. Cross-tenant reads only through the gateway, always audited.
8. Timestamps in UTC, tenant timezone at presentation.
9. No sensitive data in logs — no prompts, no credentials, no bank details.
10. Full suite green before and after every commit, against the recorded baseline.
11. Clean tree and fresh-worktree verification at every gate.
12. Commit locally on `global/admin`. **Never push. Never merge to `main`.**

---

# PART 9 — YOUR TO-DO LIST

Create this as your working checklist in your first action, and work it in order.

```
CRON RESOLUTION
[ ] Close 792a06f without applying; update CRON_INCIDENT.md with the plan-driven resolution
[ ] Document what still works (inline event dispatch) vs what stopped
[ ] Build lib/platform/scheduler/: registry, run-due endpoint, opportunistic runner with lock
    and rate limit, manual Run-now, staleness alerts
[ ] Scheduled Jobs panel on the platform dashboard with last-run / next-due / stale
[ ] GitHub Actions workflow file for the external trigger, documented
[ ] SCHEDULED_WORK.md: per job, is it incorrect or merely stale without a run?
[ ] Fix every "incorrect" one to compute at read time — AI usage rollup first
[ ] vercel.cron.example.json kept ready for a plan upgrade

AI-RUNTIME FIXES
[ ] ai-29: confirm single root cause, fix, all three clear
[ ] ai-21: diagnose against b7fcdee, fix
[ ] ai-07: fix, and state whether the 2026-09-04 "all green" claim was wrong when made
[ ] Each in its own clearly-labelled commit with a regression test

BUILD
[ ] §3 list columns incl. resolved plan
[ ] §7 four remaining tabs + Storage/Monthly Revenue empty states
[ ] §24 all eighteen KPIs
[ ] §24 all six operational panels
[ ] §18 filters, with unavailable ones stated
[ ] §25 IP/device visibility + privileged-action confirmation
[ ] §31 security/system log view or documented decision
[ ] §28 mass data export audit signal + alert (6 of 10)
[ ] Capability-denial volume checked and deduped if needed

VERIFY
[ ] Every COVERAGE_MATRIX row against the Part 3.1 standard
[ ] The nine cross-phase integration checks in 3.2
[ ] Edge cases in 3.3, including the adversarial question per area
[ ] Every FAILED row fixed, regression-tested, re-verified

RELEASE GATES
[ ] Full targeted UI regression scan
[ ] Route-by-route API surface diff
[ ] INTEGRATION.md complete
[ ] Clean tree + fresh-worktree build and test
[ ] Full suite, tsc, eslint, production build green

HANDOVER
[ ] GLOBAL_ADMIN_Test.md extended to every new surface
[ ] Every case re-run in a real browser; SELFRUN says "browser"
[ ] Known limits in plain English, including the scheduling situation
[ ] Demo seed and reset cover every new surface
[ ] Final readiness statement
```

---

One closing note. This build has been unusually honest — the deferred tabs recorded rather than
hidden, the inferred matrix flagged rather than asserted, the unstaged file caught and turned into
a standing check, the cron incident found by a verification step that looked like a formality and
surfaced without a guess about what to do.

**Hold that standard through this last phase, especially in Part 3.** A verification sweep that
finds nothing has not been rigorous — it has confirmed that the tests you already wrote still pass.
Every real problem in this programme was found by someone trying to break a specific thing. Do that
one more time, and then it is ready.
