# Resource Optimization Remediation — AI Outbox Final (G6)

## Design
`safeEmitEvent()` never runs workflows in a user request; it writes a durable `AiEvent{status:pending}`. A single sweep implementation (`lib/aiRuntime/runtime/sweepJob.ts::runAiRuntimeSweep`) is used by BOTH the scheduler job (`ai-runtime-sweep`) and `/api/cron/ai/runtime-sweep` — the earlier duplicate/incompatible paths (route inline-dispatch vs registry `dispatchInline:false`, 50/45 s vs 200/240 s) are gone.

| Requirement | Implementation | Test |
|---|---|---|
| Business tx + event consistency | Inside `withAccountingTransaction` the row is written in the **same MongoDB transaction** (mongoose `transactionAsyncLocalStorage`); commit ⇒ both, rollback ⇒ neither; a failing insert **aborts** the business transaction. Outbox collection is pre-created before any transaction (`outboxReady.ts`) — found by the QA GST test ("catalog changes" write conflict). | commit / rollback / insert-failure-aborts-tx |
| Producers outside a tx | Single-doc CRUD cannot be atomic. 3 retries, structured `console.error` JSON, in-process counters (`getOutboxInsertFailures`), **not rethrown** (throwing after a committed write would make clients retry and duplicate the record). Residual gap, see risks. | retry succeeds / exhausted+counted+logged / critical vs non-critical |
| Duplicates | idempotent upsert on the unique `{tenantId,eventKey,dedupeKey}` index (does not abort an enclosing tx) | 10 concurrent same-key; duplicate inside one tx |
| Atomic claim | `findOneAndUpdate` flips to `processing`, sets `workerId`, `leaseUntil`, `processingStartedAt`, `$inc attempts` | 4 concurrent sweeps × 60 events: each claimed once; two simultaneous claims → one winner |
| Lease recovery | expired-lease `processing` rows are re-claimable (also legacy rows with no lease); final-attempt expired ⇒ `dead_letter`; outcome writes are **fenced** on `workerId` | crash → not double-run before expiry → reclaimed after; legacy; final attempt |
| Retry/backoff | `30 s · 2^(n−1)` capped at 1 h (`AI_EVENT_BACKOFF_*`); `nextAttemptAt` honoured by the claim | not retried early; second delay longer |
| Max retries / DLQ | `MAX_ATTEMPTS=5` ⇒ `dead_letter` + `deadLetteredAt` | 5 failures ⇒ DLQ, never re-claimed |
| Monitoring | `computeOutboxMetrics` (pending, failed, processing, expired leases, dead letters, oldest age, retried, processed/h, avg/max duration, insert failures); `checkOutboxHealth` raises/auto-resolves deduped `ai_outbox_backlog` / `ai_outbox_stale` platform alerts; sweep result carries backlog + age + duration | metrics, stale alert dedupe+resolve, backlog alert |
| Cron auth | Bearer `CRON_SECRET`, unset ⇒ 401 | missing / wrong / unset |
| Time budget / bursts | budget checked before each claim; 300-event burst drains in bounded sweeps | slow-workflow budget; burst |
| Idempotent workflows | executor already de-dupes on `{workflowId, triggerEventId}` (unique index) | duplicate delivery ⇒ one `AiWorkflowRun` |

Tests: `tests/resourceOptimization/aiOutbox.test.ts` (22).

## Cadence & throughput
Job interval is now 5 min, which in practice means **every external scheduler tick (≤ 15 min)**; time-based triggers (`ai.sweep.hourly`, `period.horizon.reached`) stay hourly via their `dedupeKey`, and `schedule.due` now has a `scheduleId:nextRunDate` dedupeKey (it previously re-emitted on every run). Batch/budget are env-tunable (`AI_SWEEP_LIMIT` 200, `AI_SWEEP_BUDGET_MS` 45 000). **These defaults are NOT derived from measurement**: no real workflow timing, Vercel limit or traffic profile was available. Measure `avgProcessingMsLastHour`/`oldestPendingAgeMs` in staging before changing them.

## What is NOT proven
- **"Events cannot be lost" is proven only for transactional producers.** Producers outside a transaction (e.g. `master_data.changed`, `document.received`, `expense.submitted`, `asset.created`, bank import) can still lose an event if the DB fails right after the business commit; this is logged/counted but there is no durable fallback. Recovery relies on the hourly continuous workflows re-deriving state. I did not enumerate which of the ~16 producer call sites actually run inside `withAccountingTransaction`.
- **Workflow idempotency for 31 workflows was not audited individually.** The executor-level de-dupe prevents re-running a completed `{workflow,event}`. A worker that crashes mid-run leaves an `AiWorkflowRun` in `running`; a replay returns it unchanged and the event is marked processed, i.e. the interrupted run is not resumed. External side effects inside `act()` were not reviewed.
- `insertFailures` is process-local; a DB outage cannot persist its own failure record.
- Tests ran on a single-node replica set, not under production concurrency or Vercel timeouts.

**Status: INCOMPLETE** for the stated acceptance wording (persistence/claim/lease/backoff/DLQ/monitoring = implemented and tested; non-transactional producers, per-workflow idempotency and measured cadence = open).
