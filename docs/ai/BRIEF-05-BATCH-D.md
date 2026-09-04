# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 5 of 8 — BATCH D: THE INTELLIGENCE LAYER
# (AI-05, AI-06, AI-16, AI-14, AI-15, AI-25)

> **Prerequisite met.** Chunk 4 accepted: 1145/1145 green, the autonomy clamp live, AI-22's nine
> definitions registered with three honest `not_implemented` entries, and Day Zero Close computing
> as a state rather than a screen.
>
> Three things in your Chunk 4 report changed my plan for this batch. The clamp result is the big
> one: **7 of 8 workflows now sit at RECOMMEND for an unconfigured tenant, and no tenant can be
> configured, because no policy surface exists.** As of today this product would fail the CTO's
> own test — AI notices everything and does nothing. Part 0 fixes that, and it is why this batch
> contains the first UI in the entire project.
>
> Save this file to `docs/ai/BRIEF-05-BATCH-D.md`.
>
> This is the largest batch: six workflows. Chunk 1 rules and the Part A decisions of Chunks 2, 3
> and 4 all still apply except where overridden.

---

# PART 0 — TASK 0: MAKE FOUR CHUNKS OF WORK REACHABLE

Four chunks in, the system computes close readiness, drafts accruals, reconciles nine population
pairs and raises attention items — and **a user cannot see or configure any of it.** That is now
the binding constraint, not any individual workflow.

## 0.1 One new page, zero existing pages modified

Build **one** additive route — `/finance/ai-operations` (or wherever `config/sidebar/finance.ts`
conventions put it) — with one new sidebar entry. No existing page, component or route is
touched. This is the first time the UI regression harness you built in Phase 0 does real work;
the diff against `artifacts/ui-baseline/` must still be zero for every pre-existing route.

Three tabs, deliberately minimal:

**Attention** — the `AiAttentionItem` queue. Priority, title, amount, owner, age, evidence links,
and the proposed action. Filter by priority and workflow. Actions limited to: open the linked
record, resolve, and snooze. **No approve-and-post button in this batch** — approving an AI
proposal from a queue is a control decision that needs its own design, and rushing it here is how
you end up with a one-click path around the approval chain.

**Close** — read-only render of `AiCloseState`: readiness status, the domain grid with each
domain's status, and the ranked blocker list. `not_checked` and `not_applicable` must render as
visibly different from `ready`. If a designer would make them the same grey, override the designer.

**Policy** — per-workflow rows: name, declared ceiling, `maxAutonomyLevel` selector,
`killSwitchEnabled` toggle, `autoPostSchedules`, and the materiality policy fields. This is what
unblocks the clamp result. Restrict the page to an admin/finance-owner role using the existing
`lib/org/rbac.ts`; do not invent a new role.

Follow `/mnt/skills/public/frontend-design/SKILL.md` conventions if that skill is present in your
environment, and match the existing module-dashboard composition pattern you documented in
`SYSTEM_INVENTORY.md` — this is an additive widget-style page, not a new design language.

## 0.2 Ship a documented default policy, and be explicit that it is conservative

Along with the UI, add a seed that creates `AiWorkflowPolicy` rows on first visit to the Policy
tab, set to each workflow's **declared** ceiling — with the kill switch still `false`. So the
sequence a real tenant experiences is: open the page → see eight workflows, all off, each showing
what it *would* be allowed to do → turn on the ones they want.

That is the right default. It also means your Chunk 4 table stops describing a permanent state
and starts describing an unconfigured one.

## 0.3 Confirm the two write tools you flagged (OQ #19) — **approved, with a rule**

`resolve_task` and `record_close_assertion` are approved. They write to AI-native infrastructure
models, not to financial records, and the alternative was AI-24 writing directly to the ORM —
which is exactly the Hard Rule 2 violation your own `safety.test.ts` caught. The tool layer was
the correct place to put them.

Formalise it so the next person doesn't have to reason it out: add a tool category
`internal_state` for tools whose writes target `models/ai/**` only. These tools:
- still register, still audit, still take an idempotency key,
- do **not** require a financial-module permission check,
- **must not** be able to write to any non-`models/ai/**` collection — enforce with a source-grep
  test in the style of the ones that already caught two real violations.

`AiSchedule`, `AiAttentionItem`, `AiCloseAssertion`, `AiCloseState`, `AiLearningRecord` are the
current members. Migrate any existing direct writes to these into `internal_state` tools.

## 0.4 Close the `evidence` domain gap

You reported `not_checked` domains are always two: `tax` and `evidence`. Tax is genuinely blocked
until Chunk 6. Evidence is not — AI-24 exists; it simply isn't wired into AI-13's recompute.
**Wire it.** Small task, and it takes the permanent `not_checked` count from two to one.

## 0.5 Carry-forward notes

- **The clamp short-circuit bug you caught** (OBSERVE/RECOMMEND short-circuit applied to the
  clamped level instead of the declared level, suppressing escalation on a policy-forced clamp) —
  add a standing rule to the runtime docs: *escalation decisions key off the declared level; the
  clamp changes what the workflow may do, never whether a human gets told.* Worth a comment in
  `autonomyGate.ts` at the exact line, because it is not obvious.
- **`smart-rules.ts` references `asset_bank`, which has never existed in `Account`'s enum**
  (`asset_cash` is real). Add it to the `GLOSSARY.md` landmines section and to the AI-26 queue.
  Do not edit `smart-rules.ts`.
- **Inventory GL uses the `asset_current` bucket** because no dedicated inventory account type
  exists. AI-25 needs inventory days and will hit this. Record it as an open question now:
  *"which accounts constitute inventory for reporting purposes, given no inventory account type?"*
  Until answered, AI-25 reports inventory days as `not_computable` rather than guessing a bucket.

---

# PART A — DECISIONS FOR THIS BATCH

## A.1 The Sales-side restriction lifts — with a stated boundary

Chunk 2's A.1 kept everything out of `models/sales/**`. AI-05 and AI-06 cannot work under that
restriction. It lifts, but not to "anything goes":

| Model | AI-05 | AI-06 |
|---|---|---|
| `SalesInvoice` | read + propose allocation | — |
| `models/sales/Payment.ts` + `allocations[]` | read + **draft** allocations | — |
| `SalesInvoice.payments[]` | read only — it is the *derived* layer | — |
| Finance `Invoice` (`out_invoice`) | read | — |
| Finance `Invoice` (`in_invoice`) | — | read + match status |
| `PurchaseOrder`, `StockMove` | — | read |
| `Customer`, `Vendor` | read | read |

**Never written by anything in this batch:** credit notes, write-offs, credit limits, payment
records that move money, `Vendor` bank details, or any payment run.

## A.2 The two payment layers — read the source of truth, never write the derived one

`models/sales/Payment.ts` (with `allocations[]`) is the source of truth for the Sales Payments
tab, kept in sync to `SalesInvoice.payments[]` by `lib/sales/paymentAllocation.ts`. Finance-side
payment state (`lib/accounting/payments.ts`, `Invoice.paymentState`) is a **separate, unwired**
layer.

Rules:
- AI-05 drafts allocations against `models/sales/Payment.ts` **through `lib/sales/
  paymentAllocation.ts`**, so the existing sync runs. Never write `SalesInvoice.payments[]`
  directly — that would desynchronise the two layers, and the sync logic exists precisely to
  prevent that.
- AI-05 reads Finance `Invoice.paymentState` for context but does not reconcile the two layers.
  **The divergence between them is a finding, not a repair.** Report it — count invoices where
  Sales-side and Finance-side payment state disagree, with amounts. That count is evidence for a
  decision neither of us should make inside a workflow.
- Expect `SalesInvoice`'s ambiguous Model export to bite here; you already have the call-site
  workaround from Chunk 3.

## A.3 What AI-06 genuinely cannot do yet — declare it, don't fake it

Two pieces of the generic AI-06 spec have no data behind them:

- **"Hold a bill whose vendor bank details changed recently."** Nothing tracks bank-detail changes.
  AI-19 (Chunk 8) builds that. AI-06 ships this check as `not_implemented` with that reason,
  visible in its output — the same honesty pattern AI-22's definition list uses.
- **"Prepare a payment run."** No payment-run concept exists anywhere in this codebase. AI-06
  produces a **proposal object** (`AiPaymentRunProposal`, an `models/ai/**` record) — a grouped,
  prioritised list with exclusions and reasons. It is a document, not an executable batch, and
  nothing in this batch can turn it into payments.

## A.4 Autonomy for this batch

| Workflow | Level | Note |
|---|---|---|
| AI-05 | `DRAFT` for receipt allocation; `DRAFT` for reminder *drafting* | Sending is `NEVER_AUTONOMOUS` this batch — `send_reminder` is **not registered** |
| AI-06 | `DRAFT` for match status; `RECOMMEND` for the payment-run proposal | Payment release `NEVER_AUTONOMOUS`, permanently |
| AI-16 | `OBSERVE` | Recommends; never initiates anything |
| AI-14 | `OBSERVE` | Read-only by construction |
| AI-15 | `OBSERVE` | Investigations only; never a correction, never an accusation |
| AI-25 | `OBSERVE` | |

Remember these are declared ceilings; the Task 0.2 seed and the clamp decide what actually runs.

## A.5 AI-15 gets a precision budget, not just a detector list

Anomaly detection is the workflow most likely to be switched off by users, and a detector nobody
trusts is worse than no detector. Non-negotiable for AI-15:

- Every detector has a **suppression key**. A user marking an anomaly "expected" suppresses that
  pattern for that scope for a configured window.
- Every detector tracks **true-positive rate** (resolved-as-real ÷ total raised) and surfaces it.
- A detector whose precision falls below a configured floor over a minimum sample **auto-disables
  itself** and raises a single `INFO` item saying so. Build this; it is the mechanism that keeps
  the feature alive.
- Ship each detector `OBSERVE` and *silent* (findings recorded, no attention item) until it has
  cleared a minimum sample at acceptable precision on real data. Loud from day one is how you lose
  the user.

---

# PART B — THE SIX WORKFLOWS

Order: **AI-05 → AI-06 → AI-16 → AI-14 → AI-15 → AI-25.**

AI-16 needs AI-05's predicted payment dates and AI-06's due schedule. AI-25 needs all three.
AI-14 and AI-15 are independent and can slot anywhere after AI-06, but keep them here so the
dependency chain stays obvious.

---

## AI-05 — Receivables operations *(what the system does about money owed to us)*

**Business meaning.** Not a feature name. Allocate incoming receipts to the right invoices, know
who is overdue and who is *about* to be, decide who to chase and in what order, draft the chase,
and spot disputes early.

**What you have.** `lib/sales/reminderEngine.ts` **already evaluates real `SalesInvoice` due dates
and sends automated reminders** — a direct, working precedent. `lib/sales/paymentAllocation.ts`
does allocation and sync. `models/sales/Reminder.ts` exists. `/api/finance/reports/aged` produces
aged receivables.

**Extend `reminderEngine.ts`; do not build a second reminder path.** AI-05 supplies it with
better inputs — priority, predicted payment date, dispute state — and drafts better content. The
existing scheduling and sending machinery stays exactly as it is.

**Do not reuse `models/sales/DunningRule.ts`.** You established it is built for subscription
payment-failure retries, not general AR collections. Different domain, same word. Record the
distinction in `GLOSSARY.md` so the next reader doesn't grab it.

**Algorithm.**
1. **Receipt allocation.** Match incoming money to invoices: exact, partial, batched (one receipt
   across many invoices), short payment, overpayment. Draft through `paymentAllocation.ts` per
   A.2. **Unallocated cash is a close blocker** — feed the count and value to AI-13.
2. **Ageing and predicted payment date.** Compute buckets from `/api/finance/reports/aged`. Then,
   per customer, predict payment from their *actual* history — mean and variance of days-to-pay,
   not the invoice terms. A customer who has paid at 45 days for two years will pay at 45 days;
   reporting them as overdue at 30 is noise the user already ignores.
3. **Collection worklist.** Rank by amount at risk × probability of delay. Produce an ordered
   worklist with a reason per line, not an alphabetical list.
4. **Draft communications** by stage — pre-due nudge, gentle, firm, final — with the invoice list.
   Drafting always allowed; **sending is not, this batch** (A.4).
5. **Dispute detection.** Short payment, one invoice unpaid while others from the same customer
   are paid, a customer message containing a query. Open a dispute record and **stop the reminder
   sequence for that invoice** — chasing a disputed invoice is the fastest way to damage a
   customer relationship, and it is the behaviour users complain about most in every AR tool.
6. **Report the Sales-vs-Finance payment-state divergence** per A.2.

**Escalate when.** Cash can't be allocated; short payment; material balance ages past threshold;
dispute detected; write-off would be the only resolution.

**Expected output.** `{allocations[{payment_ref, invoice_refs[], amounts[], type, confidence}],
aging_summary, predicted_payments[{customer, invoice, due_date, predicted_date, basis}],
collection_worklist[{customer, amount_at_risk, priority, reason, drafted_communication_ref}],
disputes[], unallocated_cash{count, value}, payment_state_divergence{count, value}}`.

**Tests.** One receipt across many invoices. Short payment creates a dispute, **not** a false
allocation. Overpayment becomes credit on account, not a forced match. A paid invoice is never
chased. A disputed invoice stops its reminder sequence. Predicted date beats naive terms on a
consistently-late customer. **False positive:** a customer within terms with no history of
lateness produces no worklist entry. `SalesInvoice.payments[]` is never written directly
(source-grep). No credit note, write-off or credit-limit change is possible at any confidence.

---

## AI-06 — Payables operations *(what the system does about money we owe)*

**Business meaning.** Match bills to POs and receipts, catch wrong tax and duplicates, know what's
due when, understand the cash impact, and *prepare* — never release — payment.

**What you have.** `lib/accounting/matching.ts` already does real PO↔bill matching, setting
`poMatchStatus`, `manualReviewRequired` and `discrepancyNotes`. `PurchaseOrder.orderLines[]`
carries `productQty`/`receivedQty`/`billedQty` — which AI-07 already uses for GRNI. There is no
GRN model; `StockMove` reaching `move_executed` is the receipt event.

**Extend `matching.ts`.** It is a genuine partial three-way match. AI-06 completes the third leg
(receipt) and adds the reasoning, not a parallel matcher.

**Algorithm.**
1. **Three-way match**: bill ↔ PO ↔ receipt, on quantity, price and total, within tolerance.
   Report *which leg fails and by how much* — "price variance of 340 on line 3, PO says 12.00,
   bill says 12.34" — never "mismatch". The existing `discrepancyNotes` field is where this lands.
2. **Duplicate check** — call AI-27's detection where it exists; today `lib/docIntel/
   duplicateCheck.ts` is bills-only and AI-01 extended it with file-hash and PO-reference checks.
   Use that. Cross-source duplicate search over payments and bank transactions is AI-27's Chunk 8
   scope; declare it `not_implemented` here rather than half-building it.
3. **Tax and terms**: correct tax rate selected (proposal metadata only, per Chunk 3's 0.2),
   payment terms present, early-payment discount available and worth taking.
4. **Due schedule and priority**: what must be paid when; what has a discount expiring; what can
   safely slip; which vendor relationships are sensitive.
5. **Cash impact** → feed AI-16.
6. **Payment-run proposal** per A.3: grouped by vendor, currency and bank account, with an
   `excluded[]` list carrying a reason per exclusion — unapproved, disputed, duplicate-suspect,
   match-failed, `not_implemented` bank-change check.

**Expected output.** `{match_results[{bill_ref, po_ref, receipt_refs[], legs{quantity, price,
total}, verdict, variances[]}], exceptions[], due_schedule[], payment_run_proposal{id, included[],
excluded[{bill_ref, reason}], totals_by_currency}, cash_impact, checks_not_implemented[]}`.

**Tests.** Quantity variance, price variance, missing receipt, over-receipt — each identifies the
failing leg and the amount. Duplicate bill detected. Discount opportunity surfaced.
**The payment run cannot be released by the AI at any confidence, with any policy, with the kill
switch on** — assert the raise. **False positive:** a bill matching its PO and receipt within
tolerance produces no exception. `matching.ts`'s existing callers behave identically (assert).

---

## AI-16 — Cash intelligence

**Business meaning.** Where the cash is, where it's going, and when it gets tight.

**Depends on** AI-05's predicted payment dates and AI-06's due schedule. Do not rebuild either.

**Algorithm.**
1. **Position**: every `BankAccount`, cleared vs uncleared, by currency. Non-INR balances carry
   the FX caveat from Chunk 4's A.1 — if no `FxRate` exists, report the balance in its own
   currency and mark the total `incomplete`. Never sum mixed currencies without a rate.
2. **Inflows**: open AR with **predicted** dates from AI-05, plus recurring revenue from
   `AiSchedule` deferred-revenue records, plus other known receipts.
3. **Outflows**: AI-06's due schedule, `Payroll` runs, committed POs, recurring subscription
   schedules. **Tax payments cannot be forecast** — no filing model exists (Chunk 6). Declare it
   `not_implemented` in the output; an outflow forecast that silently omits tax is dangerous.
4. **Roll forward** daily for the configured horizon.
5. **Risks**: projected balance below minimum; a date where outflows exceed available cash;
   currency-specific shortfall; concentration risk on one customer.
6. **Scenarios**: top customer pays 30 days late; non-critical payment run delayed; payroll early.
7. **Recommend** actions with amounts and dates. Never initiate one.

**Expected output.** `{position{by_account[], by_currency[], total_available, incomplete_reason},
forecast[{date, opening, inflows[], outflows[], closing, confidence}], risks[{date, shortfall,
cause, recommended_actions[]}], scenarios[], omissions[{what, reason}]}`.

**Tests.** Opening + inflows − outflows = closing, exactly, every period, on a multi-period
fixture. A predicted shortfall raises a risk. A consistently-45-day customer is forecast at 45,
not 30. Mixed currency without a rate → `incomplete`, never a wrong total. The workflow cannot
initiate a payment. **False positive:** a tenant with comfortable headroom produces no risks.

---

## AI-14 — Flux analysis

**Business meaning.** "Why did this number move?" Compare period to period or to budget, find the
material movements, and trace each to the transactions that caused it. Today this is a day of
spreadsheet work.

**What you have.** `lib/accounting/reports.ts` and `/api/finance/reports` (P&L, balance sheet,
trial balance, aged). Extend the existing report engine — it stays the source of the numbers.
`/api/finance/analytics` is generic KPI, not variance; don't overload it.

**Algorithm.**
1. Compare the target lines across the chosen basis. Budget comparison only if `Budget` data
   exists for the tenant; otherwise period-over-period and mark budget `not_available`.
2. **Two-part materiality filter** — absolute *and* percentage — so you neither drown the user in
   small accounts nor miss a 400% swing on a small one. Uses `AiMaterialityPolicy`; absent policy
   means every movement is reported `unclassified` rather than filtered by a guess.
3. **Decompose** each material movement: by counterparty, by transaction type, by one-off vs
   recurring, by timing/cut-off (ask AI-28) vs real change, by new vs ceased activity.
4. Drill to the specific transactions. Cite record IDs.
5. Produce a CFO-readable explanation where **every clause is backed by a traceable figure**.
6. **Flag what it cannot explain.** `unexplained_amount` is a first-class output and feeds AI-13
   as a material exception. Silence about an unexplained movement is the failure mode here.

**Expected output.** `{comparisons[{line, current, comparative, variance, variance_pct,
materiality_verdict, drivers[{description, amount, pct_of_variance, transaction_refs[],
type: "volume"|"price"|"one_off"|"timing"|"new"|"ceased"}], explanation, unexplained_amount,
confidence}], basis_available{budget, prior_period, prior_year}}`.

**Tests.** **Drivers + unexplained = total variance, to the cent, always** — this is the test that
proves the decomposition is real rather than narrative. A one-off large invoice is identified as
the driver, not the whole account. A timing difference is labelled `timing`. Immaterial movements
are not reported. Read-only: no write path exists in this workflow (source-grep).

---

## AI-15 — Anomaly detection

**Business meaning.** Continuously watch everything financial for things that don't fit the
pattern, and open an evidence-backed investigation. **Never accuses, never corrects.**

**Read A.5 first — the precision machinery is not optional garnish, it is the workflow.**

**Detector families.** Implement each as a separate, independently-scoreable, independently-
suppressible, independently-disableable detector:

- **Amount** — outside the historical distribution for this vendor/account/category; round-number
  clustering; amounts just under an approval threshold (`AccountingSettings.journals.
  approvalThresholdAmount` is real and is exactly the number to test against).
- **Counterparty** — brand-new vendor with a large first transaction; dormant vendor suddenly
  active; vendor sharing a bank account or address with an `Employee`.
- **Account** — rarely-used account suddenly active; posting inconsistent with the account's own
  history; manual entries to accounts that shouldn't receive them.
- **Timing** — outside business hours, weekends, back-dated postings, period-end clustering.
- **Journal pattern** — manual journals to cash, revenue or equity; unusual account pairs;
  reversals of reversals; entries by a user who rarely posts. (Overlaps AI-23 in Chunk 7 — AI-15
  detects; AI-23 will do the per-journal risk score. Keep the detectors here generic and reusable
  so AI-23 consumes them rather than duplicating.)
- **Ratio/trend** — margin, expense ratios, tax as a percentage of revenue: step changes without
  a driver from AI-14.

**Output is an investigation**, never a correction: what was observed, what normal looks like, how
far this deviates, the supporting records, and what a human should check.

**Expected output.** `{anomalies[{detector_id, severity, subject_refs[], observed, expected_range,
deviation, historical_basis, evidence[], suggested_checks[], suppression_key, silent}],
detector_health[{detector_id, raised, confirmed, dismissed, precision, sample_size, auto_disabled}]}`.

**Tests.** A vendor's normal monthly invoice does **not** fire on any detector — run this against
a fixture of a year of normal activity and assert **zero** anomalies; that is the single most
important test in this workflow. A 10× invoice fires. A weekend journal to revenue fires high.
Suppression persists across runs and scopes correctly. A detector below the precision floor
auto-disables and says so. No detector can propose a correction or reversal at any confidence.

---

## AI-25 — Working-capital intelligence

**Business meaning.** Explain and improve DSO, DPO and inventory days — and say *which customer,
vendor or item* caused the change, and what it's worth in cash.

**What you have.** `/api/finance/reports/aged` for AR and AP. AI-05's and AI-06's outputs.
Inventory days is blocked on the account-mapping question in Part 0.5.

**Algorithm.**
1. Compute DSO, DPO, DIO and the cash conversion cycle. **Document the formula used in the
   output** — there are several standard definitions and mixing them across periods is a classic
   reporting bug. Pick one, state it, keep it.
2. Inventory days: if the inventory account bucket is unresolved (Part 0.5), report
   `not_computable` with that reason. Do not guess the bucket.
3. Compare to prior periods.
4. **Attribute the movement** to named drivers: which customers slipped, which vendors were paid
   earlier, which items built up — with days of impact and cash impact each.
5. Quantify: "DSO up 6 days ≈ ₹3.4L tied up; ₹2.1L of that is Customer X."
6. Prioritise actions by cash released per unit of effort; hand to the attention engine.

**Expected output.** `{metrics{dso, dpo, dio, ccc, formula_used, not_computable[]}, comparatives,
movement, drivers[{type, entity_ref, days_impact, cash_impact}], cash_tied_up,
recommended_actions[]}`.

**Tests.** Formulas produce known values on a fixture set. **Driver cash impacts sum to the total
movement.** A single large late customer is identified as the dominant driver. Inventory days
reports `not_computable` while the mapping question is open. **False positive:** stable metrics
period-over-period produce no drivers and no actions.

---

# PART C — CHUNK 5 STOP GATE

```
[ ] TASK 0: /finance/ai-operations page live — Attention, Close, Policy tabs
[ ] Zero diffs on every pre-existing route in the UI regression run
[ ] Policy seed creates rows at declared ceilings, kill switches still false
[ ] internal_state tool category added; resolve_task + record_close_assertion migrated into it;
    source-grep test proves they cannot write outside models/ai/**
[ ] AI-24 wired into AI-13's recompute; not_checked domains down to one (tax)
[ ] Escalation keys off declared level, not clamped level — commented at the line
[ ] asset_bank landmine and inventory-account-mapping question recorded
[ ] AI-05 drafts allocations through paymentAllocation.ts; never writes SalesInvoice.payments[]
[ ] AI-05 extends reminderEngine.ts; no second reminder path; DunningRule not reused
[ ] Disputed invoice stops its reminder sequence
[ ] Sales-vs-Finance payment-state divergence counted and reported, not repaired
[ ] AI-06 extends matching.ts; existing callers behave identically
[ ] AI-06 payment run is a proposal document; release impossible at any confidence
[ ] Bank-change hold and cross-source duplicate search declared not_implemented with reasons
[ ] AI-16: mixed currency without a rate → incomplete, never a wrong total; tax outflow omission
    declared
[ ] AI-14: drivers + unexplained = total variance, to the cent
[ ] AI-15: a year of normal vendor activity produces ZERO anomalies
[ ] AI-15: suppression, precision tracking, auto-disable below floor, silent-until-proven
[ ] AI-25: inventory days reports not_computable while the mapping question is open
[ ] send_reminder NOT registered; no write tool added beyond internal_state
[ ] False-positive test for each of the six
[ ] Full suite green; tsc + eslint clean; API surface diffed
[ ] All four docs updated
```

**Report back with:** the new page's route and the UI regression result; the Sales-vs-Finance
payment-state divergence count and value from your fixtures; AI-15's detector table with precision
and how many shipped silent; AI-14's largest `unexplained_amount` on a realistic fixture; the list
of `not_implemented` checks across AI-06 and AI-16; and whether the Policy tab changed any
workflow's effective autonomy in your test tenant.

Then request **Chunk 6 — Batch E (AI-12, AI-17, AI-20, AI-21: compliance, group and financial
statement intelligence)**. Fair warning from your own Phase 0: there is no tax transaction ledger,
no return or filing model, and no intercompany or consolidation model anywhere. Chunk 6 is
mostly greenfield, and AI-20 may come back as "the data does not exist to do this honestly" —
which is a legitimate outcome I would rather hear than see faked.
