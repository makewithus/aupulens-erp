# README.md — AI-Native Finance Operating Layer, Handover

> Written at project close (docs/ai/BRIEF-08b-FINAL.md D.3), branch `ai/workflows`. All 30
> workflows built, AI-NL, learning/evaluation, and this handover shipped in Chunk 8b — the final
> chunk. Start here if you're inheriting this system.

## What this is

A runtime that watches Aupulens ERP's business events (bill created, bank statement imported,
period horizon reached, an hourly sweep, …), runs 30 registered AI workflows against them through
one fixed, auditable pipeline, and lets a human — or a chat message — command and inspect all of
it through the exact same gate every event trigger goes through. Nothing here replaces a human's
final say on anything that moves money; every ceiling above `RECOMMEND` is either narrowly
mechanical (a bank auto-match, a pre-approved depreciation period) or a proposal a human confirms.

## The runtime architecture, in one diagram

```
 event source                     the ONE executor (lib/aiRuntime/runtime/executor.ts)
 ─────────────                    ─────────────────────────────────────────────────────
 safeEmitEvent() calls        ┐
   from real business routes  │
 app/api/cron/ai/*            ├──▶  AiEvent outbox  ──▶  runWorkflow(workflow, event)
   (hourly sweep, nightly     │      (retry + dead-        │
   metrics snapshot)          │       letter, Part 2.5)    │  observe → context → extract →
 chat, via AI-NL              │                            │  reason → validate → decideAutonomy()
   (lib/aiRuntime/nl/         ┘                            │  → act (tools only) → verify →
   chatBridge.ts — same call, │                            │  learn → explain
   different trigger source)                               ▼
                                                    AiWorkflowRun + AiDecisionTrace
                                                    (the one output contract every
                                                    consumer — UI, chat, attention
                                                    engine — reads: WorkflowRunEnvelope)
```

**The one rule that makes this whole system trustworthy**: a workflow can only ever mutate data
through `rt.callTool()` — a permissioned tool call, checked against `AiWorkflowPolicy`'s
`killSwitchEnabled` + `maxAutonomyLevel` clamp (`lib/aiRuntime/policy/autonomyGate.ts`) — never the
ORM directly. `lib/aiRuntime/workflows/**` contains zero direct Mongoose write calls
(structurally asserted, `tests/ai/aiRuntime/safety.test.ts`).

## The 30 workflows and what each owns

| # | Owns | Ceiling | # | Owns | Ceiling |
|---|---|---|---|---|---|
| AI-01 | Document ingestion (bill/expense extraction) | DRAFT | AI-16 | Cash intelligence / forecast | OBSERVE |
| AI-02 | Ledger classification | EXECUTE | AI-17 | Compliance readiness | OBSERVE |
| AI-03 | Bank reconciliation matching | EXECUTE | AI-18 | Audit evidence packs, citations | OBSERVE |
| AI-04 | Expense policy checks | DRAFT | AI-19 | Master data intelligence (dup/gap/bank-hold) | RECOMMEND (+hold) |
| AI-05 | Receivables collection worklist | DRAFT | AI-20 | Related-party detection | OBSERVE |
| AI-06 | Payables ops, PO matching, payment-run proposal | DRAFT | AI-21 | Bank/financial statement intelligence | OBSERVE |
| AI-07 | Accrual intelligence | DRAFT | AI-22 | Continuous reconciliation controller (9 definitions) | OBSERVE |
| AI-08 | Prepaid schedules | CONTROLLED_AUTONOMOUS | AI-23 | Journal review | RECOMMEND |
| AI-09 | Revenue recognition | DRAFT | AI-24 | Close evidence verification | OBSERVE |
| AI-10 | Fixed assets / depreciation | CONTROLLED_AUTONOMOUS | AI-25 | Working-capital intelligence (DSO/DPO/DIO/CCC) | OBSERVE |
| AI-11 | Inventory / COGS intelligence | RECOMMEND | AI-26 | Accounting policy intelligence | OBSERVE |
| AI-12 | Tax intelligence, GST workpaper | RECOMMEND | AI-27 | Duplicate & duplicate-payment intelligence | RECOMMEND (+hold) |
| AI-13 | Close readiness | OBSERVE | AI-28 | Cutoff intelligence | RECOMMEND |
| AI-14 | Flux/variance analysis | OBSERVE | AI-29 | Control monitoring (12 controls) | OBSERVE |
| AI-15 | Anomaly detection (11 detectors) | OBSERVE | AI-30 | ERP operations intelligence (health + repair) | CONTROLLED_AUTONOMOUS |

Full per-workflow evidence and the real path to raising any of these: `docs/ai/AUTONOMY_RUNBOOK.md`.
Full build history, chunk by chunk: `docs/ai/IMPLEMENTATION_LOG.md`. Every architectural decision
and its reasoning: `docs/ai/CAPABILITY_MAP.md` (what existed before each workflow was built) and
`docs/ai/OPEN_QUESTIONS.md` (36 numbered findings, chunk by chunk).

## How to add a 31st workflow

1. Implement `WorkflowDefinition<TRaw, TExtracted, TProposal>`
   (`lib/aiRuntime/workflows/types.ts`) — the 10-stage pipeline's 6 behavioural hooks
   (`observe`/`extract`/`reason`/`validate`/`act`/`verify`); `context`/`learn`/`explain` are
   generic and you don't implement them.
2. Any write your `act()` needs goes through a registered tool
   (`lib/aiRuntime/tools/registry.ts::registerTool()`), never the ORM directly. If the tool only
   ever writes `models/ai/**`, tag it `category: "internal_state"` (skips financial-module RBAC —
   `tests/ai/aiRuntime/safety.test.ts` structurally enforces that every write inside such a
   handler targets an `Ai*`-prefixed model). Anything else goes through the normal
   `routePermissionCheck()` path and needs a real human `userId` in context — an autonomous sweep
   trigger has none, so a tool that must run unattended can ONLY be `internal_state`
   (`docs/ai/OPEN_QUESTIONS.md` #34 has the full reasoning, discovered building AI-30).
3. Register the workflow and its tools in `lib/aiRuntime/bootstrap.ts` (idempotent, called once).
4. If you want it reachable from chat, add an entry to
   `lib/aiRuntime/nl/workflowIntentMap.ts` (cheap layer) — the LLM fallback in
   `app/api/ai/command/route.ts` already resolves against the live registry (`listWorkflows()`)
   automatically, no code change needed there.
5. Write it against real data — never guessed. If a detection needs data that doesn't exist
   anywhere in this codebase, declare it `not_implemented` (or `checksNotImplemented`/
   `NOT_IMPLEMENTED`, the pattern varies slightly per workflow) with the SPECIFIC missing field or
   model, not a vague "not yet built." Grep for `notImplemented(` and `NOT_IMPLEMENTED`/
   `checksNotImplemented` across `lib/aiRuntime/` for 20+ real examples of the right shape.
6. A mandatory false-positive test — every workflow in this project has one: a clean, healthy
   fixture that produces zero findings. If your workflow can't pass that on real data, it isn't
   done.

## The autonomy gate, in short

`lib/aiRuntime/policy/autonomyGate.ts::decideAutonomy()` — the ONE function, called once per run,
never reimplemented per workflow. Seven checks (confidence, policy-allows-action, materiality,
historical stability, period-open, permission, kill-switch); a workflow's own `defaultAutonomy` is
its hard ceiling regardless of tenant policy; `AiWorkflowPolicy.maxAutonomyLevel` clamps further
down, never up. `decision.allowed` is false ONLY for a `NEVER_AUTONOMOUS` action class — every
other failure just clamps `autonomyApplied` down and sets `escalate: true`; `act()` still runs
(RECOMMEND-level `act()` implementations only ever propose, by construction). **Important
subtlety, discovered building AI-30**: `rt.callTool()`'s own `requestedAutonomy` is checked ONLY
against that TOOL's declared `maxAutonomyLevel`, not against `decision.autonomyApplied` — the
generic framework trusts `internal_state` tools by construction (worst case: a wrong bookkeeping
row, never a real business action). A workflow whose repairs/actions have real operational effect
beyond bookkeeping (AI-30's repairs) must check `decision.autonomyApplied` itself before calling
its own tools — the framework doesn't do this for you automatically outside the `internal_state`
assumption. See AI-30's own `act()` for the pattern.

## Kill switches

`AiWorkflowPolicy` document, `{tenantId, workflowId}`. `killSwitchEnabled: false` is the default
for every workflow on every tenant (Hard Rule 6) — an unconfigured tenant runs everything at
`RECOMMEND`, safe and inert. Flip it on (and set `maxAutonomyLevel`) from the Policy tab at
`/finance/ai-operations`, admin-only. The Performance tab on the same page shows, per workflow,
whether it currently meets a generic evidence bar — the real, per-workflow bar to reason from is
`docs/ai/AUTONOMY_RUNBOOK.md`.

## What `internal_state` means, precisely

A tool category (`lib/aiRuntime/tools/registry.ts`) whose writes target ONLY `models/ai/**` —
findings, holds, snapshots, learning records, repair logs. Such a tool skips the normal
`routePermissionCheck()` RBAC gate (there's no financial-module permission to check against a
write that can only ever touch AI bookkeeping) — asserted structurally: every write call inside an
`internal_state` handler's own source must target a model whose name starts with `Ai`
(`tests/ai/aiRuntime/safety.test.ts`). This is what makes an autonomous, human-less sweep trigger
(the hourly cron, AI-NL's OBSERVE-immediate path) safe to run unattended: the worst case of a bug
in an `internal_state` tool is a wrong row in a findings table, never a wrong financial posting.

## Natural-language control (AI-NL)

`lib/aiRuntime/nl/**` + `app/api/ai/command/route.ts` (extended, not duplicated — the Command
Center chassis, `AiCommandProposal`, predates this chunk). Layered resolution: a curated keyword
table first (no LLM call — `resolveWorkflowIntentCheap()`), then an LLM classification constrained
to the live workflow registry. A chat-triggered run is IDENTICAL to an event-triggered one —
`lib/aiRuntime/nl/chatBridge.ts::runWorkflowFromChat()` does nothing but assemble a `TriggerEvent`
and call the same `runWorkflow()`. Delete `lib/aiRuntime/nl/**` entirely and every workflow keeps
running on its triggers/schedules — nothing in `lib/aiRuntime/runtime/**`, `bootstrap.ts`, or any
cron route imports it (asserted, `tests/ai/aiRuntime/aiNl.test.ts`).

## Learning & metrics

`AiLearningRecord` (proposal-vs-outcome, Part 2.6) has existed since Chunk 1; only AI-05 and AI-07
currently call `record_learning_outcome` to populate it with real override data — every other
workflow's `override_rate` metric will read `not_computable` until its own call site is wired the
same way. `AiMetricSnapshot` (nightly, `app/api/cron/ai/metrics-snapshot`) computes every metric
from data this system already writes — never invents one (`lib/aiRuntime/metrics/computeMetrics.ts`
documents exactly which of the twelve C.1 metrics are and aren't computable today, and why).

## The honest `not_implemented` inventory

Every declared gap in this system, with its real reason — grep `notImplemented(`/`NOT_IMPLEMENTED`/
`checksNotImplemented` across `lib/aiRuntime/` to find the exact source. This list is worth more
than any amount of prose about what does work — it's checked and current as of Chunk 8b:

**Reconciliation (AI-22)**: `intercompany` — group consolidation needs an entity model that
doesn't exist (`docs/ai/AI-20-ARCHITECTURE-NOTE.md`). `processor_settlement` — no payment
processor settlement data source exists anywhere.

**Controls (AI-29)**: `sod_permission_conflict` — no role-permission matrix exists to check a
conflicting-permission-combination against. `access_change_authorised` — `ActivityLog` is free
text with no structured entity/action-type field; guessing "this log line was a role change" from
prose was rejected as exactly the heuristic this project avoids elsewhere.

**AI-06 (Payables)**: `vendor_bank_change_hold` — Vendor/Customer genuinely carry no bank-detail
field at all (confirmed by schema inspection); AI-19's real hold mechanism only covers
Employee/BankAccount.

**AI-19 (Master data)**: `expiring_documents` — no tax-certificate/insurance/licence expiry field
exists on Vendor or Customer. `vendor_bank_change_detection` — same root cause as AI-06's item
above (Vendor/Customer have no bank field); real today only for Employee/BankAccount.
`classification_inconsistencies` — deliberately deferred to AI-26, which owns cross-transaction
treatment consistency as its whole job.

**AI-27 (Duplicates)**: `credit_note_applied_to_rebill` — `Invoice` has no applied-against/
reversal-link field between an `out_refund`/`in_refund` and the invoice it offsets.

**AI-30 (ERP operations)**: `relink_orphan` — surveyed every real parent-child relationship in
this schema; none has a genuine dangling-reference-with-a-determinable-parent pattern (the
generic repair primitive is built and tested, ready the moment a real case exists).
`retry_integration_connection` — the only re-runnable connector operation (`testConnection()`)
mutates a non-`Ai*` model, which an `internal_state` tool structurally cannot do, and the normal
RBAC write path needs a human `userId` an autonomous hourly sweep never has
(`docs/ai/OPEN_QUESTIONS.md` #34 — a real architectural finding, not a shortcut).

**Group consolidation (AI-20)**: permanently `not_implemented` by design, not a gap to close —
`docs/ai/AI-20-ARCHITECTURE-NOTE.md`.

**Statutory submission**: nothing in this system files anything with a tax authority or
regulator, anywhere, by design — AI-12/AI-17 stop at workpaper/readiness.

**Metrics (C.1)**: `hours_saved` — no manual-effort-per-task baseline exists to multiply
automation coverage by; inventing one would be a guess presented as a measurement.
`downstream_reconciliation_survival` — a real join across `AiWorkflowRun` → the entries it
created → AI-22/AI-13's own later results, not yet built. Per-workflow `override_rate`/
`extraction_accuracy` — `not_computable` for every workflow except AI-05/AI-07 until its own
`record_learning_outcome` call site is wired.

**Golden datasets (C.2)**: see `docs/ai/GOLDEN_DATASETS.md` for exactly which workflows have a
real, CI-checked dataset today vs. a scaffolded format waiting for one.

## Where to look next

- `docs/ai/DECISIONS.md` — accepted product decisions, including the still-open one about an
  `lib/org/rbac.ts` authority-tier concept.
- `docs/ai/OPEN_QUESTIONS.md` — 36 numbered findings, in the order they were discovered.
- `docs/ai/AUTONOMY_RUNBOOK.md` — the real evidence bar and rollback trigger per workflow.
- `docs/ai/UI_REGRESSION.md` — this machine's regression-testing methodology (resource
  contention, not compile time, is the bottleneck on this dev box — a real finding, not an excuse).
- `docs/ai/BASELINE_FAILURES.md` — pre-existing failures this project didn't introduce and isn't
  responsible for fixing, tracked so they're never confused with a regression.
- `docs/ai/PRODUCT_TEST.md` — what a human does with AI on vs. off, the test that actually matters.
