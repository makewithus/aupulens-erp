# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 4 of 8 — BATCH C: CONTINUOUS RECONCILIATION & DAY ZERO CLOSE
# (AI-22, AI-13, AI-24, AI-28, plus FX as a close domain)

> **Prerequisite met.** Chunk 3 accepted: 1102/1102 green, zero regressions, zero new routes,
> zero UI files touched, the schedule engine holding its invariants.
>
> Four findings in your Chunk 3 report matter more than the four workflows you shipped. Three of
> them you fixed correctly. One of them — `maxAutonomyLevel` never being consulted by the gate —
> is the most serious defect found in this project so far, and Part 0 of this chunk is the
> sign-off you asked for.
>
> Save this file to `docs/ai/BRIEF-04-BATCH-C.md`.
>
> Chunk 1 rules, Chunk 2 Part A, and Chunk 3 Part A all still apply except where overridden below.

---

# PART 0 — FOUNDATION DEFECTS: SIGN-OFF AND CARRY-FORWARD

## 0.1 `AiWorkflowPolicy.maxAutonomyLevel` is never consulted — **fix it, and this is your sign-off**

You flagged this correctly and were right to stop rather than fix it unilaterally. Sign-off given.
**This is Task 0 of Chunk 4 and nothing else in this batch starts until it is done.**

Why it outranks everything else in the queue: every autonomy ceiling I have set across Chunks 2
and 3 — the DRAFT cap, "Pass-2 fuzzy is RECOMMEND regardless of confidence", "inferred schedules
never auto-draft", "capitalisation stays judgement-gated" — has been holding **because each
workflow was written to behave**, not because the runtime enforced it. That is precisely the
class of defect you already found and fixed once in Chunk 1, when `act()` could run for a
`NEVER_AUTONOMOUS` action. Same shape, wider blast radius.

**Required fix.**
1. `decideAutonomy()` clamps the effective level to `min(workflow_declared, policy.maxAutonomyLevel,
   hard_coded_ceiling_for_action_class)`. A missing policy row clamps to `RECOMMEND`, consistent
   with the existing fail-closed default — **not** to the workflow's declared level.
2. The clamp is applied **before** the seven-check gate, and the clamping decision is recorded in
   the decision trace with which of the three bounds bound.
3. Add to `safety.test.ts`: a test workflow declaring `EXECUTE`, with policy `maxAutonomyLevel:
   RECOMMEND`, must not reach `act()`. Assert the same flag-never-set pattern you used for the
   Chunk 1 `NEVER_AUTONOMOUS` fix.

**Required verification pass — do this, do not skip it.** For each of the eight shipped workflows
(AI-01 through AI-04, AI-07 through AI-10), state in `IMPLEMENTATION_LOG.md`: its declared level,
its policy row's `maxAutonomyLevel`, and the effective level after the clamp. If any workflow's
real behaviour changes once the clamp is live, that is not a regression — it is the ceiling
finally being enforced — but it must be reported explicitly, workflow by workflow. I want to see
that list before you build AI-22.

## 0.2 Event fan-out needs an ownership contract, not per-event patches

You found `schedule.due` fanning out to all four Batch B workflows with no ownership check, and
fixed it. Generalise the fix rather than repeating it: **every workflow subscribing to an event
declares a `subscriptionFilter(event, subject)` predicate in its `WorkflowDefinition`**, evaluated
by the executor before the run is created. Default filter is "reject" — a workflow that declares
no filter for a shared event key does not run.

This matters immediately: Batch C introduces `period.horizon.reached` and `report.refreshed`,
both of which four workflows will want.

## 0.3 `allowNonStandard` on `smart-rules.ts` — allowed, but never silent

Your fix was right: using the existing audited override beats routing around the policy engine.
Two conditions going forward, tested:
- Every use appears in the run's `reason_chain` naming the rule overridden and why.
- Every use increments a metric on the envelope (`metrics.policy_overrides`), so the rate is
  visible rather than buried in traces.

Then open an `OPEN_QUESTIONS.md` entry: *"`smart-rules.ts` rejects legitimate asset/liability
offset entries; every schedule-driven posting trips it."* That is a genuine gap in the accounting
policy engine, and AI-26 (Chunk 8) is the workflow that owns proposing policy corrections. Do not
edit `smart-rules.ts` yourself.

## 0.4 Vestigial fields — you have found three; make it a list

`Invoice.invoiceLines[].taxIds`, `SaleOrder.revenueRecognition.amount`, and
`SaleOrder.revenueRecognition.method` are all stored-but-never-written. Add a **Vestigial fields**
section to `GLOSSARY.md` listing all three with the evidence, and add any you find in this batch.
`revenueRecognition.recognizedAt`/`recognizedBy` are *not* vestigial — you established a human
`q2cStatus` transition sets them — so record them separately as "human-set, not engine-derived".

## 0.5 `SalesInvoice`'s ambiguous Model export

Your call-site workaround was correct. Record it in `GLOSSARY.md` with the exact symptom, because
AI-05 (Chunk 5) and AI-21 (Chunk 6) will both hit it, and the third person to debug it should not
have to rediscover it.

---

# PART A — DECISIONS FOR THIS BATCH

## A.1 FX lands here, but **only as a close-blocker detector**

I deferred FX from Chunk 3 to here. Your Chunk 3 finding changes its shape: `PurchaseOrder`,
`SaleOrder` and `SalesInvoice` carry **no currency field at all**. Multi-currency is effectively
not supported outside `Invoice.currencyId` and `BankAccount`.

So do **not** build a remeasurement engine — there is almost nothing to remeasure. Build only:

1. `models/finance/FxRate.ts` — `{tenantId, fromCurrency, toCurrency, rateDate, rate, source:
   "manual"|"import", enteredBy}`, compound unique on `{tenantId, from, to, rateDate}`.
   **Manual and import entry only. The AI reads it and never writes it. Ever.**
2. An FX close-domain check inside AI-13: any non-INR balance on `Invoice` or `BankAccount` with
   no `FxRate` for the period end → a close blocker with severity by materiality.
3. Everything else stays `fx_unsupported` escalation, exactly as Batch B does.

No UI is required. If a tenant has no non-INR balances the domain reports `not_applicable`, and
that must be a distinct state from `ready` — "we checked and there's nothing here" and "we
haven't checked" must never look the same in this system.

## A.2 AI-13 must **not** mutate `PeriodClosing` — this overrides the generic brief

`PeriodClosing` is a real, human-advanced state machine (open → locked → accruals_posted →
reconciled → closed → statements_generated) with a financial `snapshot{}`. Hard Rule 4 says the AI
cannot close or lock a period.

The generic brief said AI-24 should "untick" a checklist item whose assertion fails. **Do not do
that.** Unticking mutates a human's sign-off record and changes the behaviour of an existing
screen.

Instead:
- AI-13 and AI-24 write to a **parallel** state: `models/ai/AiCloseState.ts` and
  `models/ai/AiCloseAssertion.ts`.
- Where a human-advanced `PeriodClosing.status` is contradicted by the data (status says
  `reconciled`, AI-22 says the bank pair has a material unexplained difference), that is a
  **`CRITICAL` finding** naming the contradiction, with both the human status and the machine
  evidence — not a status change.
- `PeriodClosing` is read-only to everything in this batch. Source-grep test, same pattern as
  AI-09's Sales restriction.

You also recorded that `PeriodClosing` and `TransactionLock` are not cross-wired — no code path
ties a status change to setting a lock. **Report that as a control finding in AI-29 territory,
do not wire them.** Wiring them changes existing behaviour.

## A.3 Autonomy for the whole batch — **OBSERVE / RECOMMEND**

This batch is analysis. Nothing here writes to the ledger.

| Workflow | Level |
|---|---|
| AI-22 | `OBSERVE` for the reconciliation computation. It may *invoke* AI-03's existing Pass-1 EXECUTE path for the bank pair — it does not gain a new write capability of its own. |
| AI-13 | `OBSERVE`. Auto-resolving safe blockers means *invoking the owning workflow* (AI-08's schedule run, AI-03's exact matching), never acting directly. |
| AI-24 | `OBSERVE` plus `create_task` for evidence requests. |
| AI-28 | `RECOMMEND`. Cut-off is judgement; it drafts nothing this batch. |

New tools this batch: `run_reconciliation`, `calculate_close_readiness`, `get_period_closing`
(read-only), `get_fx_rate`, `get_stock_valuation`, `get_payroll`, `build_evidence_pack`. No new
write tools at all. If you find yourself wanting one, stop and raise it.

## A.4 Materiality is now load-bearing

`AiMaterialityPolicy` from Chunk 3 is what separates a hard blocker from a minor exception in
AI-13's readiness model. Same rule as before: **absent policy means the workflow cannot classify
severity**, so every unresolved item is reported as `unclassified` with `materiality_configured:
false`, and the overall readiness status is `indeterminate` — never `ready`. A close that reports
`ready` because nobody configured materiality is the single worst output this batch could produce.

---

# PART B — THE FOUR WORKFLOWS

Order: **AI-22 → AI-13 → AI-24 → AI-28.** Strict dependency chain; do not reorder.

---

## AI-22 — Continuous reconciliation controller *(build first)*

**Business meaning.** Any two populations that must agree, agree — continuously, not at month
end. This is the generalisation of AI-03 from one pair (bank) to every subledger-to-control-account
pair in the system.

**What you have already.** AI-03 built a bank matcher and a reconciliation position
(`bank_balance`, `gl_balance`, `difference`, `unmatched_count`, `oldest_unmatched_days`). AI-10
built a register-to-GL tie-out as a reusable function, as instructed. **Both of those become
reconciliation definitions registered with this controller — they are not rewritten.**

**Architecture: one engine, many definitions.** A `ReconciliationDefinition` declares:
`{id, name, leftPopulation(tenantId, periodEnd), rightPopulation(...), matchStrategy,
tolerance, classifyDifference(), owner}`. The engine is generic; each pair is data plus two
population functions.

**Pairs to register in this batch** — only those with real data behind them:

| Definition | Left | Right | Notes |
|---|---|---|---|
| `bank` | `BankStatement` lines | bank GL account | Wraps AI-03's existing position function |
| `ap_control` | Finance `Invoice` `moveType: in_invoice`, open | payable control account | |
| `ar_control_finance` | Finance `Invoice` `moveType: out_invoice`, open | receivable control account | **Finance side only** — Sales-side AR is AI-05, Chunk 5 |
| `fixed_assets` | `Asset` register cost / accum / NBV | asset GL accounts | Wraps AI-10's tie-out function |
| `inventory` | `Stock` valuation | inventory GL | |
| `payroll` | `Payroll` run totals | `salaryExpenseJournalId` + `disbursementJournalId` entries | Real link exists |
| `prepaid` | `AiSchedule` type `prepaid` remaining | prepaid GL | |
| `deferred_revenue` | `AiSchedule` type `deferred_revenue` remaining | deferred revenue GL | |
| `suspense_clearing` | n/a | suspense / clearing accounts | Target is **zero**; any balance is an exception |

**Explicitly deferred, and say so in the output rather than omitting them:** `tax` (no tax
transaction ledger — Chunk 6), `intercompany` (no model exists at all), `processor_settlement`
(no data source). Each must appear in the definitions list with `status: "not_implemented"` and a
reason. A close readiness report that silently omits tax reconciliation is a false-completion
vector, which is exactly what Part 9 item 6 forbids.

**Algorithm.**
1. Load both populations as of a consistent point in time. Consistency matters — if the left is
   read at 10:00 and the right at 10:05 with a posting in between, you manufacture a phantom
   difference. Pin a read timestamp.
2. Match: exact → within tolerance → fuzzy → unmatched.
3. Classify every difference: `timing`, `error`, `missing_left`, `missing_right`, `fx`,
   `rounding`, `duplicate`, `unexplained`.
4. Trace each to its cause with record references.
5. **Age** every open exception. `oldest_open_item_days` per definition is a first-class output —
   ageing exceptions are how a close silently rots.
6. **Block false completion, structurally.** `status: "reconciled"` is only reachable when the
   difference is within tolerance **and** every non-zero item is classified and owned. Implement
   this as a function that cannot return `reconciled` with an `unexplained` item in scope, and
   test it directly — do not rely on the caller checking.

**Expected output.** Per definition: `{definition_id, period, left_total, right_total, difference,
tolerance, status: "reconciled"|"reconciled_with_exceptions"|"unreconciled"|"not_implemented"|
"not_applicable", matched_count, unmatched_left[], unmatched_right[], differences[{type, amount,
age_days, cause, owner, evidence[]}], oldest_open_item_days, materiality_configured}`.

**Tests that must pass.**
- Zero difference → `reconciled`.
- Difference of one unit outside tolerance → `unreconciled`.
- **A classified, owned, in-tolerance difference → `reconciled_with_exceptions`, never
  `reconciled`.**
- **An unexplained difference can never produce `reconciled`, at any tolerance** — assert against
  the function directly.
- Ageing increments correctly across two runs on the same fixture.
- Re-running does not duplicate matches or double-count.
- A suspense account with any balance → exception.
- `not_implemented` definitions appear in output with their reason, and do not count toward a
  "everything reconciled" verdict.
- The bank definition produces the same numbers as AI-03's existing position function on the same
  fixture (assert equality — proves you wrapped rather than reimplemented).

---

## AI-13 — Day Zero Close

**Business meaning.** The close should already be done when the month ends. This is not a button
and not a screen — it is a continuously recalculated state answering, at any instant: *if we
closed right now, what would stop us, and what is it worth?*

**What you have.** `PeriodClosing` (read-only per A.2), AI-22's definitions, AI-07's stale
accruals, AI-08's overdue recognitions, AI-10's tie-out and depreciation exceptions, AI-03's
unmatched bank population. **Most of AI-13 is aggregation of work already done.** Resist rebuilding
any of it.

**The close domains** — each returns one of `ready | blocked | at_risk | not_applicable |
not_checked`. The last two being distinct is essential (A.1).

| Domain | Source |
|---|---|
| Transactions | Draft/unposted `JournalEntry`, failed events in the DLQ, orphaned `AiEvent`s |
| Bank | AI-22 `bank` |
| AR (Finance) | AI-22 `ar_control_finance` |
| AP | AI-22 `ap_control` + unmatched bills from AI-06's future scope → `not_checked` for now |
| Inventory | AI-22 `inventory` + negative stock |
| Accruals | AI-07 stale accruals + unposted GRNI candidates |
| Prepaids | AI-22 `prepaid` + AI-08 overdue recognitions |
| Revenue | AI-22 `deferred_revenue` + AI-09 gaps |
| Fixed assets | AI-22 `fixed_assets` + AI-10 exceptions |
| FX | A.1 — missing rate for any non-INR balance |
| Tax | `not_checked` with reason "no tax transaction ledger" until Chunk 6 |
| Payroll | AI-22 `payroll` |
| Intercompany | `not_applicable` — no model exists |
| Controls | Missing approvals on `JournalEntry.approvalRequired`; period-lock violations |
| Evidence | AI-24 (built next; until then `not_checked`) |

**Every `not_checked` domain must state why.** A readiness report where half the domains are
quietly absent is worse than no report.

**Algorithm.**
1. Recompute on `period.horizon.reached`, on the hourly sweep, and on material events. Persist to
   `AiCloseState` per `{tenantId, period}` so a read is a single lookup, well under a second.
2. Classify each blocker deterministically per Part 4.2: `HARD_BLOCKER`, `MATERIAL_EXCEPTION`,
   `MINOR_EXCEPTION`, `STALE`, `READY`. **This function is pure and unit-tested against a fixture
   matrix** — the AI explains and ranks; it does not decide validity.
3. **Auto-resolve safe blockers by invoking the owning workflow**, never by acting directly:
   an overdue prepaid recognition → trigger AI-08's schedule run; unmatched exact bank lines →
   trigger AI-03's Pass 1. Record which workflow resolved what.
4. Rank the rest by amount and risk; assign an owner; attach evidence and a recommended action.
5. **A blocker clears only when the underlying data changes.** Never because a workflow ran and
   reported success. Re-derive from source on every recomputation; do not cache resolution.
6. Where `PeriodClosing.status` contradicts the computed state, raise the `CRITICAL` contradiction
   finding per A.2.

**Expected output.** `{period, entity_id, readiness{status: "blocked"|"at_risk"|"ready"|
"indeterminate", score, hard_blockers, material_exceptions, minor_exceptions, stale_items,
domains_not_checked}, domains[{domain, status, reason_if_not_checked, blockers[{id, severity,
title, amount, owner, evidence[], recommended_action, age_days, auto_resolvable, source_workflow}]}],
auto_resolved_this_run[], period_closing_status, contradictions[], trend{blockers_over_time[]}}`.

**Tests that must pass.**
- A material unreconciled bank difference makes the period `blocked`.
- Resolving it **in the data** clears the blocker on the next recomputation; resolving it by
  re-running the workflow with unchanged data does **not**.
- The AI cannot lock or close a period, and cannot write to `PeriodClosing` (source-grep test).
- `PeriodClosing.status = reconciled` while AI-22 reports unreconciled → `CRITICAL` contradiction.
- Materiality not configured → `indeterminate`, never `ready`.
- A domain with no applicable data reports `not_applicable`; an unimplemented one reports
  `not_checked` with a reason. Neither counts as `ready`.
- Recomputing twice on unchanged data produces an identical result (determinism).
- Readiness classification is pure — same inputs, same output, no DB reads inside the classifier.

---

## AI-24 — Close evidence controller

**Business meaning.** For every close item, does the *actual ERP state* prove it's done — not "did
someone tick a box"?

**What you have.** `PeriodClosing`'s checklist states, AI-13's domains, `ActivityLog`,
`chatter[]` arrays, `Invoice.sourceDocument`/`sourceId`, `ExtractedDocument` links from AI-01.

**Algorithm.**
1. For each close item, define a **machine-verifiable assertion** — a pure predicate over live
   data. Example: "bank reconciled" ⇒ AI-22's `bank` definition returns `reconciled` for this
   period with zero aged exceptions. Store assertions as first-class records
   (`AiCloseAssertion`) so they are inspectable, not buried in code.
2. Evaluate every assertion. Record `{verified, evidence[], evaluated_at}`.
3. Where an assertion needs a document that doesn't exist, create **one** evidence-request task
   addressed to the owner — deduped, so a nightly sweep doesn't generate thirty copies of the
   same request. This is the failure mode most likely to make users disable the whole feature.
4. Where a human-advanced status is contradicted by a failing assertion, raise the finding per
   A.2. **Do not untick anything.**
5. Report unsupported material balances: a material GL balance with no linked reconciliation and
   no supporting document.

**Expected output.** `{period, items[{item, assertion_id, assertion_description, verified,
evidence[], missing[], owner, request_task_id, evaluated_at}], completeness_pct,
unsupported_material_balances[], contradictions[]}`.

**Tests that must pass.**
- A manually-advanced item whose assertion fails reports `verified: false` **and** a contradiction.
- A missing document generates exactly one evidence request across repeated sweeps (dedupe test).
- When the document arrives, the assertion passes and the request auto-resolves.
- `completeness_pct` equals verified ÷ total, and excludes `not_applicable` items from the
  denominator.
- No write to `PeriodClosing` (source-grep).

---

## AI-28 — Cut-off intelligence

**Business meaning.** Transactions posted in the wrong period misstate both periods. Find them by
comparing the posting date with evidence of when the thing actually happened.

**Evidence dates available in this repo** — use these, in this priority order per transaction type:

| Transaction | Governing date evidence |
|---|---|
| Vendor bill | `StockMove` execution date (receipt) > PO receipt date > invoice date |
| Goods received | `StockMove` reaching `move_executed` |
| Sales invoice | delivery / fulfilment `StockMove` > invoice date |
| Prepaid / deferred | `AiSchedule.startDate` / period boundaries |
| Expense | receipt date on the `Expense` |
| Payroll | `Payroll` period, not the posting date |

**Algorithm.**
1. Scan transactions posted within a window either side of the period boundary.
2. Gather the governing date per the table above; where the governing date is absent, report
   `evidence_unavailable` rather than falling back to the posting date and declaring it correct.
3. Compare to the posted period; quantify the effect on each period separately.
4. Propose: reclass if both periods are open; a current-period adjustment if the earlier period
   is locked (check the real `TransactionLock`); **never a back-dated post**.
5. Look in both directions — things posted here that belong there, and things that will arrive
   next period but belong here. The second is an accrual: hand it to AI-07 rather than duplicating
   its logic.

**Expected output.** `{cutoff_exceptions[{transaction_ref, posted_period, evidence_period,
governing_date_type, evidence[], amount, effect_on_periods{}, proposed_action, materiality,
prior_period_locked}], evidence_unavailable_count}`.

**Tests that must pass.**
- Goods received on the 30th, invoiced on the 3rd → belongs to the earlier period.
- A locked prior period → proposes a current-period adjustment, never a back-dated post
  (assert against the real `TransactionLock`).
- **False positive:** a transaction posted in the same period as its governing date → no finding.
- Missing evidence → `evidence_unavailable`, not a silent pass.
- A next-period-arriving cost is routed to AI-07, not accrued twice.

---

# PART C — CHUNK 4 STOP GATE

```
[ ] TASK 0: maxAutonomyLevel clamp live; effective-level table for all 8 shipped workflows
    reported in IMPLEMENTATION_LOG.md; safety.test.ts covers the clamp
[ ] subscriptionFilter contract added; default-reject; period.horizon.reached fan-out correct
[ ] allowNonStandard uses appear in reason_chain and metrics.policy_overrides
[ ] Vestigial-fields section in GLOSSARY.md; SalesInvoice export quirk recorded
[ ] FxRate model exists; AI never writes it; missing-rate is a close blocker
[ ] not_applicable and not_checked are distinct states everywhere, never collapsed into ready
[ ] AI-22: one engine, 9 registered definitions, 3 not_implemented with stated reasons
[ ] AI-22: bank definition returns identical numbers to AI-03's existing position function
[ ] AI-22: fixed_assets definition wraps AI-10's tie-out function, not a reimplementation
[ ] AI-22: "reconciled" is structurally unreachable with an unexplained item — tested directly
[ ] AI-13: readiness classifier is pure, unit-tested against a fixture matrix
[ ] AI-13: blockers clear only on data change, never on workflow success
[ ] AI-13/AI-24: zero writes to PeriodClosing (source-grep test)
[ ] AI-13: PeriodClosing contradiction raises CRITICAL, does not mutate status
[ ] AI-24: evidence requests dedupe across repeated sweeps
[ ] AI-28: never proposes a back-dated post into a locked period
[ ] Materiality absent → indeterminate readiness, never ready
[ ] False-positive test for each of the four
[ ] Full suite green; tsc + eslint clean; API surface diffed; UI regression zero-diff
[ ] CAPABILITY_MAP, GLOSSARY, IMPLEMENTATION_LOG, OPEN_QUESTIONS updated
```

**Report back with:** the Task 0 effective-autonomy table for all eight shipped workflows and any
behaviour that changed once the clamp went live; the AI-22 definition list with each one's status
and, for `not_implemented`, its blocking reason; whether any close domain came back `ready` on
your fixtures and what it took; the count of `not_checked` domains; and any finding that
contradicts Chunks 1–3.

Then request **Chunk 5 — Batch D (AI-14, AI-15, AI-16, AI-05, AI-06, AI-25)**, the intelligence
layer. That is the batch where the Sales-side AR restriction from Chunk 2's A.1 finally lifts, and
where `SalesInvoice`'s export quirk and the two parallel payment models
(`models/sales/Payment.ts` vs `Invoice.paymentState`) stop being avoidable. Nothing to do about
that now — but if Batch C surfaces anything about how those two payment layers diverge, record it,
because it is Chunk 5's first problem.
