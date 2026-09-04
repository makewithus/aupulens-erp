# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 1 of 8 — FOUNDATION PACK  (rules + discovery + runtime + governance)

> **You are on branch `ai/workflows`.** Consult `claude.md`, `memory.md` and any related
> project files for current status before acting.
>
> **This brief is delivered in 8 chunks because of message-size limits.**
> - **Chunk 1 (this file)** — the rules, the mandatory discovery phase, the shared runtime
>   foundation, the governance controls, the build order, and the definition of done.
>   These apply to **every** workflow and are never superseded.
> - **Chunks 2–8** — the 30 workflows, delivered in build-order batches. You will receive
>   the next chunk only after the current batch is implemented, tested and reported.
>
> **What to do with this chunk:** save it to `docs/ai/BRIEF-01-FOUNDATION.md` in the repo,
> then execute **Phase 0 (Part 1)** and **Phase 1 (Part 2)** — nothing else. Do not implement
> any AI-XX workflow yet; you do not have their specifications. When Phase 0 and Phase 1 are
> complete and their gates pass, report back and Chunk 2 will follow.
>
> **Do not invent workflow specs to fill the gap.** If a section below forward-references a
> workflow you have not been given (e.g. "hand this to AI-27"), leave a registered extension
> point and move on. Fabricating a spec is worse than leaving a seam.

# PART 0 — HOW TO READ THIS BRIEF

## 0.1 The single most important instruction

**The workflow names in this document are descriptions of *work*, not names of features that exist in the codebase.**

You will read names like "AR intelligence", "Flux analysis", "Close evidence controller",
"Working-capital intelligence". **Do not go looking for a module called `ar_intelligence`.
It almost certainly does not exist, and its absence means nothing.**

For every workflow, this brief gives you three things:

1. **Business meaning** — what a human accountant does by hand today. This is the real spec.
2. **Repo vocabulary** — the actual words, table names, model names and folder names that
   this capability is *likely* filed under in this codebase. Search for these.
3. **Equivalence rules** — what counts as "this already exists" so you extend it instead of
   building a duplicate.

If you cannot find an existing home for a workflow after following the Repo vocabulary
section, then and only then create a new module — and create it inside the existing
architecture's conventions, not in a new parallel structure.

**Never say or assume: "this feature doesn't exist in the system so I'll skip it / stub it."**
The feature is the *behaviour*. Your job is to make the behaviour happen using whatever the
system already calls its invoices, bills, ledger entries, bank lines and tasks.

## 0.2 What "done" means for this project

The product test from the CTO, verbatim:

> **If AI is turned off, Aupulens should become materially more labor-intensive.**

Concretely, when you are finished:

| The system must, without a human asking | Owned by |
|---|---|
| Notice new transactions and missing work | AI-01, AI-15, AI-30 |
| Prepare the accounting treatment | AI-01, AI-02, AI-09, AI-26 |
| Reconcile continuously | AI-03, AI-22 |
| Maintain schedules (accrual/prepaid/depreciation/revenue) | AI-07, AI-08, AI-09, AI-10 |
| Watch the ledger for anomalies | AI-15, AI-23, AI-29 |
| Prepare the close | AI-13, AI-24, AI-28 |
| Prepare compliance work | AI-12, AI-17 |
| Explain financial movement | AI-14, AI-21, AI-25 |
| Retrieve audit evidence | AI-18 |
| Route exceptions to humans | Attention Engine |

Chat and voice are a **control surface over this engine**, not the engine. If the chat box is
deleted, every workflow above must still run on its own schedule and triggers. Build the
engine first; wire chat to it last (AI-NL).

## 0.3 Hard rules — violating any of these fails the task

1. **Additive only.** You may not delete, rename or change the signature of any existing
   public function, API route, DB column, or UI component. If something must change shape,
   add the new thing beside it and leave the old path working.
2. **No direct database writes from AI code, ever.** All AI writes go through the permissioned
   ERP tool layer (Part 2.4). An AI service calling the ORM's `save()`/`update()`/raw SQL on a
   financial table is a defect, even if it works.
3. **The tax engine and the accounting policy engine remain authoritative.** AI *suggests* a
   tax code or a treatment; the deterministic engine decides. If the deterministic engine
   disagrees with the model, the deterministic engine wins and the disagreement is logged.
4. **AI never**: changes vendor bank details, releases a payment, submits a statutory filing,
   changes a tax or accounting rule, or closes/locks a period. These are approval-gated
   without exception. Wire the gate even where the approval UI doesn't exist yet — the tool
   call must fail closed.
5. **No UI regression.** You will not modify existing screens except to *add* clearly
   additive surfaces (a new panel, a new tab, a new badge). Before and after every workflow,
   run the UI regression protocol in Part 0.6.
6. **Every autonomous workflow ships with**: a kill switch (config flag, default OFF in
   production until validated), idempotency keys, retry with backoff, replay-safe state, and
   a dead-letter queue.
7. **Every AI action writes an audit record**: workflow id, workflow version, model + version,
   inputs hash, context used, tool calls made, policy decisions, confidence, outcome, and the
   human-readable reason chain. No exceptions, including read-only analysis.
8. **Full test suite green before you commit, and after.** Not "the tests I wrote" — the whole
   suite. If a pre-existing test was already failing before you started, record it in
   `BASELINE_FAILURES.md` in Phase 0 and do not count it against yourself; but you may not
   add a new failure.

## 0.4 Working protocol — follow this literally for every workflow

For each workflow AI-XX:

```
STEP 1  DISCOVER
        Search the repo using the "Repo vocabulary" list for that workflow.
        Write findings into CAPABILITY_MAP.md:
          status = MISSING | PARTIAL | EXISTS
          existing files, existing models, existing endpoints, existing UI surfaces
        If PARTIAL or EXISTS -> you are EXTENDING. Do not create a parallel module.

STEP 2  PLAN
        Write docs/ai/AI-XX-plan.md containing:
          - which existing code you will call
          - which new files you will add (full paths)
          - which tool-layer functions you need (new ones must be registered in Part 2.4)
          - the exact output contract you will produce
          - the list of tests you will write
        Do not start coding until this file exists.

STEP 3  BUILD
        Implement. New code lives under the AI runtime namespace (Part 2.1), never inside
        existing domain modules, except for thin, additive registration hooks.

STEP 4  TEST
        - unit tests for the deterministic parts (must be 100% deterministic, no model calls)
        - contract tests asserting the exact output shape in the "Expected output" section
        - fixture-driven scenario tests using the "Tests that must pass" list
        - an idempotency test: run the workflow twice on the same event -> exactly one effect
        - a policy test: assert the workflow CANNOT perform its forbidden actions
        Model calls are mocked in tests. Never let CI depend on a live model.

STEP 5  VERIFY NO REGRESSION
        Run the full suite. Run the UI regression protocol (0.6). Diff the API surface.

STEP 6  REPORT
        Append to docs/ai/IMPLEMENTATION_LOG.md:
          what existed, what you added, what you extended, tests added, test results,
          kill-switch flag name, known limitations.

STEP 7  COMMIT
        One workflow per branch, one workflow per PR. Never batch workflows.
```

## 0.5 When you are unsure

Do not guess on anything that touches money, tax, or the ledger. Instead:

- Implement the **detection and proposal** side fully.
- Set autonomy to **Recommend** (propose only, never act).
- Raise an entry in `docs/ai/OPEN_QUESTIONS.md` with the exact decision needed.
- Continue to the next workflow.

A workflow that detects correctly and proposes safely is shippable. A workflow that acts on a
guess is not.

## 0.6 UI regression protocol (run before and after every workflow)

```
1. Enumerate every route/page in the app -> save to artifacts/routes.txt
2. Boot the app, load each route, capture: HTTP status, console errors, and a screenshot
   (or DOM snapshot if no browser harness exists) -> artifacts/ui-baseline/
3. After your change, repeat -> artifacts/ui-after/
4. Diff. Any route that changed status, gained a console error, or lost a rendered element
   is a regression. Fix it before committing.
If the repo has no UI test harness, create a minimal one (Playwright or the framework's own
test renderer) as part of Phase 0. It is infrastructure, it is additive, it is allowed.
```

---

# PART 1 — PHASE 0: MANDATORY DISCOVERY (do this first, write no features)

You must not implement AI-01 until Phase 0 is complete and its artifacts exist.

## 1.1 Produce `docs/ai/SYSTEM_INVENTORY.md`

Answer every one of these questions with **file paths and code references**, not prose:

**Platform**
- Language(s), framework(s), package manager, build and run commands.
- How tests are run. Test framework. Current pass/fail baseline → `BASELINE_FAILURES.md`.
- Migration tool and how migrations are applied.
- How background jobs run today (cron? queue? worker? none?).
- Is there a message/event bus, pub-sub, outbox table, or webhook dispatcher already?

**Data model — find the real names for each of these concepts**
| Concept | Find the actual model/table name |
|---|---|
| Legal entity / company / organisation | |
| Chart of accounts / GL account | |
| Journal entry + journal line | |
| General ledger / posting table | |
| Fiscal period / period lock / close status | |
| Customer, Vendor/Supplier | |
| Sales invoice, Credit note | |
| Purchase bill, Purchase order, Goods receipt | |
| Payment / receipt / payment run | |
| Bank account, bank transaction / bank feed line | |
| Bank reconciliation record | |
| Expense claim / card transaction / receipt | |
| Item / product / stock movement / valuation | |
| Fixed asset / depreciation schedule | |
| Tax code, tax transaction, tax return/filing | |
| Employee, payroll run, payroll journal | |
| Currency, FX rate table | |
| Attachment / document / file store | |
| User, role, permission | |
| Task / to-do / notification / approval request | |
| Audit log / activity trail | |
| Dimensions (cost centre, project, department, class) | |
| Intercompany relationship / consolidation mapping | |

**Existing engines**
- Is there a tax calculation engine? Where? Is it deterministic? What is its entry point?
- Is there an accounting/posting policy engine or posting-rules table?
- Is there a materiality setting anywhere? A confidence threshold anywhere?
- Is there any existing AI/LLM code? Which provider, which SDK, which prompt store?
- Is there OCR / document parsing already? Which library or vendor?
- Is there an integration gateway for banks/ERPs/providers? What does it emit?

**Surfaces**
- Every existing API route (dump to `artifacts/api-surface.txt`).
- Every UI page/route (dump to `artifacts/routes.txt`).
- Where a new panel or queue could be added without redesigning an existing page.

**Conventions**
- Folder layout, naming conventions, dependency-injection pattern, error handling pattern,
  logging pattern, how permissions are checked, how multi-tenancy/entity scoping is enforced.
- **You will match these conventions exactly.** Do not introduce a second style.

## 1.2 Produce `docs/ai/CAPABILITY_MAP.md`

A table with one row per workflow AI-01 … AI-30:

| ID | Workflow | Status (MISSING/PARTIAL/EXISTS) | Existing files | Existing models | Existing endpoints | Existing UI | What's missing |
|---|---|---|---|---|---|---|---|

Fill this in **before** building anything. This is the document that prevents you from
building a duplicate "AR intelligence" module next to an existing collections/dunning
feature, and prevents you from skipping a workflow because the phrase isn't in the repo.

## 1.3 Produce `docs/ai/GLOSSARY.md`

A two-column mapping: **brief term → this codebase's term**. Example shape:

| Brief says | This repo calls it |
|---|---|
| ledger classification | `TransactionCategoriser` / `coa_mapping` |
| AR intelligence | `receivables` module + `Invoice.status` + `dunning_rules` |
| close blocker | (missing — new concept) |

Every later plan file must use the repo's terms, not the brief's terms.

## 1.4 Phase 0 exit criteria

- `SYSTEM_INVENTORY.md`, `CAPABILITY_MAP.md`, `GLOSSARY.md`, `BASELINE_FAILURES.md` exist.
- `artifacts/api-surface.txt`, `artifacts/routes.txt`, `artifacts/ui-baseline/` exist.
- Full test suite has been run once and its result recorded.

---

# PART 2 — THE FOUNDATION (build this before any workflow; nothing works without it)

Every one of the 30 workflows is the *same runtime* with different logic plugged in. Build the
runtime once, correctly, then each workflow becomes a small, testable plugin.

## 2.1 The universal workflow runtime

Namespace everything under one root, matching repo conventions, e.g. `src/ai/` or `app/ai/`:

```
ai/
  runtime/        event bus subscription, workflow executor, stages, retries, DLQ, kill switch
  context/        context assembly service (2.2)
  policy/         autonomy + materiality + permission + period-lock gates (2.3)
  tools/          permissioned ERP tool registry (2.4)
  workflows/      one folder per AI-XX
  learning/       outcome capture + evaluation (2.6)
  attention/      task/priority/queue generation (2.7)
  audit/          decision trace writer (2.8)
  contracts/      shared output types (2.9)
```

**Every workflow implements the same 10 stages, in this order.** Implement this as a base
class / pipeline so no workflow can skip a stage:

| Stage | What it does | Must be |
|---|---|---|
| `observe` | Receives the triggering event | Idempotent on `event_id` |
| `context` | Fetches entity, master data, history, policy, related records, evidence | Read-only |
| `extract` | OCR / document parse / API payload normalisation | Deterministic where possible |
| `reason` | Model proposes classification / match / next action | Returns proposal + confidence + reasons |
| `validate` | Deterministic accounting, tax, permission, materiality rules | **Can veto the model** |
| `act` | Calls a permissioned ERP tool | Tools only. Never ORM |
| `verify` | Re-reads resulting ledger/subledger/control state and asserts the intended effect | Fails → compensate/rollback |
| `escalate` | Creates a human task when judgement/approval is required | Always with evidence |
| `learn` | Persists proposal vs final outcome | Never mutates rules directly |
| `explain` | Writes an evidence-backed decision trace | Always, even for read-only runs |

Runtime requirements:
- Trigger from **events**, not from a user clicking a button. A user click may *also* trigger
  a run, but it must not be the only path.
- Concurrency-safe per (entity, subject) key.
- Every run has: `run_id`, `workflow_id`, `workflow_version`, `entity_id`, `trigger_event_id`,
  `status`, `started_at`, `finished_at`, `outcome`.
- `replay(run_id)` must be safe and produce no duplicate side effects.
- A per-workflow kill switch, readable at runtime, default `OFF` for anything above
  `RECOMMEND` autonomy until validated.

## 2.2 Context service

One service, called by every workflow, that assembles: entity + its config, the subject record,
the counterparty (vendor/customer/employee), historical treatment of similar records, the
applicable policies and thresholds, linked documents/evidence, and the current period state.

Rules:
- Entity-scoped and permission-scoped at the source. A workflow must be structurally unable to
  read another tenant's data.
- Returns a serialisable `ContextBundle` that is stored with the run for replay and audit.
- History lookups are the highest-value signal in the whole system: "how were the last N
  similar records from this vendor/customer/account treated, and did those treatments stick?"

## 2.3 Policy, autonomy and confidence framework

**Autonomy levels** — one enum, used by every workflow:

| Level | AI may | Human role |
|---|---|---|
| `OBSERVE` | Detect, analyse, explain | Optional review |
| `RECOMMEND` | Suggest account / tax / match / action | Accept, edit or reject |
| `DRAFT` | Create a reversible draft | Approve / post |
| `EXECUTE` | Perform a low-risk reversible action under policy | Monitor |
| `CONTROLLED_AUTONOMOUS` | Run a predefined recurring action inside strict thresholds | Handle exceptions |
| `NEVER_AUTONOMOUS` | Nothing — always gated | Approval required |

`NEVER_AUTONOMOUS` is hard-coded for: payments, vendor/bank-detail changes, statutory
submissions, tax/accounting rule changes, period close and lock.

**The decision gate.** A workflow may act autonomously only if ALL of these pass:

```
confidence            >= workflow threshold (per entity, configurable)
policy_allows(action) == true         (tenant policy + workflow default)
amount                <  materiality threshold for that action class
historical_stability  >= threshold    (this pattern has been accepted N times, override rate low)
period_open           == true         (period not locked)
permission_ok         == true         (the acting service principal has the ERP permission)
kill_switch           == off
```

Fail any → drop one autonomy level, and if already at `RECOMMEND`, escalate to a human task.
This gate is a **single shared function**. Do not reimplement it per workflow.

**Confidence** must be a real, calibrated number, not a vibe: combine model score, historical
match rate for this pattern, and rule-agreement. Store the components, not just the total.

## 2.4 Permissioned ERP tool layer

This is the only way AI touches data. Register tools in one registry with explicit metadata:
`name, description, input schema, output schema, side_effect (read|analyse|draft|execute),
required_permission, reversible (bool), max_autonomy_level, audit_required (always true)`.

Minimum tool set to build (map each to *existing* service functions where they exist — wrap,
don't rewrite):

| Type | Tools |
|---|---|
| Read | `get_ledger`, `get_journal`, `get_invoice`, `get_bill`, `get_bank_transactions`, `get_vendor`, `get_customer`, `get_item`, `get_asset`, `get_tax_decision`, `get_report`, `get_period_status`, `get_source_document`, `get_audit_history` |
| Analyse | `run_reconciliation`, `run_flux`, `run_anomaly_scan`, `calculate_close_readiness`, `run_duplicate_scan`, `run_three_way_match`, `run_cash_forecast` |
| Draft | `draft_journal`, `draft_accrual`, `draft_prepaid_schedule`, `draft_invoice`, `draft_bill`, `draft_credit_note`, `draft_payment`, `draft_asset`, `draft_adjustment` |
| Execute | `post_journal`, `reconcile_transaction`, `allocate_receipt`, `send_reminder`, `create_task`, `place_payment_hold`, `submit_filing` *(permissioned, approval-gated)* |
| Evidence | `get_source_document`, `build_evidence_pack`, `link_evidence` |
| Control | `check_permission`, `check_policy`, `check_materiality`, `check_period_lock`, `check_sod` |

Rules:
- Every `execute` tool validates period lock + permission + policy **inside the tool**, so a
  buggy workflow still cannot break the ledger.
- Every write tool accepts an `idempotency_key` and returns the same result on replay.
- Every write tool returns the created/changed record IDs so `verify` can re-read them.

## 2.5 Event bus / triggers

If no bus exists, build a minimal transactional-outbox + dispatcher; do not bolt AI onto
request handlers. Emit at minimum:

`document.received`, `invoice.created|updated`, `bill.created|updated|approved`,
`payment.created|settled`, `bank.transaction.imported`, `bank.feed.synced`,
`journal.posted|drafted`, `expense.submitted`, `stock.moved`, `grn.received`,
`asset.acquired|disposed`, `payroll.posted`, `fx.rate.updated`, `master_data.changed`,
`period.horizon.reached`, `period.closing`, `report.refreshed`, `integration.failed`,
`user.corrected_ai_output`.

Also support **scheduled triggers** (continuous sweeps): hourly, nightly, and close-horizon.

## 2.6 Learning loop (shared, not per-workflow)

Store, for every proposal: the exact proposal, the full context reference, the final human
outcome (`accepted | edited | rejected`), the edited value, the user, the timestamp, and the
downstream result (did the resulting entry survive reconciliation and close?).

Then:
- Aggregate by (entity, vendor/customer, account, document type, provider, country).
- When a pattern reaches a configured stability threshold, propose a **learned mapping** —
  as a *versioned configuration change requiring approval*, never a silent mutation.
- **Never** let feedback modify statutory tax or accounting rules.
- Operational outcomes (a match that survived reconciliation, a close that completed, a filing
  that was accepted, an actual payment date vs predicted) are stronger signals than chat.
  Weight them accordingly.

## 2.7 Attention engine (the users' actual inbox)

Every escalation from every workflow lands here as a typed item:

| Priority | Example | Required output |
|---|---|---|
| `CRITICAL` | Bank/GL mismatch of material size; filing rejection; duplicate payment risk | Immediate task + named owner + evidence + recommended resolution |
| `HIGH` | AR control account mismatch; likely material missing accrual | Task + proposed action |
| `MEDIUM` | Unusual expense; stale reconciliation | Review queue entry |
| `LOW` | Vendor classification confidence dropped | Background review |
| `INFO` | Gross margin movement, explained | No task unless requested |

Every item carries: `what, why, evidence[], proposed_action, impact_amount, owner, due,
workflow_id, run_id, one_click_actions[]`. Items must dedupe, age, and auto-resolve when the
underlying condition clears.

## 2.8 Audit / decision trace

One append-only store. Every run writes: inputs, context snapshot ref, model + prompt version,
raw proposal, confidence components, policy evaluation results, tool calls with args and
results, final outcome, and a human-readable reason chain that cites **record IDs**, never
free text alone. This store is what AI-18 (audit intelligence) reads from.

## 2.9 Shared output contract

Every workflow returns this envelope. UI, chat and tasks all consume this one shape:

```json
{
  "run_id": "uuid",
  "workflow_id": "AI-03",
  "workflow_version": "1.0.0",
  "entity_id": "…",
  "status": "completed|escalated|failed|no_action",
  "autonomy_applied": "DRAFT",
  "summary": "One-sentence plain-English result.",
  "findings": [
    {
      "id": "…",
      "type": "match|exception|anomaly|blocker|proposal|explanation",
      "severity": "critical|high|medium|low|info",
      "title": "…",
      "detail": "…",
      "amount": 0,
      "currency": "…",
      "confidence": 0.0,
      "subject_refs": [{"model":"BankTransaction","id":"…"}],
      "evidence": [{"kind":"document|record|calculation","ref":"…","label":"…"}],
      "proposed_action": {"tool":"reconcile_transaction","args":{}, "reversible": true},
      "action_taken": null,
      "escalated_task_id": null,
      "reason_chain": ["…","…"]
    }
  ],
  "metrics": {"scanned": 0, "matched": 0, "exceptions": 0, "auto_actioned": 0},
  "next_run_hint": "on_event|hourly|nightly|close_horizon"
}
```

**Rule: no workflow returns prose only.** Prose lives in `summary` and `reason_chain`;
everything else is structured so the UI and the close engine can consume it.

---

# PART 4 — CROSS-CUTTING DELIVERABLES

## 4.1 Day Zero Close is a state, not a screen

Implement it as a continuously maintained materialised state per (entity, period), recalculated
on events and on a schedule, queryable at any instant in under a second. The close screen reads
this state; it does not compute it. See AI-13 for the domain checks.

## 4.2 Close readiness score — deterministic, with AI explanation

**Do not build one opaque AI score.** Build a deterministic model; let AI explain and prioritise.

| Component | Definition |
|---|---|
| `HARD_BLOCKER` | Open material reconciliation, failed statutory control, unposted mandatory transaction |
| `MATERIAL_EXCEPTION` | Large unexplained movement or an unresolved judgemental item above materiality |
| `MINOR_EXCEPTION` | Below materiality but unresolved |
| `STALE` | An expected evidence/feed/check has not refreshed within its policy window |
| `READY` | Control passed and evidence present |

Overall status is derived deterministically from hard blockers + material exceptions + the
tenant's policy thresholds. **The AI explains and ranks; it does not decide whether the
accounting is mathematically or legally valid.** The score function must be pure and unit-tested
against a fixture matrix.

## 4.3 Attention engine — see Part 2.7

Every workflow's escalations flow here. Users should be able to open one queue and see, ordered
by real importance: what needs them, why, what it's worth, what the evidence is, and a
one-click resolution where a resolution exists.

## 4.4 Natural-language control layer (AI-NL) — build this LAST

Chat maps intent → existing workflow → tool execution → explanation. It adds **no** capability
of its own. Minimum intent map:

| User says | System executes |
|---|---|
| "Reconcile this bank account." | AI-22 bank definition; return exceptions |
| "Why is gross margin down?" | AI-14 flux + driver analysis, drill to transactions |
| "Prepare March accruals." | AI-07; create drafts |
| "Show me what blocks close." | AI-13 readiness; show ranked blockers |
| "Fix the obvious bank matches." | AI-03; execute **only** matches passing the autonomy gate; leave the rest |
| "Prepare GST workpaper." | AI-12 tax reconciliation + workpaper generation |
| "Find duplicate vendor payments." | AI-27 across AP, payment and bank data |
| "Why doesn't AP tie to GL?" | AI-22 AP definition; explain the exact differences |

Rules: the parser resolves to a **registered workflow + parameters**, never to free-form code.
Ambiguous intent asks a clarifying question. A destructive intent always confirms with the
specific effect stated ("this will post 3 journals totalling 12,400 — confirm"). Every chat
action produces the same audit trace as an event-triggered run.

## 4.5 AI safety and accounting controls — assert these in tests, not prose

```
✗ AI writes directly to the database                    → test: no ORM write imports in ai/workflows/**
✓ All writes go through registered ERP tools            → test: tool registry coverage
✓ Tax engine is authoritative                           → test: model/engine disagreement → engine wins + logged
✓ Accounting policy engine is authoritative              → test: policy overrides model
✗ AI changes tax or accounting rules                     → test: write attempt raises
✗ AI changes vendor bank details                         → test: write attempt raises
✗ AI releases payments (default)                         → test: requires explicit policy + approval
✗ AI submits statutory filings without approval          → test: submission without approval raises
✗ AI closes or locks a period                            → test: lock attempt raises
✓ Every AI action is fully audited                       → test: run without an audit record fails CI
✓ Every autonomous workflow has a kill switch, replay-safe state and a DLQ → test per workflow
```

## 4.6 Evaluation metrics — instrument from day one, not at the end

| Metric | Measure |
|---|---|
| Extraction accuracy | Field-level accuracy by document type, country, provider |
| Classification accuracy | Account / tax / dimension correctness |
| Match precision | Correct auto-matches ÷ all auto-matches |
| False-match rate | Incorrect matches (weight this heavily — a wrong match is worse than no match) |
| Auto-action error rate | Incorrect actions that nevertheless passed the policy gate |
| Override rate | How often users change AI output, by workflow and by entity |
| Exception resolution time | Detection → resolution |
| Automation coverage | Eligible volume processed with no manual entry |
| Downstream reconciliation | Does automated output survive reconciliation and close? |
| Close readiness | Blocker count and unresolved value over time |
| Hours saved | Manual effort removed |
| Model drift | Performance by country, provider, document type, over time |

Build **golden datasets** per workflow as you go — a fixture set with known-correct answers that
CI runs against. This is how you detect regression in AI behaviour, which normal tests cannot.

---

# PART 5 — BUILD ORDER (do not deviate)

| Phase | Deliverables | Gate to pass before moving on |
|---|---|---|
| **0. Discovery** | SYSTEM_INVENTORY, CAPABILITY_MAP, GLOSSARY, baselines, UI harness | Artifacts exist; suite baseline recorded |
| **1. Foundation** | Event bus, workflow runtime, context service, tool registry, policy/autonomy/confidence gate, audit trace, attention engine, output contract | A trivial demo workflow runs end-to-end through all 10 stages with a full audit record |
| **2. Accounting core** | AI-01, AI-02, AI-03, AI-04 | Documents ingest to draft; bank auto-reconciles; no UI regression |
| **3. Schedules** | AI-07, AI-08, AI-09, AI-10, plus FX handling | Schedules run monthly on their own; registers tie to GL |
| **4. Close** | AI-22, AI-13, AI-24, AI-28 | Close readiness computes continuously and cannot false-complete |
| **5. Intelligence** | AI-14, AI-15, AI-16, AI-05, AI-06, AI-25 | Flux explains material movements to transaction level |
| **6. Compliance** | AI-12, AI-17 | Workpaper generated; submission gated |
| **7. Group** | AI-20, AI-21 | Group statements reconcile; statements are interrogable |
| **8. Audit & control** | AI-18, AI-23, AI-29 | Every claim carries a citation; controls tested continuously |
| **9. Operations & data quality** | AI-11, AI-19, AI-26, AI-27, AI-30 | Duplicates held; bank-change alerts fire |
| **10. Learning & NL** | Golden datasets, feedback loops, drift/evaluation, governed promotion, AI-NL | Chat maps to registered workflows only; metrics dashboard live |

Rationale for the ordering: nothing works without the runtime; close depends on reconciliation;
intelligence depends on clean accounting data; and the natural-language layer must be last so it
is provably a control surface rather than the product.

---

# PART 6 — DEVELOPER EPICS (for issue tracking)

| Epic | Concrete work |
|---|---|
| `AI-RUNTIME` | Event triggers, workflow state machine, queues, retries, replay, dead-letter, kill switches |
| `AI-CONTEXT` | Entity / account / vendor / customer / history / policy context retrieval |
| `AI-TOOLS` | Permissioned ERP tool registry, schemas, idempotency, permission enforcement |
| `AI-ACCOUNTING` | Extraction, classification, duplicate detection, semantic accounting proposals |
| `AI-RECON` | Bank, processor, AR, AP, tax, inventory, assets, payroll, intercompany reconciliation |
| `AI-SCHEDULES` | Accrual, prepaid, revenue, FX, asset intelligence |
| `AI-CLOSE` | Day Zero Close controller, readiness model, blocker detection, evidence controller |
| `AI-INTELLIGENCE` | Flux, anomaly, cash, working capital |
| `AI-COMPLIANCE` | Tax, filing, evidence readiness |
| `AI-AUDIT` | Source-to-report evidence retrieval, control monitoring, journal review |
| `AI-LEARNING` | Outcome capture, evaluation, golden sets, drift, governed promotion |
| `AI-NL` | Intent parser → workflow planner → tool execution → result explanation |

---

# PART 7 — FINAL ARCHITECTURE YOU ARE BUILDING TOWARD

```
ERP core              = system of record
Deterministic engines = accounting / tax / policy truth
Integration gateway   = external-world connectivity
AI runtime            = continuous operator          ← this is what you are building
Workflow engine       = execution state
Human approvals       = control boundary
Reporting engine      = live financial truth
```

**The definition of AI-native you are being held to:**

Not: *"You can chat with your ERP."*

Instead: *"The ERP continuously operates the finance work. Users intervene when judgement,
approval or accountability is required."*

---

# PART 8 — PER-WORKFLOW DEFINITION OF DONE (checklist you must satisfy for every AI-XX)

```
[ ] CAPABILITY_MAP.md row filled in with real file paths (MISSING/PARTIAL/EXISTS)
[ ] docs/ai/AI-XX-plan.md written and followed
[ ] Implemented inside the AI runtime namespace, matching repo conventions
[ ] All 10 runtime stages present; none skipped
[ ] Uses the shared context service, policy gate, tool registry and audit writer
[ ] Zero direct DB writes; every write is a registered tool call with an idempotency key
[ ] Autonomy level set correctly; forbidden actions provably impossible (test asserts the raise)
[ ] Kill switch registered; default OFF above RECOMMEND until validated
[ ] Output matches the shared envelope exactly (contract test)
[ ] Escalations produce attention-engine items with evidence and a proposed action
[ ] Learning loop captures proposal vs outcome
[ ] Unit tests for deterministic logic (no model calls in CI)
[ ] Every "Tests that must pass" scenario for this workflow implemented and green
[ ] At least one false-positive test (the case where it must stay silent)
[ ] Idempotency test: same event twice → one effect
[ ] Golden dataset fixture added
[ ] FULL existing test suite green (no new failures vs BASELINE_FAILURES.md)
[ ] UI regression protocol run before and after; zero diffs on existing routes
[ ] API surface diffed; no existing route changed or removed
[ ] IMPLEMENTATION_LOG.md entry written
[ ] Any unresolved judgement call recorded in OPEN_QUESTIONS.md
```

---

# PART 9 — THINGS THAT WILL GET THIS REJECTED

1. Building a duplicate module because you searched for "AR intelligence", didn't find it, and
   concluded the capability was absent. **Search for the behaviour, not the label.**
2. A workflow that only runs when a user clicks something.
3. A workflow that returns a paragraph of prose instead of the structured envelope.
4. Any AI code that writes to the database directly.
5. A close blocker that clears because the AI "handled" it rather than because the data changed.
6. A reconciliation reporting "reconciled" with an unexplained difference.
7. An anomaly detector with no suppression path.
8. An evidence answer with no record citations.
9. A duplicate detector that flags legitimate recurring subscriptions.
10. Modifying an existing screen or route in a way that changes its current behaviour.
11. Committing with a new test failure, or with the full suite unrun.
12. Batching multiple workflows into one PR.

---

**Start now with Phase 0. Do not write feature code until `SYSTEM_INVENTORY.md`,
`CAPABILITY_MAP.md`, `GLOSSARY.md` and `BASELINE_FAILURES.md` exist and the baseline test run
is recorded.**

---

# CHUNK DELIVERY MAP (how Part 5's build order maps to the chunks you will receive)

| Chunk | Batch | Workflows | Build-order phase |
|---|---|---|---|
| 1 | Foundation | — (Phase 0 discovery + Part 2 runtime) | Phases 0 and 1 |
| 2 | A — Accounting core | AI-01, AI-02, AI-03, AI-04 | Phase 2 |
| 3 | B — Schedules | AI-07, AI-08, AI-09, AI-10 (+ FX) | Phase 3 |
| 4 | C — Close | AI-22, AI-13, AI-24, AI-28 | Phase 4 |
| 5 | D — Intelligence | AI-14, AI-15, AI-16, AI-05, AI-06, AI-25 | Phase 5 |
| 6 | E — Compliance & group | AI-12, AI-17, AI-20, AI-21 | Phases 6 and 7 |
| 7 | F — Audit & control | AI-18, AI-23, AI-29 | Phase 8 |
| 8 | G — Operations & data quality, then Learning + NL | AI-11, AI-19, AI-26, AI-27, AI-30, AI-NL | Phases 9 and 10 |

Workflows are **not** delivered in numerical order — they are delivered in dependency order,
because close depends on reconciliation, intelligence depends on clean accounting data, and the
natural-language layer must come last so it is provably a control surface rather than the product.

A workflow that a later chunk will define may be referenced by an earlier one (AI-01 hands
duplicates to AI-27, for example). When that happens: register the extension point, implement
the local fallback the text describes, note it in `docs/ai/OPEN_QUESTIONS.md`, and move on.
**Never invent the specification of a workflow you have not been given.**

---

# CHUNK 1 — STOP HERE

Your scope for this chunk is **Phase 0 (Part 1)** and **Phase 1 (Part 2)** only.

**Deliverables before you report back:**
```
[ ] docs/ai/SYSTEM_INVENTORY.md        — every question in Part 1.1 answered with file paths
[ ] docs/ai/CAPABILITY_MAP.md          — all 30 rows, status + real paths (use the workflow
                                         names from Part 0.2 and Part 6; specs arrive later)
[ ] docs/ai/GLOSSARY.md                — brief term -> this repo's term
[ ] docs/ai/BASELINE_FAILURES.md       — pre-existing test failures, recorded before you touch anything
[ ] artifacts/api-surface.txt          — every existing API route
[ ] artifacts/routes.txt               — every existing UI route
[ ] artifacts/ui-baseline/             — status + console errors + snapshot per route
[ ] The full AI runtime from Part 2: runtime, context, policy/autonomy gate, tool registry,
    event bus, learning store, attention engine, audit trace, shared output contract
[ ] A trivial demo workflow (AI-00-SMOKE) that runs end-to-end through all 10 stages,
    produces the Part 2.9 envelope, and writes a complete audit record
[ ] All Part 4.5 safety assertions implemented as passing tests
[ ] Full test suite green (no new failures vs BASELINE_FAILURES.md)
[ ] UI regression protocol run; zero diffs on existing routes
[ ] docs/ai/IMPLEMENTATION_LOG.md entry written
```

**Report back with:** the CAPABILITY_MAP summary (how many MISSING / PARTIAL / EXISTS), the
GLOSSARY, the runtime file layout you settled on, the tool registry contents, the test result,
and anything in `docs/ai/OPEN_QUESTIONS.md`.

Then request **Chunk 2 — Batch A (AI-01 to AI-04, accounting core)**.
