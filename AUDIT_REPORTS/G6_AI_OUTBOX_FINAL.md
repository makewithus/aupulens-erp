# G6 — AI Outbox Reliability (Final)

**Status: PASS for event persistence and recovery (with stated limits). INCOMPLETE for per-workflow side-effect idempotency (31 workflows).**

## Producers (19 call sites in `app/` and `lib/`)
| Producer | Transaction? | Loss window before | Now |
|---|---|---|---|
| `lib/accounting/posting.ts` (`journal.posted`), `finance/assets` (`asset.created`) | **Yes**, same Mongo transaction as the business write | none | unchanged: commit ⇒ both, rollback ⇒ neither; an insert failure aborts the business transaction |
| `invoice.created` (`finance/invoices`), `expense.submitted`, `bank.transaction.imported`, `document.received` | No (single-document CRUD) | event lost if DB fails right after commit | **deterministic `dedupeKey` (`created:<id>`) + reconciler** |
| `master_data.changed` on **create** for Customer, Employee, BankAccount, Vendor | No | same | **same fix** |
| `master_data.changed` on **update** (customers/[id], employees/[id], bank-accounts/[id], vendors PUT) | No | same | **not reconciled** (an update is not derivable from a document). Retried 3× then logged + counted; hourly workflows re-derive state |
| `bill.created` (`lib/docIntel/billCreate.ts`) | No | same | **not reconciled**: vendor bills are `Invoice(moveType=in_invoice)` created by several routes, so deriving `bill.created` would also fire for bills this producer never emitted. Retried + logged + counted |
| Sweep-generated (`ai.sweep.hourly`, `period.horizon.reached`, `schedule.due`) | n/a | n/a | already deduped by time bucket / schedule+due date |

## Recovery mechanism (new): `lib/aiRuntime/runtime/reconcile.ts`
Inside the existing `ai-runtime-sweep` job (no 14th job; the 13-job registry is unchanged), per active tenant and per source, read documents created in the last 3 h (`AI_RECONCILE_LOOKBACK_MS`) by `_id` range (ObjectIds embed creation time, so no new index) and `bulkWrite` upserts with `$setOnInsert` on `{tenantId,eventKey,dedupeKey}`. Existing events, processed or dead-lettered, are untouched; recovered ones are logged as a structured warning with counts and returned in the sweep result (`reconciledEvents`, `reconcileError`). A reconciler failure is logged and reported, not swallowed, and does not stop the drain. Recovered events carry no `actingUserId`, so workflows run them observe-only (their permission gate fails closed).

**Limits:** (a) events not covered above remain at-most-once with log/counter; (b) at first deploy, documents created in the previous 3 h whose events were emitted with the old random keys get one extra event each (workflows de-dupe per `{workflow,event}`, so a single duplicate analysis, no data change); (c) lookback must exceed the worst scheduler gap (observed max 39 min vs 3 h); (d) per-sweep cost is NOT MEASURED (index-friendly `_id` range per tenant per source, but tenants × 8 sources queries every tick).

## Crash mid-run (new)
A run left `RUNNING` by a crashed worker could previously be replayed as "already exists", marking the event processed, i.e. silent loss of an interrupted run. Now a stale `RUNNING` run (> `AI_RUN_STALE_MS`, default 10 min) is marked `FAILED`, the event fails, retries with backoff and dead-letters after 5 attempts for an operator. It is **never re-executed automatically** (partial financial side effects cannot be assumed idempotent). A fresh `RUNNING` run is left alone.

## Verified (tests in `tests/resourceOptimization/aiOutbox.test.ts` 25, `outboxReconcile.test.ts` 5, `outboxTransactionBoot.test.ts`)
Atomic claim under 4 concurrent workers × 60 events; lease expiry/recovery incl. legacy rows and final attempt; fenced outcome writes; backoff doubling/cap; max attempts → dead letter; duplicate events (10 concurrent same key; duplicate inside a transaction); completion and failure transitions; tenant isolation (reconciler never writes to another tenant); backlog metrics and deduped stale/backlog alerts; DB-failure paths (outside-tx retry+count+log, in-tx abort, **reconciler error surfaced and next run recovers**); recovery of 1,200 documents in batches; idempotency of reconciliation. **Runtime** (production build, disposable DB): a customer created via the live API wrote `created:<id>`; a customer inserted behind the API's back (simulated lost event) was recovered by the cron sweep (`reconciledEvents: 1`) and processed.

## NOT verified
* Idempotency of `act()` side effects in each of the 31 workflows was **not audited**. Executor-level protection (unique `{workflowId, triggerEventId}`) prevents a second run for the same event, and interrupted runs are no longer replayed, but whether each workflow's writes are individually safe on partial completion was not reviewed.
* Sweep cadence/batch/budget remain unmeasured defaults.
* Real Vercel timeouts.
