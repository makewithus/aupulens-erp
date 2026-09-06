# FAILURE_MODES.md

Chunk 10a, Addendum A Part 2 (`docs/ai/BRIEF-10a-ADDENDUM.md`), as specified unchanged from
`docs/ai/BRIEF-10-PRE-QA.md` Part A: for every workflow that writes, what happens when the run dies
between `act()` and `verify()`? One row per workflow: what has been written at that point, whether
it is recoverable, and the test that proves no unsafe partial state survives.

## Method

The executor (`lib/aiRuntime/runtime/executor.ts`) never rolls back a write `act()` already made if
the process then dies before `verify()`/`learn()` complete — whatever was written is committed. A
write is genuinely retry-safe only if either (a) `rt.callTool()` was called with a stable
`idempotencyKey`, which engages `AiToolCall`'s real `{tenantId, toolName, idempotencyKey}` unique
index (the actual cross-process lock, in `lib/aiRuntime/tools/registry.ts`), or (b) the tool's own
handler is naturally idempotent regardless (an upsert / `findOneAndUpdate` / compare-and-swap on a
natural key). Where neither is true, a workflow re-run after a mid-`act()` crash will genuinely
duplicate a document — every such case is named explicitly below, not glossed over.

**Cross-cutting structural finding (AI-07, AI-08, AI-10 — `post_journal`,
`lib/aiRuntime/tools/scheduleWriteTools.ts`)**: `post_journal`'s handler does an atomic
`findOneAndUpdate` compare-and-swap flipping an `AiSchedule` period from `pending` → `drafted`
*before* creating the real `JournalEntry` and saving `posted`/`recognisedToDate`. A crash between
that CAS and the final save leaves the period permanently stuck at `drafted` with no journal entry
ever created — and no retry recovers it (`PeriodAlreadyPostedError` fires on any subsequent attempt,
since the guard only accepts `periods.status: { $ne: POSTED }`, and this period is now stuck at
`drafted`, neither `pending` nor `posted`). This is a genuine, undetected, manual-intervention-only
stuck state. **No test in AI-07, AI-08, or AI-10's suites exercises this exact window.**

## Per-workflow table

| Workflow | Writes in `act()` | Independent or all-or-nothing | Idempotent on retry | Recovery test |
|---|---|---|---|---|
| AI-01 (document-ingestion) | Two: `draft_bill`, `link_evidence` | Independent — mid-crash leaves a valid, non-corrupt intermediate state (Invoice exists, not yet evidence-linked) | Yes — both via stable `idempotencyKey` | "same bill submitted twice → second run creates no second Invoice" (`ai01DocumentIngestion.test.ts`); C.3 concurrent-duplicate test (`ai01DocumentIngestionEdgeCases.test.ts`) |
| AI-02 (ledger-classification) | One: `set_draft_account` | n/a | Yes — `idempotencyKey` + handler only mutates a still-`draft` record | "idempotency: the same trigger event twice... sets the account once" (`ai02LedgerClassification.test.ts`) |
| AI-03 (bank-reconciliation) | Multiple, per bank line: `reconcile_transaction` or `draft_journal` | Independent per line | Yes, but **only via the `AiToolCall` lock** — `reconcileTransactionHandler` itself unconditionally `create`s a new row every call, with no natural guard of its own | "re-running the sweep never double-reconciles an already-matched line" (`ai03BankReconciliation.test.ts`) + C.3 |
| AI-04 (expense-intelligence) | Zero | n/a | n/a | "idempotency: the same trigger event twice produces exactly one run" (`ai04ExpenseIntelligence.test.ts`) — run-level only, correctly, since there is no per-write state |
| AI-05 (receivables-operations) | Multiple, independent per candidate/entry: `open_dispute`/`draft_receipt_allocation` per allocation, `draft_communication`+optional `create_task` per worklist entry | Independent | Mostly yes; `draft_receipt_allocation`'s handler has **no natural guard of its own** (appends to an array / decrements a balance) — safety is 100% the `idempotencyKey` lock | "concurrent duplicate `ai.sweep.hourly` dispatch → exactly one allocation on the same draft payment" (`ai05ReceivablesOperationsEdgeCases.test.ts`) |
| AI-06 (payables-operations) | Multiple: `create_task`/`draft_match_annotation` per bill (match mode), `record_payment_run_proposal` once per sweep | Independent | `draft_match_annotation` doubly safe (key + handler just overwrites one field); **`record_payment_run_proposal`'s handler is a plain `create()` with no natural guard — safety is entirely its date-scoped `idempotencyKey`** | "concurrent duplicate `bill.created` dispatch → exactly one match annotation write" (`ai06PayablesOperationsEdgeCases.test.ts`) — covers `draft_match_annotation` only; `record_payment_run_proposal`'s own retry behavior is untested |
| AI-07 (accrual-intelligence) | Multiple across 3 modes: `post_journal`/`draft_journal`+`link_schedule_draft` per period (reversal), `draft_accrual` per PO line, zero in `accuracy_check` mode | Independent per period/line | Yes via per-call `idempotencyKey`s, subject to the cross-cutting `post_journal` finding above | **None found** — no `ai07*.test.ts` file contains an idempotency/C.3/retry/double-write test |
| AI-08 (prepaid-schedule) | Multiple: `post_journal`/`draft_journal`+`link_schedule_draft` per period (execute mode), one `draft_prepaid_schedule` (detect mode) | Independent per period | Yes, subject to the cross-cutting `post_journal` finding | **"schedule.due run twice → the period only drafts once (compare-and-swap idempotency)"** (`ai08PrepaidSchedule.test.ts`) — the clearest explicit retry-safety test in the suite |
| AI-09 (revenue-recognition) | Multiple: `draft_journal`+`link_schedule_draft` per due period, `draft_prepaid_schedule` per new schedule | Independent per order/period | Yes via `idempotencyKey`s | "concurrent duplicate `schedule.due` dispatch → exactly one drafted journal" (`ai09WorkflowEdgeCases.test.ts`) |
| AI-10 (fixed-asset) | Multiple: one `draft_depreciation_schedule` (init), `post_journal`/`draft_journal`+`link_schedule_draft` per period (depreciation run) | Independent per period | Yes, subject to the cross-cutting `post_journal` finding | "asset.created run twice → exactly one depreciation schedule" (`ai10FixedAsset.test.ts`) + C.3 |
| AI-11 (inventory-cogs) | One: `record_inventory_findings` | n/a | Yes, naturally — `findOneAndUpdate` upsert on `{tenantId, period}`, no key needed | **None found** |
| AI-12 (tax-intelligence) | One: `rebuild_tax_projection` | n/a | Yes, naturally — full `deleteMany`+`insertMany` replace; a crash mid-rebuild self-heals on the next call since source data is untouched | "rebuild is idempotent — running it twice on the same source data produces identical rows" (`ai12TaxIntelligence.test.ts`) |
| AI-13 (day-zero-close) | Zero — any auto-resolution triggers the *owning* workflow's own event, never a direct AI-13 write | n/a | n/a | Run-count-only: "the same triggerEventId fired concurrently twice still produces exactly one AiWorkflowRun and one AiCloseState" (`ai13DayZeroCloseEdgeCases.test.ts`) |
| AI-14 (flux-analysis) | Zero — read-only by construction, no write tool exists | n/a | n/a | None needed |
| AI-15 (anomaly-detection) | Multiple, one `record_anomaly` per detected anomaly | Independent per anomaly | Yes — deterministic `idempotencyKey` (`ai-15-anomaly:{detectorId}:{suppressionKey}:{subjectId}`), fixed from a real prior bug where `Date.now()` in the key defeated the idempotency store | "C.3 duplicate event... produces exactly ONE AiAnomaly row" + "C.3 concurrent runs... exactly ONE AiAnomaly row" (`ai15AnomalyDetectionEdgeCases.test.ts`) |
| AI-16 (cash-intelligence) | Zero — OBSERVE only, no write tool exists | n/a | n/a | None needed; explicitly stated "not applicable" in its own test |
| AI-17 (compliance-readiness) | Zero in `act()` itself — escalations created generically by the executor from findings | n/a | n/a | "C.3 concurrent duplicate `period.horizon.reached` dispatch → exactly one AiAttentionItem per registration gap" (`ai17ComplianceReadinessEdgeCases.test.ts`) — proves the executor's own generic path is dedup-safe |
| AI-18 (audit-evidence) | One: `record_evidence_pack` | n/a | Yes, naturally — `findOneAndUpdate` upsert on `{tenantId, packId}` | **None found** targeting write-retry (only a pure-function determinism test exists) |
| AI-19 (master-data) | Multiple: `place_hold` per bank-field diff, `record_master_data_profile` (aggregated or per-vendor) | Independent | `place_hold` yes via `idempotencyKey: ai19-hold:{model}:{recordId}`, added to close a real found race (the handler's own `findOne`-then-`create` has no unique constraint); `record_master_data_profile` naturally idempotent via upsert | "concurrent duplicate event: two genuinely simultaneous `master_data.changed` runs... place exactly one hold" (`ai19WorkflowEdgeCases.test.ts`) |
| AI-20 (related-party-detection) | Zero — act() makes no tool calls | n/a | n/a | Explicitly addressed as not-applicable, with reason, in its own test (`ai20RelatedPartyDetectionEdgeCases.test.ts`) — the cleanest explicit N/A statement in the suite |
| AI-21 (statement-intelligence) | Zero — both tools are read/analyse only, asserted structurally | n/a | n/a | None needed/found |
| AI-22 (continuous-reconciliation) | Zero — OBSERVE only, never writes | n/a | n/a | None targeting a write (a documented, unfixed executor-level race test exists, run-count only) |
| AI-23 (journal-review) | Zero — `score_journal_risk` is analyse-only, no write tool exists | n/a | n/a | **"C.5 tool failure: `score_journal_risk` throwing mid-run fails the run cleanly, with no partial findings persisted"** (`ai23JournalReviewEdgeCases.test.ts`) — the single most directly-on-point "no partial state" test in the codebase |
| AI-24 (close-evidence) | Multiple, independent per assertion: `create_task`/`resolve_task`, then `record_close_assertion` | Independent | Yes, both naturally — `dedupeKey` upsert and `findOneAndUpdate` upsert on `{tenantId, period, item}`; no `idempotencyKey` needed | "the same triggerEventId fired concurrently twice... no duplicate AiAttentionItem" (`ai24CloseEvidenceEdgeCases.test.ts`) |
| AI-25 (working-capital-intelligence) | Zero — read-only by construction | n/a | n/a | None needed |
| AI-26 (accounting-policy) | Multiple: 0–1 `record_accounting_policy`, one `record_policy_findings` per run | Independent | `record_accounting_policy` yes via unique `{tenantId, policyKey}` upsert; **`record_policy_findings` is a plain `create()` with no `idempotencyKey` — not idempotent** | "concurrent runs... do not create two AiAccountingPolicy documents" (`ai26WorkflowEdgeCases.test.ts`) — covers `record_accounting_policy` only; `record_policy_findings`'s own duplication risk is untested |
| AI-27 (duplicate-detection) | Multiple: `place_hold` per candidate/finding, one `record_duplicate_findings` per run | Independent | `place_hold` yes via `idempotencyKey` (same fixed race class as AI-19); **`record_duplicate_findings` is a plain `create()` with no `idempotencyKey` — not idempotent** | "concurrent duplicate event... place exactly one hold" (`ai27WorkflowEdgeCases.test.ts`) — covers `place_hold` only; `record_duplicate_findings`'s duplication risk is untested |
| AI-28 (cutoff-intelligence) | Zero — RECOMMEND only, drafts nothing | n/a | n/a | None needed (a documented, unfixed executor-level race test exists; no per-workflow write to protect) |
| AI-29 (control-monitoring) | Multiple, independent per control: `record_control_result`, optional `create_task` (design concern) | Independent | Both naturally — upsert on `{tenantId, controlId, period}` and `dedupeKey` upsert; no `idempotencyKey` needed | "concurrent duplicate dispatch → exactly one AiControlResult and one AiAttentionItem per control" (`ai29ControlMonitoringEdgeCases.test.ts`) **and** "remediation cannot be self-closed by the AI — re-running with unchanged data leaves the exception task open" (`ai29ControlMonitoring.test.ts`) — a genuine re-run correctness test, not just concurrency |
| AI-30 (erp-operations) | Multiple, independent: per-issue repair calls, one best-effort `record_operations_findings` per sweep | Independent | Repairs yes, via `repairGate`'s own repair-log check; each repair wrapped in try/catch so one failure can't abort the sweep (a documented prior fix); **`record_operations_findings` is a plain `create()` with no `idempotencyKey` — not idempotent** | "a repair that fails twice escalates and is never retried again (retry cap + backoff)" (`ai30ErpOperations.test.ts`) — covers repair-gate idempotency only; `record_operations_findings`'s duplication risk on re-run is untested |

## Summary for QA prioritization

**Zero writes (11 of 30) — no recovery risk by construction**: AI-04, AI-13, AI-14, AI-16, AI-17,
AI-20, AI-21, AI-22, AI-23, AI-25, AI-28.

**Untested duplicate-on-retry gap** (a write with no `idempotencyKey` and no natural upsert — a
plain `create()` every call): AI-06 (`record_payment_run_proposal`), AI-26
(`record_policy_findings`), AI-27 (`record_duplicate_findings`), AI-30
(`record_operations_findings`). All four are `internal_state`/reporting documents, not financial
records — a duplicate is a doubled audit-trail row, not a doubled financial effect — but none is
covered by a retry/re-run test today. Named here, not fixed under this pass's scope; a real,
bounded next-chunk item (each needs only a stable `idempotencyKey` at its one call site, following
the exact pattern already used everywhere else in this codebase).

**Structural risk found by reading the tool handler, not any one workflow** (AI-07, AI-08, AI-10 via
shared `post_journal`): a crash between the period-status compare-and-swap and the final journal
save leaves an `AiSchedule` period permanently stuck at `drafted` with no journal entry and no
retry path — see the cross-cutting finding above. No test in any of the three workflows exercises
this exact window.

**Best example of a true "no partial state" test**: AI-23's "`score_journal_risk` throwing mid-run
fails the run cleanly, with no partial findings persisted."

**Best example of a true "retry doesn't double-write" test**: AI-08's "`schedule.due` run twice →
the period only drafts once (compare-and-swap idempotency)."
