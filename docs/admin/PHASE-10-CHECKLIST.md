# Phase 10 working checklist

> Source: `docs/admin/BRIEF-PHASE-10-FINAL.md` Part 9. Updated as work proceeds.

```
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
