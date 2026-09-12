# CRON_INCIDENT.md — the 2026-09-05 `vercel.json` deregistration

> Facts, not a recommendation, per `docs/admin/BRIEF-PHASE-9d-ADDENDUM.md` Part 0.1. The decision
> of whether/when to restore these schedules belongs to the user, not this session.

## The commit

```
commit b7fcdee7cdb2aace1d8d0a4f3538ad7972d6e887
Author: Krrish Singhal <krrishsinghal62@gmail.com>
Date:   Sat Sep 5 22:56:50 2026 +0530

    Cron is removed
```

No body beyond the title. It is a real, human-authored commit (not an AI session — matches the
project owner's own git identity), predating this Global Admin project by six days.

**The same commit also touched AI-runtime workflow code** — see the "AI-runtime lead" section
below, which is directly relevant to the three pre-existing failing tests.

## The eight entries removed, verbatim from the parent commit (`0b37170`)

| # | Path | Schedule | What it does |
|---|---|---|---|
| 1 | `/api/cron/crm/automations` | `0 3 * * *` (daily, 03:00) | Executes due CRM automation rules (`app/api/cron/crm/automations/route.ts`) |
| 2 | `/api/cron/crm/contract-check` | `0 4 * * *` (daily, 04:00) | Creates tasks for contracts approaching expiry/renewal |
| 3 | `/api/cron/crm/sla-check` | `0 * * * *` (**hourly**) | Checks CRM case SLAs for breaches |
| 4 | `/api/cron/sales/reminders-evaluation` | `0 5 * * *` (daily, 05:00) | Evaluates and sends sales payment reminders |
| 5 | `/api/cron/sales/subscriptions-billing` | `0 6 * * *` (daily, 06:00) | Runs due subscription billing cycles |
| 6 | `/api/cron/business-health` | `0 7 * * *` (daily, 07:00) | Generates the per-tenant AI business-health summary (`lib/ai/businessHealth.ts`) |
| 7 | `/api/cron/ai/runtime-sweep` | `0 * * * *` (**hourly**) | Sweeps pending `AiEvent` rows through the AI-runtime workflow dispatcher, bounded to 200 per run, dead-lettering exhausted retries |
| 8 | `/api/cron/ai/metrics-snapshot` | `0 2 * * *` (daily, 02:00) | Takes a per-tenant workflow-drift snapshot across all 31 AI-runtime workflows |

## What has not run on a schedule since 2026-09-05

Concretely, for each of the eight:

1. **No CRM automation rule has fired automatically** for 7 days (this route can still be triggered
   manually or by another path, if one exists — this only concerns the scheduled trigger).
2. **No contract-expiry tasks have been auto-created.**
3. **No CRM SLA breach checks have run** — this is the highest-frequency loss (hourly), so any SLA
   that breached in the last week produced no automatic detection.
4. **No sales payment reminders have been sent.**
5. **No subscription billing cycles have run automatically** — any subscription whose billing date
   fell in this window did not get billed by this path.
6. **No business-health AI summaries have been generated** since 2026-09-05.
7. **The AI-runtime event bus has not been swept on a schedule for 7 days** (hourly job). Any
   `AiEvent` enqueued and not otherwise processed synchronously has been sitting `pending` since
   whenever it was created, not stuck forever, but not moving until the next sweep.
8. **No workflow-drift metrics snapshot has been taken** for 7 days.

**Item 7 is the one that matters most for the demo.** The AI-runtime workflows described as
continuously monitoring/running depend on this sweep to process anything that wasn't already
handled synchronously. Seven days without it is seven days of accumulated, unprocessed backlog for
whatever wasn't caught another way.

## Route health — verified by calling each one locally over real HTTP

All eight routes were called against a local dev server with a valid `CRON_SECRET` bearer token.
**All eight responded `HTTP 200` and executed without error**:

```
crm/automations            → {"success":true,"executed":[]}
crm/contract-check         → {"success":true,"tasksCreated":0}
crm/sla-check               → {"success":true,"count":0}
sales/reminders-evaluation  → {"success":true,"results":[]}
sales/subscriptions-billing → {"success":true,"results":[]}
business-health             → {"success":true,"results":[]}
ai/runtime-sweep            → {"success":true,"processed":0,"deadLettered":0,"tenantsSwept":0,"schedulesDue":0}
ai/metrics-snapshot         → {"success":true,"tenantsProcessed":0,"workflowsPerTenant":31,"driftFindings":0}
```

All zero-count results are expected and uninformative about production impact — this is a local
smoketest database with no real tenant data in it, not a check of production's actual backlog.
**This verifies the code path still works, not what production actually has queued.** Checking the
real backlog requires the production database, which this session cannot reach — see "What this
session could not check" below.

`sweepPendingEvents(limit = 200)` (`lib/aiRuntime/runtime/eventBus.ts`) is bounded per call, not
unbounded — a first sweep after a long gap processes at most 200 events, not an unbounded backlog
in one request. This is real, existing behaviour (not something built for this incident) and it
means a restore is unlikely to cause a resource spike on its own, though a backlog larger than 200
events would take several sweep cycles (at the restored hourly cadence, or faster if triggered
manually) to fully drain.

## What this session could not check

This session has no access to the production database or the actual deployed Vercel project — only
this local development environment. It cannot confirm:
- The real count of `pending`/`dead_letter` `AiEvent` rows in production.
- The actual last `AiUsageDaily`/`AiUsageMonthly` rollup date in production (the platform AI-usage
  rollup cron, `/api/cron/platform/ai-usage-rollup`, is a **separate, already-registered** entry —
  not one of the 8 removed — so this specific rollup should be unaffected regardless; only the
  8 above are in question).
- Whether `SubscriptionEvent` shows a real billing gap for any tenant in production.
- Whether this `vercel.json` is in fact what is currently deployed, or whether the schedules were
  restored through some other means (a Vercel dashboard edit, a different branch) after this
  commit. **This is worth confirming directly in the Vercel dashboard before treating this as
  certainly still live** — a repo-level `vercel.json` change does not retroactively affect crons
  already registered through a previous deploy unless a new deploy picks up the emptied file.

**If production access is available, the queries a human (or a session with DB access) should run
are**: `AiEvent.countDocuments({status: "pending"})` and `.countDocuments({status: "dead_letter"})`
platform-wide; `AiUsageDaily.findOne({}).sort({period: -1})` for the last rollup date; a check of
`SubscriptionEvent` for any tenant whose expected billing date has passed with no corresponding
event.

## The AI-runtime lead (Addendum D Part 0.3)

**The same commit that removed the cron schedules also modified two of the three currently-failing
AI-runtime workflows**, per its own diff stat:

- `lib/aiRuntime/workflows/ai-21-statement-intelligence/index.ts` (11 lines changed)
- `lib/aiRuntime/workflows/ai-29-control-monitoring/index.ts` (40 lines changed)
- New test files added in this same commit: `ai13DayZeroCloseEdgeCases.test.ts`,
  `ai21StatementIntelligenceEdgeCases.test.ts`, `ai24CloseEvidenceEdgeCases.test.ts`,
  `ai28CutoffIntelligenceEdgeCases.test.ts`, `ai29ControlMonitoringEdgeCases.test.ts`

The `ai-21` change itself is a defensive fix, not an obvious regression: it validates
`event.payload.period` against a `YYYY-MM` regex before trusting it, falling back to the current
calendar month otherwise (previously any truthy value was trusted as-is, which could reach
`Date.UTC(NaN, ...)` downstream). Read alone, this looks like a real bug fix, not a bug's cause.

Full commit-history tracing for all three failing test files:

| File | Commits touching it, in order | Dates |
|---|---|---|
| `ai07AccrualIntelligence.test.ts` | created earlier; `b8843ed` "fix(ai-07): update learning-record query for the nested accrualAccuracy shape" | 2026-09-04 21:21 |
| `ai21StatementIntelligenceEdgeCases.test.ts` | created in `b7fcdee`; touched again in `fdcc711` | 2026-09-05 22:56; 2026-09-06 01:51 |
| `ai29ControlMonitoringEdgeCases.test.ts` | created in `b7fcdee`; touched in `fdcc711`, `be07fa2`, `193e13f` | 2026-09-05 22:56 → 2026-09-06 21:58 |

**`b8843ed`'s own commit message is a documented claim that turned out not to hold**: *"Full suite
now green: 154 files, 1325/1325 passing."* Something after this commit broke `ai-07` again, since
it fails now. This is the same "a stated reason/claim was wrong" pattern this phase has now found
three times (`docIntel`, the mass-data-export claim, and now this).

**Current, actual failure signatures** (re-run just now, not inferred from old notes):

```
ai07AccrualIntelligence.test.ts
  > accuracy tracking: a matching bill updates the learning store with the delta
  AssertionError: expected null not to be null

ai21StatementIntelligenceEdgeCases.test.ts
  > adversarial: balance sheet balances in total ... still flagged, never hidden
  AssertionError: expected undefined to be defined

ai29ControlMonitoringEdgeCases.test.ts
  > concurrent duplicate period.horizon.reached dispatch → exactly one AiControlResult/AiAttentionItem, not two
  AssertionError: expected [ {...}, {...} ] to have a length of 1 but got 2

ai29ControlMonitoringEdgeCases.test.ts
  > C.1 large volume: 10,000 posted journal entries ... resolve correctly within budget
  AssertionError: expected +0 to be 10000

ai29ControlMonitoringEdgeCases.test.ts
  > C.4 kill switch off: no AiControlResult or AiAttentionItem is written
  AssertionError: expected [ 12 real documents ] to deeply equal []
```

**Reading these five together**: `ai-29`'s three failures form a coherent pattern — a dedupe
mechanism producing duplicates instead of one record (concurrent-dispatch case), a volume case
producing zero processed records instead of 10,000 (something causing the whole batch to silently
no-op), and a kill-switch that writes real records when it should write none. These are three
symptoms that could plausibly share one root cause in `ai-29`'s dispatch/idempotency logic — worth
investigating as one bug, not three. `ai-21`'s single failure (an adversarial case not being
flagged) is a narrower, single-scenario gap, possibly unrelated to the `PERIOD_PATTERN` change.
`ai-07`'s failure (a null where a learning record was expected) is consistent with the exact class
of bug `b8843ed` claimed to have already fixed — worth checking whether a later commit reintroduced
the flat-shape query path, or whether the underlying `reasoned.proposal.accrualAccuracy` write path
itself regressed.

**Not yet fixed.** Diagnosing to this depth took the time available in this pass; a proper fix for
`ai-29`'s three-symptom pattern requires reading `lib/aiRuntime/workflows/ai-29-control-monitoring/`
and its dispatcher/dedupe logic in full, which is real, separate work — tracked as the next release
gate, to be done in its own clearly-labelled commit(s) per the original Phase 9 brief's Part 4
instruction, separate from any admin-control-plane work.

## What this session did NOT do

- Did not restore the 8 cron entries in `vercel.json` as part of this document — that is Part 0.2's
  separate, clearly-labelled commit, prepared but not decided.
- Did not push anything, and did not decide whether restoration should happen.
- Did not fix the three AI-runtime test failures — diagnosed to a root-cause lead, not resolved.
