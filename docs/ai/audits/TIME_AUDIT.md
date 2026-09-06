# TIME_AUDIT.md

Chunk 10a, Addendum A Part 2 (`docs/ai/BRIEF-10a-ADDENDUM.md`) — replaces the originally-planned
`TIMEZONE_AUDIT.md` (`docs/ai/BRIEF-10-PRE-QA.md` Part A) with a merged audit answering both
questions the addendum asks together, for every date expression in the system: **is this the right
clock** (wall-clock vs. tenant-period/event-time), and **is it the right zone** (UTC-consistent
regardless of the server's local timezone)?

## Methodology

Every `new Date()`/`Date.now()` call site in `lib/aiRuntime/**` (99 total) was read and classified.
Two failure classes were being hunted, both previously real in this codebase:

1. **Wrong clock** — using wall-clock "now" to decide "which period does this belong to" instead of
   the tenant's actual period state or a passed-in period boundary. The precedent: `isClosedPeriod()`
   (`lib/aiRuntime/reconciliation/definitions.ts`, fixed Chunk 10 P0.5) used to compare a period's
   calendar month against `new Date()` instead of querying `PeriodClosing.status`.
2. **Wrong zone** — mixing UTC-constructed date boundaries with local-timezone mutation methods,
   which only misbehaves on a server whose TZ offset is non-zero (this dev box: IST, UTC+5:30). The
   precedent, found *during this audit*: `lib/accounting/reports.ts`'s `toDateEnd()` (fixed below).

Wall-clock use for "when did this run happen" (an audit timestamp, "is this scheduled item due
yet" against a real calendar, a rolling forecast's own anchor) is correct and is not flagged —
flagging it would be noise, not signal (see docs/ai/BRIEF-10a-ADDENDUM.md Part 1.2's own framing).

## Part 1 — Period-boundary and period-assignment decisions (the real audit target)

Every workflow that answers "which period does this belong to" derives its boundary the same
canonical way: validate the payload's `period` (`^\d{4}-(0[1-9]|1[0-2])$`, `PERIOD_PATTERN`) or
`periodEnd`/`periodStart` (`isValidIsoInstant`, a strict ISO-8601 check), falling back to
`Date.UTC(now.getUTCFullYear(), now.getUTCMonth()+1, 0, 23, 59, 59[, 999])` for the *current*
month — never a local-time constructor, never `setHours`. This table lists every workflow that
makes this decision plus the shared services underneath it.

| Workflow / file | Decides | Wall-clock or period-scoped? | TZ-correct? | Test that pins it |
|---|---|---|---|---|
| AI-11 (`ai-11-inventory-cogs/index.ts:96`) | period + periodEnd for the sweep | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts` |
| AI-12 (`ai-12-tax-intelligence/index.ts:96`) | period + periodEnd for tax rebuild | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts` (this is the workflow the sweep itself is named for — see Part 1.1 fix below) |
| AI-13 (`ai-13-day-zero-close/index.ts:62`) | period + periodEnd for close readiness | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts`, `ai13DayZeroCloseEdgeCases.test.ts` |
| AI-14 (`ai-14-flux-analysis/index.ts:154`) | period, `monthBounds()`/`priorMonth()`/`priorYearPeriod()` for current/prior/prior-year windows | Validated payload, `Date.UTC` fallback | Yes (was the trigger for finding the `reports.ts` bug below) | `periodHorizonValidationSweep.test.ts`, `ai14FluxAnalysisEdgeCases.test.ts` |
| AI-17 (`ai-17-compliance-readiness/index.ts:64`) | period + periodEnd | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts` |
| AI-18 (`ai-18-audit-evidence/index.ts:89`) | period, feeds `annotateStatement()` (see below) | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts`, `ai18AuditEvidence.test.ts` |
| AI-19 (`ai-19-master-data/index.ts`) | n/a — subscribes to `period.horizon.reached` but never reads `event.payload.period`/`periodEnd` | Structurally inert (no date decision made) | n/a | `periodHorizonValidationSweep.test.ts` (source-grep-verified inertness claim) |
| AI-20 (`ai-20-related-party-detection/index.ts`) | n/a — `period` stored on `raw` but never read downstream | Structurally inert | n/a | `periodHorizonValidationSweep.test.ts` (source-grep-verified inertness claim) |
| AI-21 (`ai-21-statement-intelligence/index.ts:50`) | period, feeds `annotateStatement()` (see below) | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts` |
| AI-22 (`ai-22-continuous-reconciliation/index.ts:44,83-84`) | periodEnd via `isValidIsoInstant`; **`period` itself is only truthy-checked (`event.payload.period ? String(...) : fallback`), not format-validated** | periodEnd is validated/`Date.UTC`-derived; `period` label is not — see Finding T-1 below | Yes for periodEnd | `periodHorizonValidationSweep.test.ts`; no dedicated test for the `period`-label gap |
| AI-23 (`ai-23-journal-review/index.ts:49,82-84`) | periodStart/periodEnd via `isValidIsoInstant`; same `period`-label gap as AI-22 | Same as AI-22 | Yes for periodStart/periodEnd | `periodHorizonValidationSweep.test.ts` |
| AI-24 (`ai-24-close-evidence/index.ts:73`) | period + periodEnd, calls `computeCloseReadiness()` (see below) | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts` |
| AI-25 (`ai-25-working-capital-intelligence/index.ts:167`) | period + periodEnd (DSO/DPO windows) | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts` |
| AI-28 (`ai-28-cutoff-intelligence/index.ts:97`) | periodEnd via `isValidIsoInstant`, `currentPeriodEnd()` fallback | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts` |
| AI-29 (`ai-29-control-monitoring/index.ts:44,85`) | period + periodEnd | Validated payload, `Date.UTC` fallback | Yes | `periodHorizonValidationSweep.test.ts` |
| `isClosedPeriod()` (`lib/aiRuntime/reconciliation/definitions.ts`) | Whether a period is closed, for AI-22's `ap_control`/`ar_control_finance` | **Was wall-clock (fixed Chunk 10 P0.5)** — now queries `PeriodClosing.status` for the tenant/fiscalYear/month | n/a (no date comparison left, a status lookup) | `ai22ContinuousReconciliation.test.ts` (P0.5 regression, retroactively re-verified Chunk 10a Part 0.1) |
| `computeCloseReadiness()` → `checkAccrualsDomain()`/`checkPrepaidsDomain()` (`lib/aiRuntime/closeReadiness/domains.ts`) | Whether an AiSchedule reversal/recognition is "stale" for the period being closed | **Was wall-clock `new Date()` — fixed this pass (Chunk 10a Part 1.2)**, now scoped to the caller's `periodEnd` | Yes (comparison is against a `Date.UTC`-built `periodEnd`, TZ-irrelevant) | `closeReadinessAccrualsPeriodScoping.test.ts` (new, verified via revert) |
| `toDateEnd()` (`lib/accounting/reports.ts`), used by `buildPostedJournalReport()`/`getAccountTransactionDetail()`/`buildAgedPartnerReport()` | Upper bound of a report's date-range query, called by AI-05/14/21/25 and `annotateStatement()` (AI-18/21) | Not a wall-clock issue (both bounds are period-scoped, passed in by the caller) | **Was wrong — `setHours` (local) on a `Date.UTC`-built value silently widened the upper bound by up to the server's UTC offset. Fixed this pass (`setUTCHours`).** | `reportsToDateEnd.test.ts` (new, verified via revert); indirectly, AI-14's own trigger-proof test caught the live symptom |
| `annotateStatement()` (`lib/aiRuntime/statements/annotateStatement.ts`) | Calls `computeCloseReadiness()` and `buildPostedJournalReport()`-family functions for a given `period`, which is **not always "now"** — the exact path that made the `toDateEnd()` bug and the `checkAccrualsDomain()` bug both live, not theoretical | Period-scoped by design (takes `period` as a parameter, never reads wall-clock itself) | Yes, given the two fixes above | Exercised by `ai18AuditEvidence.test.ts`/`ai21StatementIntelligence.test.ts`; no test yet calls it for a genuinely historical period distinct from "now" — see `COVERAGE_GAPS.md` |

**Finding T-1 (named, not fixed this pass — a minor, pre-existing labeling gap, not a boundary bug).**
AI-22 and AI-23 validate their `periodEnd`/`periodStart` (the values actually used for every DB
query boundary) via `isValidIsoInstant`, but only truthy-check `event.payload.period` itself
(`event.payload.period ? String(event.payload.period) : fallback.period`) — a malformed truthy
`period` string (e.g. `"garbage"`) would be stored/reported as the run's period label while the
*actual* query boundaries remain correct (derived from the separately-validated `periodEnd`). This
cannot produce a wrong-period query or a crash — `period` is never re-parsed into a Date anywhere
downstream in either workflow (confirmed by reading both files in full) — but it can produce a
cosmetically wrong label in an `AiWorkflowRun`/`AiDecisionTrace` record. Named here for a future
chunk; not in scope to fix under this addendum's revert-and-test discipline, since there is no
reverting test to write against a labeling-only gap with no behavioural effect.

## Part 2 — Wall-clock uses reviewed and accepted ("when did this run happen", not "which period")

The remaining ~80 call sites among the 99 reviewed fall into these accepted categories, each
checked against the addendum's own test ("is this deciding a period, or a run-time instant?"):

| Category | Representative call sites | Why accepted |
|---|---|---|
| Audit/state timestamps | `executor.ts` (`startedAt`/`finishedAt`), `auditTrace.ts` (`finalizedAt`), every `tools/*.ts` handler's `evaluatedAt`/`placedAt`/`snapshotAt` | Records literally "when did this write happen" — never re-derives a period from it |
| "Is this scheduled item due yet" | AI-07/08/09/10's `schedule.due` handling (`today.getTime() <= p.dueDate.getTime()`), `opsHealth/detect.ts`'s stuck-record/stale-FX/overdue-schedule detectors | A schedule's own `dueDate` is a real-world calendar commitment, not a tenant accounting period — wall-clock "is it time yet" is the correct semantics, confirmed against `docs/ai/verification/AI-07.md`'s own bug history (the already-fixed month-length rollover was a *derivation* bug, not a wrong-clock one) |
| Rolling, non-period forecasts | AI-16's 13-week cash forecast anchor (`startOfDay(new Date())`) | A cash forecast is inherently "from today forward," never a closed accounting period |
| "Is this open item currently overdue" | AI-05/06's `today` for AR/AP worklists | Overdue-as-of-right-now is the correct question for an operational worklist (not a historical close snapshot) — unlike `checkAccrualsDomain()`, these are never called with a historical `periodEnd` |
| Idempotency/backoff windows | `tools/registry.ts`'s in-flight lock age, `opsHealth/repairGate.ts`'s backoff, `anomalyTools.ts`'s suppression window | Genuinely about elapsed real time, not period assignment |
| Dedupe-key differentiation, since fixed | AI-15's suppression key (Chunk 9 fix — `Date.now()` removed from the key itself, kept only in the record's own timestamp) | Confirmed the fix holds; not a live gap |

None of these categories decides "which period does this belong to" from wall-clock time, so none
required a fix under this audit's own test (Part 1 above).

## Summary

- **2 real bugs found and fixed this pass**: `checkAccrualsDomain()`/`checkPrepaidsDomain()`
  (wrong clock) and `lib/accounting/reports.ts::toDateEnd()` (wrong zone) — both with regression
  tests verified via revert (docs/ai/IMPLEMENTATION_LOG.md, Chunk 10a Part 1.2 entry).
- **1 pre-existing gap named, not fixed**: AI-22/AI-23's `period` label validation (Finding T-1) —
  cosmetic only, no boundary or crash risk.
- **1 open coverage gap named, not fixed**: no test calls `annotateStatement()` for a period
  distinct from "now" (see `COVERAGE_GAPS.md`) — the exact shape that made both real bugs
  reachable in production but invisible to the existing test suite until the three-pinned-date run.
- Every one of the 15 `period.horizon.reached` workflows' own boundary derivation is UTC-consistent
  and validated; the full suite passes at all three pinned dates (1st of a month, 31st of a 31-day
  month, 29 February of a leap year) with these fixes in place.
