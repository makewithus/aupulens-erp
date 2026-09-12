# Phase 10 working checklist

> Source: `docs/admin/BRIEF-PHASE-10-FINAL.md` Part 9, plus `docs/admin/BRIEF-PHASE-10a-ADDENDUM.md`
> Part 0's "add it now, at the top" instruction. Updated as work proceeds.

```
ADDENDUM A — PART 0: KILL-SWITCH BYPASS CLASS-DEFECT (done before everything below)
[x] Enumerate all 30 workflows from the live registry (not hand-written) into
    docs/ai/audits/KILLSWITCH_AUDIT.md with autonomy/writes/exempt/verdict columns
[x] Fix structurally: dispatch gate now keys off a declared `performsWrites` field, not
    declared autonomy level (lib/aiRuntime/runtime/eventBus.ts)
[x] All 19 real-writer workflows declare performsWrites: true (9 originally-bypassed +
    10 already-correctly-gated-by-autonomy that the field-only gate would have newly
    exempted — caught by the structural test before commit, see KILLSWITCH_AUDIT.md)
[x] Structural test tests/ai/aiRuntime/killSwitchCoverage.test.ts: asserts over the
    registry that no workflow reaching a write tool is undeclared, and vice versa
[x] Part 0.3: checked whether the same short-circuit defeats decideAutonomy()'s
    policy.maxAutonomyLevel clamp — real gap for RECOMMEND-declared writers, but
    currently inert (no act() consumes decision.autonomyApplied); recorded as
    OPEN_QUESTIONS.md #37, not fixed speculatively
[x] Reported separately, own [AI-runtime] commit, cherry-pickable
[ ] Golden-dataset suite run across every workflow that has one (Addendum A Part 1) —
    "one command and a report," pass rate to be reported
[ ] docs/ai/README.md or DECISIONS.md: "four documented claim failures" section
    (Addendum A Part 3) plus the two checks that now prevent them

ADDENDUM A — PART 2: CRM SLA-BREACH ITEM (do not fix; mitigate + record)
[x] SCHEDULED_WORK.md already records the precise incorrect behaviour (not merely stale)
[ ] Confirm the Scheduled Jobs panel surfaces crm/sla-check staleness clearly — it is
    already covered generically by getJobStatuses()/the panel, verify explicitly rather
    than assume
[ ] Add to the final report's open list as a recommended CRM-owner follow-up

CRON RESOLUTION
[x] Close 792a06f without applying; update CRON_INCIDENT.md with the plan-driven resolution
[x] Document what still works (inline event dispatch) vs what stopped
[x] Build lib/platform/scheduler/: registry, run-due endpoint, opportunistic runner with lock
    and rate limit, manual Run-now, staleness alerts
[x] Scheduled Jobs panel on the platform dashboard with last-run / next-due / stale
[x] GitHub Actions workflow file for the external trigger, documented
[x] SCHEDULED_WORK.md: per job, is it incorrect or merely stale without a run?
[x] Fix every "incorrect" one to compute at read time — AI usage rollup first (CRM SLA case
    identified as also-incorrect but flagged-not-fixed, see SCHEDULED_WORK.md)
[x] vercel.cron.example.json kept ready for a plan upgrade

AI-RUNTIME FIXES
[x] ai-29: NOT a single root cause — 3 separate bugs, all fixed and re-verified together
[x] ai-21: diagnosed against b7fcdee — a test bug, fixed
[x] ai-07: fixed; the 2026-09-04 "all green" claim most likely did not hold at the time
[x] Each in its own clearly-labelled [AI-runtime] commit with a regression test

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
