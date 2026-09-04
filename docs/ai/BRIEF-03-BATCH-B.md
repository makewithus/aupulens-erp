# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 3 of 8 — BATCH B: SCHEDULES (AI-08, AI-10, AI-07, AI-09)

> **Prerequisite met.** Chunk 2 is accepted: Task 0 hardening done, four workflows shipped,
> 1069/1069 tests green, zero new API routes, additive one-liner edits only.
>
> The two bugs you found unprompted — the sparse-index-vs-explicit-null issue and the executor
> doubling findings while only escalating on whole-run status — are the kind of thing that would
> have quietly corrupted every later workflow's output. Finding them at AI-03 rather than at
> AI-22 is worth more than the four workflows themselves.
>
> Save this file to `docs/ai/BRIEF-03-BATCH-B.md`.
>
> Chunk 1 rules and Chunk 2 Part A decisions **both still apply**. Where this chunk overrides a
> Chunk 2 decision it says so explicitly (see A.1 and A.5 below).

---

# PART 0 — CARRY-FORWARD FROM CHUNK 2 (resolve before starting Batch B)

## 0.1 AI-04: did receipt extraction actually ship?

Your report describes AI-04 as "fully new, zero LLM calls, RECOMMEND, report-only, no writes."
The Chunk 2 spec asked for a `receipt` type added to `DOC_INTEL_TYPE` plus a receipt extraction
schema, and for a drafted `Expense` record.

Two possibilities, and I need you to state which:
- **(a)** You shipped policy checking and duplicate detection over *existing* `Expense` records
  only, and deliberately deferred receipt OCR and drafting. That is a defensible reduction — but
  it means AI-04 does not yet remove any keystrokes, which is the product test.
- **(b)** Something in the code made the extraction path unworkable and you routed around it.

Answer in one line in `docs/ai/IMPLEMENTATION_LOG.md`, and if it is (a), open an
`OPEN_QUESTIONS.md` entry titled "AI-04 receipt extraction deferred" recording what remains.
**Do not go back and build it now** — it is not this batch's scope, and Batch B has a dependency
chain that matters more. It gets picked up in Chunk 8 alongside AI-19/AI-27, which touch the same
`docIntel` module.

## 0.2 `Invoice.invoiceLines[].taxIds` is vestigial — propagate that finding

You established this is always `[]` in every real create path. Every workflow in Batch B that
touches an invoice line must follow AI-01's precedent: **tax rate selection is proposal metadata
in the envelope, never a field written to the record.** Add this to `GLOSSARY.md` so it isn't
rediscovered in Chunk 6.

## 0.3 Surface any of your 13 open questions that block this batch

Before writing code, scan `OPEN_QUESTIONS.md` and list in your Batch B plan file which entries
(if any) block AI-07/08/09/10. My expectation is that at least the missing-dimensions gap and the
`models/legacy/ApprovalRequest.ts` question are relevant here. If an entry blocks you, say so
before building around it.

---

# PART A — DECISIONS FOR THIS BATCH

## A.1 FX is **deferred to Chunk 4**, not built here

Part 5's build order lists "plus FX handling" against Phase 3. **I am moving it to Chunk 4.**

Reason: `SYSTEM_INVENTORY.md` established there is no FX rate table anywhere —
`CurrencyAdjustment` is a revaluation *journal*, not a rate source, and `Invoice.currencyId` is a
plain `"INR"` string. Building a rate table here means either inventing a rate source (forbidden)
or building manual-entry infrastructure whose only consumer is a close-time remeasurement that
doesn't exist yet. AI-13 lists FX ("missing rates, remeasurement differences") as one of its own
close domains, so the rate table lands with the workflow that actually needs it.

**For all of Batch B: INR only.** A non-INR source document, contract or asset is an escalation
with reason `fx_unsupported`, exactly as AI-01 already does. Never convert, never assume 1:1,
never store a rate. Count these escalations per workflow and report the totals — that count is
the business case for Chunk 4's FX work.

## A.2 AI-09 may **read** the Sales module — and writes only on the Finance side

Chunk 2's A.1 kept Batch A out of `models/sales/**` entirely. **AI-09 is a deliberate, bounded
exception**, because revenue recognition has nowhere else to get its facts: `SaleOrder`,
`SalesInvoice` and `models/sales/Payment.ts` are where contracted, billed and delivered live.

The boundary:
- **Read** `SaleOrder`, `SalesInvoice`, `Payment`, and delivery evidence — freely, tenant-scoped.
- **Write** nothing in `models/sales/**`. Not one field. Including `SaleOrder.revenueRecognition`.
- Recognition entries are drafted as Finance-side journals via `draft_journal`.

You recorded that `SaleOrder.revenueRecognition{recognizedAt, amount, method}` exists but isn't
derived from any engine. **Task: find out what sets it, and record the answer.** Three outcomes:
nothing sets it (dead field) → note it and ignore it; a UI sets it manually → AI-09 reads it as a
*human-stated intent* input, a useful signal; something computes it → that is a partial
recognition engine and AI-09 must extend rather than parallel it. Do not write to the field under
any of the three outcomes without a new decision from me.

## A.3 Autonomy — **schedules run autonomously, postings stay DRAFT**

This is the important distinction for this batch, and it is how you satisfy the Phase 3 gate
("schedules run monthly on their own") without breaking the Chunk 2 ceiling.

| Thing | Autonomy |
|---|---|
| The schedule *firing* on its due date, computing the period amount, producing a draft | `CONTROLLED_AUTONOMOUS` |
| The resulting `JournalEntry` reaching `voucherStatus: posted` | `DRAFT` — a human posts |
| Creating a new schedule from a source document | `DRAFT` |
| Depreciation run across the asset register | `CONTROLLED_AUTONOMOUS` to draft, `DRAFT` to post |
| Asset creation from a capital candidate | `RECOMMEND` — capital vs expense is judgement |
| Accrual proposal | `RECOMMEND` if judgemental or material, `DRAFT` if evidence-backed and routine |
| Revenue recognition journal | `DRAFT` always this batch |

**Build the auto-post path and ship it off.** Add `AiWorkflowPolicy.autoPostSchedules: boolean`,
default `false`. When a tenant flips it, mechanical schedule executions (prepaid recognition,
depreciation) may reach `post_journal` at `CONTROLLED_AUTONOMOUS`. Nothing else ever does. Test
both states.

Rationale for allowing it at all: a prepaid recognition entry is arithmetic against an
already-approved schedule, and it reverses cleanly. That is genuinely different from AI-01
choosing an account.

## A.4 `post_journal` gets registered — heavily gated

First batch where it appears. Register it with:
- `side_effect: execute`, `max_autonomy_level: CONTROLLED_AUTONOMOUS`
- required precondition: the journal originates from an **approved schedule record** (a human
  approved the schedule; the individual period entry is mechanical). Anything else → refuse.
- `check_period_lock` (real `assertTransactionNotLocked`) inside the tool, before anything.
- `check_permission` for the finance module, per Chunk 2's A.2 router.
- delegates all validation to `lib/accounting/journal-validation.ts` + `smart-rules.ts`.
- persistent idempotency key = `{scheduleId, periodKey}` so a retried cron sweep cannot
  double-post a month. This is the single highest-risk defect in Batch B; make the test explicit.

## A.5 Materiality now needs real numbers

Chunk 2 could mostly duck this. Batch B cannot — "apply materiality; drop noise" is a step in
AI-07's algorithm and a threshold in AI-10's capitalisation logic.

You found no generic materiality concept (`AccountingSettings.journals.approvalThresholdAmount`
and `tds.thresholdAmount` are the only analogues, both Finance-scoped). Build
`models/ai/AiMaterialityPolicy.ts` — per tenant, per action class: `{absoluteAmount,
percentOfBalance, appliesTo}`, seeded empty.

**Absent policy = no autonomous action.** Not "assume a default". If materiality isn't
configured, every workflow that needs it drops to `RECOMMEND` and says so in the reason chain.
`AiExpensePolicy`'s `policy_configured: false` pattern from AI-04 is the right precedent — reuse
its shape.

The one exception: the **capitalisation threshold** for AI-10 is an accounting policy, not a
materiality setting. It also doesn't exist. Same treatment: no threshold configured → every
capital candidate is `RECOMMEND` with the reason "no capitalisation threshold configured", and
never an invented figure.

---

# PART B — TASK 0: THE RECURRING SCHEDULE ENGINE (build before AI-08)

Every workflow in this batch needs the same thing: *something that must happen every period,
automatically, exactly once, that survives a locked period and a retried cron sweep.*

You established `JournalTemplate` is a static reusable line template with no `frequency` or
`nextRunDate`. It is not the mechanism. **Do not bolt scheduling onto it** — that would change an
existing model's semantics, which Hard Rule 1 forbids. Build the engine beside it; a schedule may
*reference* a `JournalTemplate` for its line shape if that's useful.

## B.1 `models/ai/AiSchedule.ts`

```
{
  tenantId, scheduleType: "prepaid" | "deferred_revenue" | "depreciation" | "accrual_reversal",
  sourceRef: { model, id },            // the bill, invoice, contract or asset it came from
  status: "draft" | "approved" | "suspended" | "completed" | "cancelled",
  approvedBy, approvedAt,
  startDate, endDate,
  frequency: "monthly" | "quarterly" | "annual",
  totalAmount, currency,               // INR only this batch (A.1)
  debitAccountId, creditAccountId,
  basis: "stated" | "inferred",        // where the service period came from
  periods: [ { periodKey, dueDate, amount, status: "pending"|"drafted"|"posted"|"skipped",
               journalEntryId, runId } ],
  recognisedToDate, remaining,
  nextRunDate,
  createdByWorkflow, killSwitchScope
}
```

Non-negotiable invariants, each with its own unit test:
1. `sum(periods[].amount) === totalAmount`, exactly, to the smallest currency unit. Rounding
   remainder goes to the **final** period, never spread. A schedule that doesn't sum is a defect.
2. Part-period arithmetic is explicit. A 12-month policy starting on the 17th produces 13 periods,
   the first and last partial, computed by day count on the actual month lengths.
3. `recognisedToDate + remaining === totalAmount`, always, after every run.
4. A `periodKey` can transition to `posted` exactly once. Enforced by a compound unique index,
   not by application logic.

## B.2 The runner

Extend the existing `app/api/cron/ai/runtime-sweep` route (do not add a second cron entry) to
emit `schedule.due` events for every `AiSchedule` where `status === "approved"` and
`nextRunDate <= today`. The workflow that owns that `scheduleType` consumes the event.

Behaviour:
- **Locked period** → mark the period `pending`, do not skip, do not post-date. Raise an attention
  item. When the lock lifts, the next sweep picks it up. Silently skipping a month is the worst
  possible failure here.
- **Cancelled or credited source** → suspend the schedule, compute the remaining balance, propose
  a reversal, escalate. Never keep recognising against a document that no longer exists.
- **Retry** → the `{scheduleId, periodKey}` idempotency key (A.4) makes a repeated sweep a no-op.
- **Missed periods** → if a schedule has several overdue periods (the tenant was locked for a
  quarter), process them in date order as separate entries, not one lumped catch-up entry.

## B.3 Tools to register this batch

| Tool | Side effect | Wraps / does | Max autonomy |
|---|---|---|---|
| `get_purchase_order` | read | `models/finance/PurchaseOrder.ts` incl. `orderLines[]` qty fields | — |
| `get_stock_moves` | read | `models/inventory/StockMove.ts` by lifecycle state | — |
| `get_asset` | read | `models/finance/Asset.ts` | — |
| `get_sale_order` | read | `models/sales/SaleOrder.ts` — **read-only, enforced** | — |
| `get_sales_invoice` | read | `models/sales/SalesInvoice.ts` — **read-only, enforced** | — |
| `get_schedule` | read | `AiSchedule` | — |
| `run_depreciation_compute` | analyse | wraps `POST /api/finance/assets/compute` logic — **wrap, don't reimplement** | — |
| `draft_prepaid_schedule` | draft | creates an `AiSchedule` in `status: draft` | DRAFT |
| `draft_accrual` | draft | `draft_journal` with reversal metadata | DRAFT |
| `draft_asset` | draft | creates an `Asset` in a draft/unconfirmed state | DRAFT |
| `post_journal` | execute | per A.4 — approved-schedule-origin only | CONTROLLED_AUTONOMOUS |

Any `models/sales/**` tool must be structurally read-only: no write method on the wrapper at all,
plus a source-grep test in the style of your existing `safety.test.ts` asserting no ORM write call
appears in AI-09's workflow folder against a Sales model.

---

# PART C — THE FOUR WORKFLOWS

Order: **AI-08 → AI-10 → AI-07 → AI-09.**

AI-08 is the simplest consumer of the schedule engine and proves it. AI-10 extends an existing
compute endpoint and adds the second schedule type. AI-07 needs PO and stock data. AI-09 is the
most complex and crosses a module boundary — it goes last, when everything else is stable.

---

## AI-08 — Prepaid / deferred schedule intelligence *(build first)*

**Business meaning.** A cost or revenue covering a future period must be spread across it. Today
someone builds a spreadsheet and remembers to post it monthly. This detects the service period
from the document, builds the schedule, and runs it.

**What you found.** Nothing exists. `JournalTemplate` is the nearest adjacent concept and is not
it. Fully new — but it sits directly on the Task 0 engine, so the workflow itself is thin.

**Triggers.** `bill.created`, `invoice.created` (from AI-01's emissions — already wired),
`schedule.due`, source document cancelled or credited.

**Algorithm.**
1. **Detect that a document should be spread.** Signals: an explicit service period spanning
   periods; keywords in the description (annual, subscription, licence, insurance, rent,
   maintenance, retainer, AMC, warranty); amount above the configured threshold. Two or more
   signals → candidate.
2. **Extract the service start and end.** From the document if stated. If not stated, infer from
   the description ("Apr 2026 – Mar 2027", "12 months from installation") and set
   `basis: "inferred"` — inferred schedules are always `RECOMMEND`, never auto-drafted, because a
   wrong service period misstates two years of accounts.
3. **Build the `AiSchedule`** per B.1: accounts (prepaid asset ↔ expense for a bill; deferred
   liability ↔ revenue for an invoice), periods, part-period arithmetic.
4. **Run it** on `schedule.due`: draft the recognition entry for that period, mark the period
   `drafted`, advance `nextRunDate`.
5. **Monitor** and report as findings: schedules whose remaining balance doesn't tie to the GL;
   schedules past `endDate` still holding a balance; schedules with no supporting document;
   overdue recognitions; and — the reverse detection — material expenses posted directly that
   look like they should have been spread.

**Escalate when.** Service period cannot be determined; source cancelled or credited; balance
doesn't tie; a period is overdue; the amount is material and the basis is inferred; non-INR.

**Expected output.** `{schedule_id, source_ref, start, end, total, periods[], accounts,
recognised_to_date, remaining, basis, next_due, anomalies[]}` inside standard findings.

**Tests that must pass.**
- 12-month insurance starting mid-month → correct part-period split; periods sum to the source
  amount exactly; first and last are partial.
- Quarterly frequency across a year end → four periods, correct period keys.
- Cancelled source → schedule suspended, remaining balance reversal proposed.
- Running the monthly sweep twice → one entry (`{scheduleId, periodKey}` idempotency).
- Locked period → period stays `pending`, attention item raised, **not skipped**; unlocking and
  re-running posts it.
- Three overdue periods → three separate entries in date order, not one lump.
- **False positive:** a one-month rent bill with no cross-period service span → **no schedule
  created**. This is the test that stops the workflow from turning every recurring bill into a
  schedule.
- Inferred service period → `RECOMMEND`, never auto-drafted.

---

## AI-10 — Fixed asset intelligence

**Business meaning.** Spot purchases that should be capitalised rather than expensed, create the
asset with the right life and method, run depreciation, and keep the register tied to the GL.

**What you found.** `models/finance/Asset.ts` and `POST /api/finance/assets/compute` (depreciation
compute) already exist. Missing: capital-candidate detection, register-to-GL tie-out, disposal and
impairment handling.

**So this workflow is three additions to a working feature, not a rebuild.** Wrap the existing
compute endpoint's logic in `run_depreciation_compute`; do not reimplement depreciation maths.

**Triggers.** `bill.created` (capital candidate check), `schedule.due` (depreciation run),
asset disposal, period end.

**Algorithm.**
1. **Capital candidate detection.** On a new bill: amount above the capitalisation threshold
   (A.5 — absent threshold means `RECOMMEND` with that reason, never a guess), plus asset-like
   description or category, plus expected life over a year, or coded to a capex account. Assemble
   related costs that belong in the same asset — installation, freight, duty on the same PO or the
   same vendor within a window.
2. **Draft the asset**: cost, in-service date, class, useful life, method, residual. Where life or
   method cannot be derived from an existing asset of the same class, escalate rather than
   defaulting — a wrong useful life is a decade of wrong numbers.
3. **Depreciation run** as an `AiSchedule` of `scheduleType: "depreciation"`, so it uses the same
   engine, the same idempotency and the same locked-period behaviour as AI-08. The per-period
   amount comes from `run_depreciation_compute`, not from your own arithmetic.
4. **Register-to-GL tie-out** — the highest-value part of this workflow. Sum the register's cost,
   accumulated depreciation and NBV; compare to the corresponding GL account balances. Any
   difference is a finding with severity by materiality, and it is exactly what AI-22 will consume
   in Chunk 4. Build the comparison as a reusable function, not inline.
5. **Detect**: disposals with no accounting entry; assets fully depreciated but still active;
   assets with no depreciation posted for a period; assets missing from the register that have a
   capex-coded bill behind them; impairment indicators.

**Autonomy.** Asset creation `RECOMMEND` (capital vs expense is judgement). Depreciation drafting
`CONTROLLED_AUTONOMOUS`, posting `DRAFT` unless `autoPostSchedules` (A.3). Impairment, life
changes and disposals always `RECOMMEND`.

**Expected output.** `{capital_candidates[{bill_ref, amount, reason, threshold_configured}],
asset_drafts[], depreciation_run{by_asset[], total, period}, register_to_gl{cost, accum, nbv,
gl_cost, gl_accum, differences[]}, exceptions[]}`.

**Tests that must pass.**
- Below-threshold purchase → expensed, **not** flagged as a capital candidate.
- Above-threshold asset-like purchase → candidate raised with the related costs grouped.
- **No threshold configured** → `RECOMMEND` with `threshold_configured: false`, never an invented
  figure.
- Mid-period acquisition → correct part-period depreciation, matching what the existing compute
  endpoint produces (assert against it, don't recompute independently).
- Register ties to GL after a run, to the smallest currency unit.
- A seeded 1-unit difference is detected and reported.
- Disposal with no entry → exception.
- Depreciation sweep run twice → one entry per asset per period.

---

## AI-07 — Accrual intelligence

**Business meaning.** At period end, costs incurred but not invoiced must be accrued. Today
someone remembers the usual suspects and guesses. This learns the recurring spend pattern per
vendor, proposes accruals with evidence, and schedules the reversal.

**What you found.** Nothing exists. But two real data sources do, and they matter more than any
model:

**`PurchaseOrder.orderLines[]` already carries `productQty`, `receivedQty` and `billedQty`.**
`receivedQty > billedQty` *is* goods-received-not-invoiced. That is the highest-quality accrual
evidence there is, it is deterministic, and it needs no LLM. Build this first and prove it alone.

**`StockMove` lifecycle** (`move_executed` / `accounting_created`) is the receipt event where no
PO exists. Secondary source, same idea.

**Triggers.** `period.horizon.reached`, close horizon, `grn.received` equivalent (a `StockMove`
reaching `move_executed`), scheduled sweep.

**Algorithm.**
1. **GRNI, deterministic.** For every open PO line where `receivedQty > billedQty`: accrue
   `(receivedQty − billedQty) × unit price`. Evidence: the PO line and the stock move.
   `basis: "po_receipt"`. No model call.
2. **Recurring-vendor expectation.** For each (vendor, account) with a stable pattern over the
   last 12–24 periods, compute what should have been invoiced this period; subtract what was.
   A gap is a candidate. `basis: "recurring_pattern"`.
3. **Estimate**, in this strict order of preference, recording which was used: contract or PO
   value → receipt value → last invoice → trailing average. Never a model-invented number.
4. **Materiality filter** per A.5. No policy → everything is `RECOMMEND`.
5. **Propose the accrual journal** plus an `AiSchedule` of type `accrual_reversal` dated in the
   next period, so reversal uses the same engine and cannot be forgotten.
6. **Track accuracy.** When the real invoice arrives, compare it to the accrual and feed the
   learning loop. Report accrual accuracy per vendor — it is the best evidence for raising
   autonomy later.
7. **Stale accruals**: accrued last period, still not invoiced, not reversed. Report as findings;
   they are close blockers in Chunk 4.

**Autonomy.** `DRAFT` for GRNI accruals (deterministic, evidence-backed, below materiality).
`RECOMMEND` for pattern-based, judgemental, material, or new-vendor accruals.

**Expected output.** `{accruals[{vendor, account, amount, basis, evidence[], confidence,
reversal_schedule_id, prior_period_accuracy}], stale_accruals[], expectation_gaps[],
materiality_configured: bool}`.

**Tests that must pass.**
- `receivedQty=10, billedQty=4` → accrual for 6 units at PO price, with PO line as evidence, no
  LLM call.
- **False positive, and the most important test here:** a vendor who *has* already invoiced this
  period → **no accrual**. Double-accruing an invoiced cost is worse than missing one.
- Fully billed PO line (`receivedQty === billedQty`) → nothing.
- Over-billed line (`billedQty > receivedQty`) → not an accrual; raise as an exception.
- Reversal creates exactly one `AiSchedule` and exactly one reversing entry next period.
- New vendor with no history → `RECOMMEND`, never drafted.
- Accuracy tracking updates when the matching invoice lands.

---

## AI-09 — Revenue recognition intelligence *(build last)*

**Business meaning.** Revenue is recognised when earned, which is not when it is billed or paid.
This keeps contracted / billed / delivered / recognised in agreement and prepares the journals.

**Read A.2 before starting.** Read from Sales, write only Finance-side journals.

**What you found.** `SaleOrder.revenueRecognition{recognizedAt, amount, method}` exists but is not
derived from an engine. Subscription billing exists at `/api/cron/sales/subscriptions-billing`
but concerns billing timing, not recognition accounting. Your first task is A.2's investigation:
find what sets that field.

**Algorithm.**
1. **Identify the recognition basis** per `SaleOrder`: point in time, over time, milestone, usage.
   Take it from the existing `revenueRecognition.method` where a human has stated one — that is
   human intent and it wins. Otherwise propose one and mark it `RECOMMEND`.
2. **Track four quantities independently** and never let them silently diverge:
   **contracted** (`SaleOrder`), **billed** (`SalesInvoice`), **delivered** (fulfilment or
   `StockMove`), **recognised** (Finance journals to revenue accounts).
3. **Classify every divergence:**
   - billed > earned → deferred revenue
   - earned > billed → unbilled / accrued revenue
   - delivered but never billed → **a billing gap — revenue leakage. Surface this loudly**,
     with the customer and amount. It is the finding most likely to pay for the whole project.
   - billed but never delivered → a fulfilment gap
4. **Prepare the recognition journal** for the period via `draft_journal`. Over-time recognition
   creates an `AiSchedule` of type `deferred_revenue`, reusing Task 0.
5. **Validate against the accounting policy engine** (`smart-rules.ts`). The policy engine is
   authoritative for method; the model may only propose facts about what was delivered when.
6. **Roll forward**: deferred opening + additions − recognised = closing, asserted every run.

**Autonomy.** `DRAFT` always this batch. Nothing about revenue recognition auto-posts.

**Expected output.** Per order: `{sale_order_ref, basis, basis_source: "stated"|"proposed",
contracted, billed, delivered, recognised, deferred_balance, unbilled_balance,
this_period_recognition, journal_draft_ref, gaps[{type, amount, customer_ref}]}`, plus a portfolio
roll-forward.

**Tests that must pass.**
- Annual subscription billed upfront → 1/12 recognised per month, deferred rolls to exactly zero.
- Milestone contract → nothing recognised before the milestone.
- Delivered-not-billed → a revenue-leakage finding with the customer named.
- Deferred opening + additions − recognised = closing, on a multi-period fixture.
- **Structural test:** zero writes to any `models/sales/**` model from AI-09's folder
  (source-grep, in the style of your existing `safety.test.ts`).
- **False positive:** a fully delivered, fully billed, fully recognised order produces **no
  findings at all**.

---

# PART D — CHUNK 3 STOP GATE

**Scope: Part 0 carry-forward, Task 0 schedule engine, then AI-08, AI-10, AI-07, AI-09.**

```
[ ] AI-04 receipt-extraction status answered in one line (Part 0.1)
[ ] AiSchedule invariants hold: periods sum to total; recognised + remaining = total;
    a period posts exactly once (unique index, not app logic)
[ ] Locked period leaves a schedule period pending, never skipped — tested both ways
[ ] Retried cron sweep cannot double-post a month ({scheduleId, periodKey} idempotency)
[ ] Missed periods process in date order as separate entries, not one lump
[ ] post_journal registered, approved-schedule-origin only, period-lock checked inside the tool
[ ] autoPostSchedules default false; both states tested
[ ] AiMaterialityPolicy exists; absent policy drops to RECOMMEND everywhere, never a default
[ ] No capitalisation threshold configured → RECOMMEND, never an invented figure
[ ] Non-INR escalates as fx_unsupported everywhere; counts reported per workflow
[ ] AI-09 writes nothing in models/sales/** (source-grep test)
[ ] What sets SaleOrder.revenueRecognition is answered and recorded
[ ] GRNI accrual works deterministically with zero LLM calls (assert the mock was never called)
[ ] Register-to-GL tie-out built as a reusable function (AI-22 will consume it)
[ ] run_depreciation_compute wraps the existing compute logic; depreciation not reimplemented
[ ] False-positive test present for each of the four (already-invoiced vendor; single-period
    rent bill; below-threshold purchase; fully-settled order)
[ ] Full suite green, zero new failures; tsc + eslint clean
[ ] UI regression against the Chunk 1 baseline; zero diffs
[ ] API surface diffed (I expect zero new routes again — the sweep route is extended, not added)
[ ] CAPABILITY_MAP.md rows AI-07..AI-10 updated; GLOSSARY.md updated (taxIds vestigial,
    AiSchedule, materiality policy)
[ ] IMPLEMENTATION_LOG.md entries; OPEN_QUESTIONS.md updated
```

**Report back with:** per workflow — extended versus created, autonomy shipped and intended,
tools registered, test results; the `fx_unsupported` counts; the answer on
`SaleOrder.revenueRecognition`; the GRNI accrual count from your fixtures; and any Phase 0 or
Chunk 2 finding this batch proved wrong.

Then request **Chunk 4 — Batch C (AI-22, AI-13, AI-24, AI-28: continuous reconciliation and
Day Zero Close)**, which is where FX lands (A.1) and where your register-to-GL and bank-position
functions get consumed.
