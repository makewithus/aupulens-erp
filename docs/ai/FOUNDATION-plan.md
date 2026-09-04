# FOUNDATION-plan.md — Phase 1 architecture (Chunk 1 scope: runtime, no workflows yet)

## Namespace decision

`lib/ai/` already exists and is heavily used for **existing, unrelated** per-feature AI code
(`claude.ts`, `tenantAi.ts`, `rag.ts`, `commandActions.ts`, etc.). Putting the new runtime
directly inside it would conflate two different things. New code goes in **`lib/aiRuntime/`** —
a new domain folder, following the exact convention already used for `lib/docIntel/`,
`lib/integrations/`, `lib/migration/` (a `lib/<domain>/` folder per self-contained subsystem).
Models go in the existing `models/ai/` folder (new files only, matching its current contents:
`AiActionProposal`, `AiCommandProposal`, `AiMemory`, etc.) — no new model folder needed.

```
lib/aiRuntime/
  runtime/
    eventBus.ts       emitEvent(), dispatchPendingEvent(), sweepPendingEvents()
    executor.ts        runWorkflow() — the fixed 10-stage pipeline, idempotent, replay-safe
    registry.ts        registerWorkflow() / getWorkflow() — workflowId -> WorkflowDefinition
    killSwitch.ts       isWorkflowEnabled()
  context/
    contextService.ts  buildContext() — entity/subject/history/policy/period bundle
  policy/
    autonomyGate.ts     decideAutonomy() — the ONE shared gate function
    constants.ts        NEVER_AUTONOMOUS action list (hard-coded, not configurable)
  tools/
    registry.ts         registerTool() / callTool() — permission+autonomy+audit+idempotency
    control.ts          check_permission, check_policy, check_materiality, check_period_lock, check_sod
                         (the only tools this chunk implements — wrapping REAL existing code;
                         read/analyse/draft/execute tools get registered incrementally by the
                         chunk that owns the workflow needing them, per the brief's own STEP 3)
  workflows/
    types.ts             WorkflowDefinition interface (10 stage hooks + metadata)
    ai-00-smoke/
      index.ts            the trivial demo workflow
  learning/
    learningStore.ts     recordOutcome()
  attention/
    attentionEngine.ts   createAttentionItem() — dedupe, age, auto-resolve
  audit/
    auditTrace.ts        startTrace() / appendToolCall() / finalizeTrace()
  contracts/
    outputContract.ts    TS types for the Part 2.9 envelope + toEnvelope(run)

models/ai/
  AiEvent.ts             the event outbox
  AiWorkflowRun.ts        run header + embedded findings[] + metrics{} (= the envelope, stored)
  AiDecisionTrace.ts       1:1 append-only audit detail per run (tool calls, policy evals, reasoning)
  AiAttentionItem.ts       attention queue items
  AiLearningRecord.ts      proposal-vs-outcome capture
  AiWorkflowPolicy.ts      per-tenant-per-workflow autonomy level, thresholds, kill switch

app/api/cron/ai/runtime-sweep/route.ts   drains pending/failed AiEvents, retry w/ backoff cap, DLQ
```

No new UI, no new user-facing API routes in this chunk — nothing in Chunk 1 requires either, and
the brief's own Build Order gate for Phase 1 is "a trivial demo workflow runs end-to-end through
all 10 stages with a full audit record," which a Vitest test exercises directly.

## Why not extend Aupulens Studio (`lib/studio/`)

Recorded already in `CAPABILITY_MAP.md`: Studio is a flat condition→action automation engine
with no reasoning/validation/verification/escalation/learning stages, no retries/DLQ/idempotency,
and its event-dispatch path is unused in production. Building the 10-stage pipeline as an
"extension" of `executeSteps()` would mean rewriting it entirely under a different name — not
actually extending anything. New infrastructure, per Part 9 item 1's own test ("search for the
behaviour, not the label" — the behaviour here plainly isn't present).

## Event bus design (serverless-compatible — no persistent worker exists, confirmed in
`SYSTEM_INVENTORY.md`)

`emitEvent(tenantId, eventKey, payload, opts?)`:
1. Writes an `AiEvent` row (`status: "pending"`, optional `dedupeKey` for a compound unique
   index preventing duplicate emission).
2. Immediately attempts **inline, synchronous, best-effort dispatch** to every workflow
   registered for that `eventKey`, in the same request — this is what makes triggering "event-
   driven, not click-driven" real under Vercel's request/response model, without inventing a
   worker process that can't exist here.
3. Wraps dispatch in try/catch that can **never** throw back to the caller — a business route
   emitting `invoice.created` must not fail the invoice creation if the AI runtime has a bug.
4. Marks the `AiEvent` `processed` / `failed` (with `attempts++`) based on outcome. A new cron
   route (`app/api/cron/ai/runtime-sweep`, following the exact existing `app/api/cron/**`
   pattern and `CRON_SECRET` convention) drains anything still `pending`/`failed` under the
   retry cap on an hourly schedule, and moves anything over the cap to `dead_letter`. This is
   the DLQ.

## Idempotency / replay safety

- `AiEvent`: compound unique index `{tenantId, eventKey, dedupeKey}` (sparse — only enforced
  when a caller supplies a dedupeKey).
- `AiWorkflowRun`: compound unique index `{workflowId, triggerEventId}`. `runWorkflow()` checks
  for an existing run on that pair **before** executing; if found, returns the existing run's
  envelope unchanged rather than re-running. This is what makes "same event twice → exactly one
  effect" true by construction, not by convention — it is enforced in the executor, not left to
  each workflow to remember.

## The decision gate (Part 2.3) — one function, not one per workflow

`decideAutonomy(input)` in `lib/aiRuntime/policy/autonomyGate.ts` implements the exact seven-
check gate from the brief, in order, short-circuiting on first failure: confidence threshold →
policy allows → amount < materiality → historical stability → period open → permission →
kill switch. On any failure it drops one autonomy level and, if already at `RECOMMEND`,
returns `escalate: true`. `NEVER_AUTONOMOUS` actions (`lib/aiRuntime/policy/constants.ts`) are
a hard-coded list the gate checks first and cannot be overridden by tenant policy — matching
Hard Rule 4 verbatim ("Wire the gate even where the approval UI doesn't exist yet — the tool
call must fail closed").

## Tool registry (Part 2.4) — built generically, populated incrementally

The registry mechanism (`registerTool`/`callTool`) is generic and complete in this chunk. The
**tool set** is not fully populated yet — only the five `Control` tools are real in this chunk
(`check_permission`, `check_policy`, `check_materiality`, `check_period_lock` — wrapping the
**already-real, already-enforced** `lib/accounting/transactionLock.ts::assertTransactionNotLocked`,
confirmed live in `SYSTEM_INVENTORY.md` — and `check_sod`, a thin stub returning `true`/no-conflict
pending real SoD data modelling, which does not exist anywhere in this codebase yet per
`SYSTEM_INVENTORY.md`). Every `Read`/`Analyse`/`Draft`/`Execute` tool in the brief's table gets
registered by whichever future chunk implements the workflow that first needs it, wrapping the
real existing service function per Hard Rule ("map to existing service functions where they
exist — wrap, don't rewrite"). Registering all ~25 tools now as empty stubs would be fabricated
completeness with nothing real behind most of them — worse than leaving the seam explicit, per
the brief's own Chunk 1 preamble instruction.

`callTool()` enforces, in this order: tool exists in registry → caller permission (via
`check_permission`) → autonomy level requested does not exceed `tool.max_autonomy_level` →
for `execute`-type tools, `check_period_lock` → idempotency key dedup (a write tool called
twice with the same key returns the first result, does not re-execute) → invoke → record the
call (args, result, timing) onto the current run's `AiDecisionTrace`.

## AI-00-SMOKE — the trivial demo workflow

Purpose: prove all 10 stages execute, in order, with a full audit record, for the Build Order
Phase 1 gate. Trigger: a synthetic event key `ai.smoke.ping`. Behaviour: `observe` receives
`{message}`; `context` builds a bundle for the tenant (no real subject, since nothing exists to
look up yet); `extract` is a no-op passthrough; `reason` returns a fixed proposal
(`{finding: "smoke test ok"}`) with `confidence: 1.0` — no real model call (mocked/deterministic,
per Hard Rule "Model calls are mocked in tests"); `validate` always passes; `act` calls the one
registered `check_permission` control tool (proving the tool layer is wired, not bypassed);
`verify` re-reads nothing (no side effect to verify) and passes; `escalate` is skipped (nothing
to escalate); `learn` records a `no_action` outcome; `explain` writes the reason chain. Autonomy:
`OBSERVE` (read-only by construction — this workflow never proposes a write). Kill switch:
registered `enabled: false` in `AiWorkflowPolicy` seed data, same as every future workflow's
default, even though `OBSERVE` doesn't strictly need one — for symmetry and to exercise the
kill-switch check path itself.

## Tests (Chunk 1)

- `tests/ai/aiRuntime/eventBus.test.ts` — emit → inline dispatch → run created; duplicate
  `dedupeKey` emission is a no-op; unregistered `eventKey` leaves the event `pending` (no
  matching workflow, not an error).
- `tests/ai/aiRuntime/executor.test.ts` — full 10-stage AI-00-SMOKE run produces a valid
  envelope (`contracts/outputContract.ts` shape, contract-tested field by field) and a complete
  `AiDecisionTrace`; **idempotency test**: same `triggerEventId` run twice → one `AiWorkflowRun`
  row, second call returns the first result unchanged; **replay test**: `replay(runId)`
  produces no duplicate side effects.
- `tests/ai/aiRuntime/autonomyGate.test.ts` — pure unit tests, fixture matrix over the seven
  checks (each check individually failing drops autonomy correctly); **policy test**: a
  `NEVER_AUTONOMOUS` action (e.g. `release_payment`) is rejected regardless of confidence/policy
  inputs — asserts a raise, per Part 4.5's required test shape.
- `tests/ai/aiRuntime/toolRegistry.test.ts` — `check_period_lock` tool genuinely calls into
  `assertTransactionNotLocked` (not reimplemented) and genuinely throws when a real
  `TransactionLock` blocks the date; unknown tool name rejected; permission-denied caller
  rejected; idempotency key replay test.
- `tests/ai/aiRuntime/safety.test.ts` — Part 4.5's assertion list as literal tests: no ORM
  `.save()`/`.create()`/`.updateOne()` etc. import pattern inside `lib/aiRuntime/workflows/**`
  (grep-based test over the source tree, not a runtime check); a run without an `AiDecisionTrace`
  fails the executor's own post-condition (asserted via a forced-failure test); a
  `NEVER_AUTONOMOUS` tool call raises.
- `tests/ai/aiRuntime/attentionEngine.test.ts` — dedupe on repeat creation, age tracking,
  auto-resolve when called.
- `tests/ai/aiRuntime/learningStore.test.ts` — outcome capture round-trip.

All new test files use `process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_<name>"`
set before any import reaching `connectDB()`, per `BASELINE_FAILURES.md`'s finding — otherwise
they would land in the network-blocked bucket and look like false failures in this sandbox.

## statuses.ts additions (append-only, `lib/constants/statuses.ts`)

`AI_AUTONOMY_LEVEL`, `AI_RUN_STATUS`, `AI_EVENT_STATUS`, `AI_FINDING_TYPE`,
`AI_FINDING_SEVERITY`, `AI_ATTENTION_PRIORITY`, `AI_ATTENTION_STATUS`, `AI_LEARNING_OUTCOME` —
each following the existing `*_VALUES` export shape; transition tables only where a real state
machine exists (run status, event status, attention status), not for flat enums (severity,
finding type).

## Kill switch default

`AiWorkflowPolicy` has no seed rows by default; `killSwitch.isWorkflowEnabled()` treats a
missing policy row as `enabled: false` (fail closed) — matching Hard Rule 6 ("default OFF in
production until validated") without requiring every future workflow to remember to seed one.
