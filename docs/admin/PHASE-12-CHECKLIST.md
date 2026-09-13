# Phase 12 working checklist

> Source: `docs/admin/BRIEF-PHASE-12-FINAL.md` Part 11, built as the first action per the brief's
> instruction. Worked in Part 9's strict priority order (seed/re-triage → verify → test guide P1 →
> UI regression scan → final status table → quality polish → performance), since this is
> explicitly the last session and Part 9 governs what happens if time runs short.

```
SEED & RE-TRIAGE (Part 0)
[x] MRR/ARR from real plan prices, labelled "contracted, not collected" — dashboard KPI, batched
    (not resolveEntitlements() per org), reuses bridgeTierToPlanKey() so it can't disagree with
    the Subscription tab; a real "suspended org's price excluded" test guards the active-only sum
[x] Storage Used — lib/upload.ts::uploadToCloudinary() now fires a non-blocking POST to
    /api/uploads/track after a real upload succeeds (server derives tenantId from its own
    session, never trusts the client); a new StorageUsage per-tenant counter backs both the §7
    Usage tab (against the plan's storageGb limit) and the §24 KPI (platform-wide sum)
[x] System error spike alert wired to scheduler job failures — new SYSTEM_ERROR_SPIKE alert type,
    distinct from the pre-existing per-job SCHEDULER_JOB_FAILED; a gauge threshold (N jobs
    simultaneously failing), not a rolling-window count, since SchedulerJobRun holds only current
    state; checked after every runDueJobs() pass
[x] Invoice/transaction search re-checked; built — the earlier "no platform-level invoice
    concept" claim was wrong, not imprecise: models/finance/Invoice.ts (name) and
    models/sales/SalesInvoice.ts (number) are real, tenant-scoped invoice records, now searched
    exactly like every other cross-tenant type
[ ] Webhook alert delivery built; email left as a configurable adapter
[ ] Demo seed extended per 0.3, including one deliberately empty organisation
[ ] reset-platform-demo verified from a broken state

VERIFY (Part 5) — THE PRIORITY
[ ] Every matrix row against the five-point standard; second status column added
[ ] Nine cross-cutting checks
[ ] Edge-case matrix per surface
[ ] Adversarial question per screen
[ ] Every failure fixed, regression-tested, re-verified

TEST GUIDE (Part 4)
[ ] GLOBAL_ADMIN_TEST.md — front matter + every feature area, clickable steps, specific
    expected results, false-positive and permission cases, priorities
[ ] Every case run in a browser; SELFRUN log written
[ ] Known limits in plain English

RELEASE GATES (Part 6)
[ ] UI regression scan (first time ever)
[ ] API surface diff; INTEGRATION.md, HARD_RULES.md, PERFORMANCE.md complete
[ ] noStaticData clean; clean tree; fresh worktree; suite/tsc/eslint/build green
[ ] Golden-dataset pass rate; four-claim-failures section

QUALITY (Parts 2-3)
[ ] Theme matched; four states everywhere; usability checklist; sidebar reorganised
[ ] Timezone display verified on every surface
[ ] Performance measured at scale; breaches fixed

SIGN-OFF (Part 7)
[ ] FINAL_STATUS.md with the exact table and five sections
[ ] Merge notes (Part 10)
```

## Part 9 priority order (if time runs short, stop at a clean commit and say exactly where)
1. Part 0.2 re-triage and 0.3 seeding
2. Part 5's verification sweep and every fix it produces
3. Part 4's test guide, P1 cases, browser-verified
4. Part 6's UI regression scan
5. Part 7's final status table
6. Part 2's UI polish
7. Part 3's performance measurement
