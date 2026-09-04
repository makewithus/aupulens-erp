# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 8a of 8 — BATCH G: OPERATIONS & DATA QUALITY
# (AI-19, AI-11, AI-27, AI-26, AI-30) — the final five workflows

> **Prerequisite met.** Chunk 7 accepted: 1258/1258 green, 25/30 built, and AI-18's uncited claims
> made structurally unrepresentable via a throwing `makeClaim` — which is the right way to
> implement that rule and not the way most people would have.
>
> Two things in your report were more valuable than the three workflows. **Downgrading
> `payment_against_approved_bill` and `access_change_authorised` from "partial" to
> `not_implemented`** — correcting me rather than stretching to fit the brief — is the behaviour
> that has kept this project honest. And `payment_against_approved_bill`'s reason ("no data model
> links an executed payment to a bill") is a finding with teeth: it directly shapes AI-27 below.
>
> Save this file to `docs/ai/BRIEF-08a-BATCH-G.md`.
>
> **After this chunk, all 30 workflows are built.** Chunk 8b covers the natural-language layer,
> the learning loop's evaluation machinery and golden datasets.

---

# PART 0 — CARRY-FORWARD AND TASK 0

## 0.1 Four genuine pre-existing UI failures — record, don't fix

`/finance/returns`, `/hr/attendance`, `/hr/leave`, `/sales/invoices/new` errored on the Chunk 6
scan, all pre-existing, none importing anything this project has touched. Add them to
`BASELINE_FAILURES.md` alongside the eslint baseline, with the same standing rule: **these four
may not be counted against AI work, and the count may not grow.**

Flag them to the human in your report as a separate line — four broken pages in production
modules is a real product issue that has nothing to do with this brief, and it should not stay
buried in an AI implementation log.

## 0.2 The targeted scan is accepted — with a coverage rule

28 routes in 102 seconds beats an hour of timeouts, and the crash diagnosis (resource contention
on a shared machine, not compile time) is sound. But "zero diffs" now means something narrower
than it did, so pin it down in `UI_REGRESSION.md`:

The targeted set must always contain (a) every route in the branch diff's import graph, (b) every
`/finance/ai-operations/**` route, and (c) a fixed canary sample of twenty untouched routes.
State the count and the composition in each chunk's report, so "28/28 clean" is interpretable.

## 0.3 `payment_against_approved_bill` — verify how far the gap goes, and report it

You established no data model links an executed payment to a bill. Before AI-27 starts, spend a
short, bounded investigation answering three questions, because AI-27's core value depends on the
answers:

1. When a vendor bill is paid in this system, **what record is created**, and what does it point
   at? (`lib/accounting/payments.ts` + `Invoice.paymentState` is the Finance side; does anything
   persist a payment *transaction* for a bill, or only a state flag?)
2. **Where do vendor bank details live** — `models/admin/Vendor.ts`, somewhere else, or nowhere?
   AI-19's bank-change control and AI-15's vendor-shares-bank-with-employee detector both assume
   they exist somewhere.
3. Is there any path from a `BankStatement` line to a bill it settled, other than AI-03's
   reconciliation match?

Write the answers into `SYSTEM_INVENTORY.md` and `OPEN_QUESTIONS.md`. If the honest answer to (1)
or (2) is "nowhere", say so plainly — AI-19 and AI-27 then scope down accordingly rather than
building against a model that isn't there. **This is a fifteen-minute investigation that decides
the shape of two workflows. Do it first.**

## 0.4 `approver_authority` is partial because RBAC has no authority tiers

Record it in `DECISIONS.md` as an open product question — *"should `lib/org/rbac.ts` gain an
authority-tier concept, so approval limits can be enforced rather than merely observed?"* — and
move on. Not this batch's problem, but it will keep surfacing and deserves a home.

## 0.5 Task 0: `master_data.changed` emission

AI-19 needs change tracking that does not exist today. Do **not** add history fields to `Vendor`,
`Customer` or `Employee` — that is a core-model change.

Instead, add thin additive `emitEvent('master_data.changed', {model, id, tenantId})` hooks at the
create/update routes for `Vendor`, `Customer`, `Employee` and `BankAccount`, exactly as Chunk 2
did for the accounting events. AI-19 then snapshots the sensitive fields into a
`models/ai/AiMasterDataSnapshot.ts` record and diffs successive snapshots to derive a change
history. Derived, additive, and it leaves the core models untouched.

---

# PART A — DECISIONS FOR THIS BATCH

## A.1 AI-19 may **place** a hold; it may never lift one

The asymmetry is the whole design. Holding a payment is safe and reversible by a human; releasing
one moves money. So:

- `place_hold` is registered as an `execute` tool at `CONTROLLED_AUTONOMOUS`, scoped to marking a
  vendor or a bill as held on the `AiPaymentRunProposal` and raising a `CRITICAL` attention item.
- **There is no `release_hold` tool.** A human clears a hold through the Attention tab. Assert
  that no registered tool can lift a hold at any autonomy level.

Same rule for AI-27.

## A.2 AI-19 writes derived master-data intelligence, never master data

`AiMasterDataProfile` (`models/ai/**`) holds what the AI has *observed* about a vendor or
customer: payment terms inferred from bill history, typical amounts, bank-detail change history
from 0.5's snapshots, duplicate candidates, missing-field verdicts, document expiry.

**No workflow in this batch writes to `Vendor`, `Customer`, `Employee`, `Product` or
`InventoryItem`.** Not a merge, not a field fill, not a normalisation. Source-grep test, same
pattern as AI-09's Sales restriction and AI-21's ledger restriction.

This also closes Chunk 5's `early_payment_discount` gap honestly: AI-06 can read observed payment
terms from `AiMasterDataProfile` and say "this vendor has historically offered 2/10 net 30 on
their invoices" — an observation with evidence — rather than requiring a `Vendor.paymentTerms`
field nobody has.

## A.3 AI-26 proposes policy; it cannot touch `smart-rules.ts` or any config

AI-26 inherits a queue of real, already-documented policy gaps. Its job is to surface them as
first-class, evidenced policy findings — not to fix them:

| Inherited gap | Source |
|---|---|
| `smart-rules.ts` rejects legitimate asset/liability offset entries; every schedule-driven posting trips it | Chunk 4, 0.3 |
| `smart-rules.ts` references `asset_bank`, which has never existed in `Account`'s enum | Chunk 5, 0.5 |
| No capitalisation threshold exists as a policy object | Chunk 3, A.5 |
| No materiality policy until `AiMaterialityPolicy` was created; still empty by default | Chunk 3, A.5 |
| `allowNonStandard` override rate is now measured — is it acceptable? | Chunk 4, 0.3 |
| Which accounts constitute inventory, given no inventory account type | Chunk 5, 0.5 — **AI-11 answers this** |

Every one becomes a `policy_gap` finding with evidence and an impact estimate. **No policy
mutation, no config write, no edit to `smart-rules.ts`** — assert it.

## A.4 Autonomy

| Workflow | Level | Note |
|---|---|---|
| AI-19 | `RECOMMEND`, plus `place_hold` at `CONTROLLED_AUTONOMOUS` | Never merges, never fills a field, never lifts a hold |
| AI-11 | `RECOMMEND` | Valuation rules stay deterministic; adjustments are judgement |
| AI-27 | `RECOMMEND`, plus `place_hold` | Release always human |
| AI-26 | `OBSERVE` | Proposes only |
| AI-30 | `CONTROLLED_AUTONOMOUS` for idempotent reversible repairs **only** | See A.5 |

## A.5 AI-30 is the only workflow gaining real autonomous repair — bound it tightly

Permitted repairs, and nothing else:
- Re-queue a dead-lettered `AiEvent`
- Re-run a failed **idempotent** integration sync
- Refresh a stale cache or projection (including `rebuildTaxProjection`)
- Re-link an orphan record to an **unambiguous** parent (exactly one candidate; two means escalate)

Hard bounds: never touches a financial record; retry cap per issue with exponential backoff; every
repair audited with before/after state; a repair that fails twice escalates and is never retried;
kill switch respected. **Assert that no repair path can write to any non-`models/ai/**` financial
collection.**

---

# PART B — THE FIVE WORKFLOWS

Order: **AI-19 → AI-11 → AI-27 → AI-26 → AI-30.**

AI-19 unblocks four accumulated `not_implemented` checks and feeds AI-27. AI-11 answers the
inventory-account question AI-25 and AI-26 are both waiting on. AI-27 needs AI-19's entity
matching. AI-26 collects everything. AI-30 last, because it detects stuck states across all of it.

---

## AI-19 — Master-data intelligence

**Business meaning.** Bad master data quietly poisons everything downstream. This watches vendors,
customers, items and employees for duplicates, gaps and dangerous changes.

**What you have.** `models/admin/Vendor.ts`, `models/sales/Customer.ts`, `models/hr/Employee.ts`,
`models/inventory/Product.ts` / `InventoryItem.ts`, `lib/docIntel/billCreate.ts`'s
resolve-or-create `Customer` behaviour (which Chunk 2 told you not to extend to vendors), AI-20's
related-party matcher from Chunk 6 — **reuse its scoring**, it already does name/tax-ID/bank/
address matching — and 0.5's new snapshot mechanism.

**Detection set.**
1. **Duplicate entities.** Reuse AI-20's matcher across vendor↔vendor, customer↔customer and
   item↔item. Propose a merge; **never merge**. Classification `certain | probable | possible`,
   same as AI-20, with the survivor proposed and the evidence listed.
2. **Missing critical fields.** Tax registration number where the compliance profile says the
   jurisdiction requires one, address, default account, currency. Report as gaps; do not fill.
3. **Bank-detail changes — the highest-fraud-risk event in any finance system.** Using 0.5's
   snapshot diffs: any change to bank details raises `CRITICAL`, **places a hold** on payments to
   that vendor (A.1), and requires out-of-band verification. Risk factors that raise severity
   further: change shortly before a large payment; change to an account matching an `Employee`'s;
   change with no supporting document; change by a user who doesn't normally edit vendors.
   **If 0.3's investigation finds vendor bank details don't exist anywhere**, ship this as
   `not_implemented` with that reason and build the snapshot mechanism anyway for the fields that
   do exist — the moment someone adds bank details, the control activates.
4. **Employee/vendor collision.** A vendor whose bank account or address matches an employee's.
   This closes AI-15's `vendor_shares_bank_or_address_with_employee` detector — implement it as a
   detector in AI-15's registry (Chunk 7's A.3 rule) and have AI-19 supply the matching.
5. **Inconsistent classification.** The same kind of vendor coded to different accounts across
   records — feed to AI-26.
6. **Expiring documents.** Tax certificates, insurance, licences, where such fields exist.
7. **Observed payment terms** per A.2, closing AI-06's `early_payment_discount` gap.

**Masking.** Bank details must be masked in every output, log, attention item and decision trace —
last four characters only. Assert it. An audit log that leaks account numbers is a liability.

**Expected output.** `{duplicates[{records[], similarity, matched_on[], classification,
proposed_survivor, evidence[]}], missing_fields[], bank_change_alerts[{entity_ref, field,
old_masked, new_masked, changed_by, changed_at, risk_factors[], hold_placed, hold_ref}],
employee_collisions[], expiring_documents[], observed_terms[], classification_inconsistencies[],
checks_not_implemented[]}`.

**Tests.** Two vendors differing by "Ltd"/"Limited" with the same tax ID → duplicate raised, no
merge performed. Bank-detail change → `CRITICAL` + hold placed; **the AI cannot lift the hold at
any autonomy level** (assert the raise). Bank details masked everywhere including the decision
trace. A vendor sharing an employee's bank account → collision raised. Expiring certificate raised
before expiry, not after. **False positive:** a clean, complete, stable vendor master produces zero
findings. No write to `Vendor`/`Customer`/`Employee` (source-grep).

---

## AI-11 — Inventory / COGS intelligence

**Business meaning.** Keep stock valuation honest and make sure cost of goods sold matches what was
actually sold. Your one workflow with no spec until now.

**What you have.** `models/inventory/Product.ts`, `InventoryItem.ts` (with the known non-compound
unique index caveat from `CLAUDE.md` #3 — do not touch it), `Stock.ts`, `StockMove.ts`,
`StockTransfer.ts`, `Batch.ts`, and AI-22's `inventory` reconciliation definition (which Chunk 7
hardened).

**Your first job is the question three chunks have been waiting on.** Chunk 5's Part 0.5:
*which accounts constitute inventory for reporting, given no dedicated inventory account type and
the `asset_current` bucket in use?* Answer it by inspecting how inventory postings actually land
in `StockMove`'s `accounting_created` path — then either register an explicit inventory-account
mapping in `AiComplianceProfile`-style config, or report that it cannot be determined without a
product decision. **AI-25's inventory days and AI-26's policy gap both unblock on this answer.**

**Algorithm.**
1. **Subledger-to-GL**: stock quantity × valuation versus the inventory GL balance. Feed AI-22's
   definition; do not duplicate it.
2. **Negative stock.** A data-integrity failure that silently corrupts COGS — high severity. Report
   the item, location, quantity, **and the movement sequence that caused it**, because the fix is
   almost always a sequencing problem, not a count.
3. **Count variances.** Counted versus system, by item and location, valued at the costing method
   actually in use. Propose the adjustment with the count as evidence; never post it.
4. **Valuation anomalies.** Cost swings outside tolerance, items with zero cost, cost without
   quantity or quantity without cost, landed costs not applied.
5. **Obsolescence.** No movement for N periods, quantity exceeding N periods of demand, expiry
   dates approaching via `Batch`. Propose a provision with the ageing evidence.
6. **Margin analysis.** Gross margin by item and category versus history. **A margin break usually
   means a costing error, and it is one of the highest-value anomalies in the whole system** —
   route it through AI-15's ratio/trend detector family rather than a new alert path.

**Autonomy.** `RECOMMEND`. Valuation rules stay deterministic; adjustments are judgement.

**Expected output.** `{inventory_account_mapping{resolved, accounts[], basis}, subledger_to_gl{
qty_value, gl_value, difference}, negative_stock[{item, location, qty, causing_sequence[]}],
count_variances[], valuation_anomalies[], slow_moving[], margin_alerts[]}`.

**Tests.** A sale posted before its receipt → negative stock detected with the causing sequence.
Count variance valued correctly at the costing method in use. Weighted average recomputed
correctly after a receipt. A seeded subledger-to-GL difference detected to the smallest unit.
**False positive:** a well-managed inventory with positive stock, matching valuation and stable
margins produces zero findings.

---

## AI-27 — Duplicate & duplicate-payment intelligence

**Business meaning.** Paying the same bill twice is the most common, most embarrassing and most
recoverable finance loss. Catch duplicates across documents, vendors and payments before money
leaves.

**What you have.** `lib/docIntel/duplicateCheck.ts`, already extended by AI-01 with file hash and
PO reference. AI-19's entity matching for the duplicate-vendor case. AI-06's
`AiPaymentRunProposal`. **And 0.3's answer about whether payments link to bills at all**, which
determines how much of this workflow is buildable.

**Scope honestly against 0.3's findings.** If executed payments are only a `paymentState` flag with
no transaction record, then "duplicate payment" detection operates over bills, expenses,
`BankStatement` lines and `AiPaymentRunProposal` entries — not over a payment ledger that doesn't
exist. Say so in `checks_not_implemented[]` rather than implying coverage you don't have.

**Similarity dimensions** — score each, combine into a risk score:
- Same vendor + same document number, normalised (strip spaces, leading zeros, case, punctuation)
- Same amount + same date + same vendor
- Same amount + close dates across **different vendor records** — the duplicate-vendor case, via
  AI-19
- Same file hash; same extracted content
- Same PO or receipt referenced by two bills
- A credit note never applied against a re-billed invoice
- Two documents summing to a prior single document (the split case)
- Same bank account paid twice for similar amounts, where that data exists

**Algorithm.**
1. On every new bill, expense or payment-run entry, search **across sources**, not within one
   table. Cross-source search is the entire point; a bills-only duplicate check already exists.
2. Score and classify `certain | probable | possible | unlikely`.
3. `certain` and `probable` → **place a hold** (A.1) and raise `CRITICAL` with a **side-by-side
   field comparison**, because the reviewer's first question is always "how are these different?"
4. **Retrospective sweep** over history: find duplicates already paid, quantify the recoverable
   amount, and rank by recoverability. This is the number that pays for the project — report it.

**The false-positive discipline here is stricter than anywhere else.** A legitimate identical
monthly subscription — same vendor, same amount, different service period — must not flag.
Neither must a genuine second instalment against the same PO. Both are common, and flagging them
teaches users to click past every duplicate warning, which is how the real one gets paid.

**Expected output.** `{candidates[{primary_ref, duplicate_ref, score, classification, matched_on[],
amount_at_risk, side_by_side{fields[{name, primary, duplicate, differs}]}, hold_placed,
recommended_action}], retrospective{scanned, found, total_value, recoverable, by_classification},
checks_not_implemented[]}`.

**Tests.** Same invoice number formatted differently → detected. The same bill entered under two
vendor records → detected via AI-19. **False positive, mandatory:** twelve monthly subscription
invoices, same vendor, same amount, consecutive months → **zero** flags. A legitimate second
instalment on one PO → no flag. A hold cannot be released by the AI. Existing
`duplicateCheck.ts` callers behave identically (assert again — third time this module is extended).

---

## AI-26 — Accounting policy intelligence

**Business meaning.** Keep treatment consistent. Find the transactions a policy touches, find
whether a policy governs an unusual transaction, and surface historical inconsistency. **It never
changes a policy.**

**What you have.** `lib/accounting/smart-rules.ts` (narrow Dr/Cr semantic validation — a real but
small precedent), `models/finance/AccountingSettings.ts` (rule flags, not a policy registry),
`AiMaterialityPolicy`, and the inherited gap queue in A.3.

**Algorithm.**
1. **Build a policy registry** — `models/ai/AiAccountingPolicy.ts`: `{tenantId, policyKey, scope
   conditions, statedTreatment, effectiveFrom, source: "configured"|"observed", version}`. Some
   policies are configured by a human; others are **observed** from consistent historical
   treatment. Mark which, always — an observed policy is a hypothesis, not a rule.
2. **On a new transaction**, determine whether a policy applies and whether the proposed treatment
   matches. Mismatch → finding.
3. **Consistency sweep.** The same kind of transaction treated differently across periods, users
   or accounts. Surface **with examples of both treatments and their record IDs** — an
   inconsistency finding without both sides is unactionable.
4. **Policy gaps.** A transaction type no policy covers. Plus the entire A.3 inherited queue,
   each with evidence and impact.
5. **Impact of change.** If a policy were changed, which past and future transactions are affected
   and by how much.

**Autonomy.** `OBSERVE`. **No policy mutation, no config write, no edit to `smart-rules.ts`** —
assert. AI-26 may propose a policy change as a governed configuration proposal a human approves,
reusing the existing `AiActionProposal` pattern.

**Expected output.** `{policies[{policy_key, source, stated_treatment, coverage_count}],
treatment_verdicts[{transaction_ref, verdict: "consistent"|"inconsistent"|"uncovered", policy_key}],
inconsistencies[{pattern, treatment_a{examples[]}, treatment_b{examples[]}, count, value}],
policy_gaps[{gap, evidence, impact_estimate, inherited_from}], impact_of_change[]}`.

**Tests.** A purchase above the (configured) capitalisation threshold that was expensed →
inconsistency with both examples cited. A transaction type with no policy → gap raised. All six
A.3 inherited gaps appear as `policy_gaps` with their sources. The workflow cannot write to
`AccountingSettings` or `smart-rules.ts` at any confidence. **False positive:** a tenant with
consistent treatment produces zero inconsistencies.

---

## AI-30 — ERP operations intelligence

**Business meaning.** The plumbing. Stuck workflows, failed integrations, unprocessed events,
stale data and broken dependencies — found and, where safe, fixed, before a user notices.

**What you have.** `lib/integrations/connectionService.ts::logEvent()`, `models/shared/
IntegrationEvent.ts`, your own `AiEvent` outbox with its dead-letter state, `AiWorkflowRun`,
`AiSchedule`, `AiToolCall`, and every cron route.

**This workflow finally has something worth monitoring** — twenty-nine workflows, a schedule
engine, an event bus and a tool layer all producing state that can get stuck.

**Detection set.**
- Records stuck in an intermediate state past an expected duration: `Invoice` in draft for N days,
  `JournalEntry` pending approval with no approver, `AiWorkflowRun` in-flight past a timeout,
  `AiToolCall` `in_flight` past its timeout (you built that state in Chunk 2).
- Dead-lettered `AiEvent`s and their causes, grouped.
- Failed integration syncs, expired credentials, webhook delivery failures, via `IntegrationEvent`.
- Stale data: a bank feed that hasn't updated, an `FxRate` table older than its policy window, a
  projection (`AiTaxTransaction`) older than its source.
- `AiSchedule`s with an overdue `nextRunDate` and no corresponding run.
- Orphans: a line without a header, an attachment without a parent, an `AiWorkflowRun` without a
  trace.
- Duplicate or looping cron executions.

**Algorithm.**
1. Sweep each detector; build health per module and per integration.
2. Classify each issue **safely repairable** (A.5's four permitted repairs) or **needs a human**.
3. Repair the safe ones within the retry cap, auditing before/after state.
4. Escalate the rest with the **specific** cause — which integration, which record, which error,
   since when, and what it is blocking. "Sync failed" is not an escalation.
5. Feed anything blocking accounting into AI-13's close blockers.

**Expected output.** `{health{by_module[], by_integration[]}, issues[{type, severity, subject_ref,
detected_at, age, cause, blocking[], auto_repairable, repair_attempted, repair_result,
retry_count}], repairs_performed[], escalations[]}`.

**Tests.** A dead-lettered event is re-queued exactly once and does not loop. A non-idempotent
failure is escalated, never retried. A stale bank feed produces both an ops issue and an AI-13
close blocker. Repair attempts are capped, audited, and escalate after two failures. **No repair
path can write to a financial collection** (source-grep). **False positive:** a healthy system
produces zero issues.

---

# PART C — CHUNK 8a STOP GATE

```
[ ] 0.3 investigation answered in SYSTEM_INVENTORY.md: what a bill payment creates, where vendor
    bank details live, whether BankStatement links to a bill — all three, plainly
[ ] Four pre-existing broken UI routes added to BASELINE_FAILURES.md and flagged to the human
[ ] UI_REGRESSION.md targeted-set composition rule documented; composition stated in this report
[ ] master_data.changed emitted from Vendor/Customer/Employee/BankAccount routes (additive hooks)
[ ] AiMasterDataSnapshot diffing derives change history without touching core models
[ ] place_hold registered; NO release path exists at any autonomy level (assert)
[ ] Bank details masked in every output, log, attention item and decision trace (assert)
[ ] Nothing writes Vendor/Customer/Employee/Product/InventoryItem (source-grep)
[ ] AI-19 reuses AI-20's matcher; no second entity-matching implementation
[ ] AI-15's vendor_shares_bank_or_address_with_employee detector implemented in AI-15's registry
[ ] AI-06's early_payment_discount closed via observed terms, or re-declared with a reason
[ ] AI-29's master_data_verification and bank_detail_change_process flipped or re-declared
[ ] AI-11 answers the inventory-account-mapping question, or reports why it cannot
[ ] AI-25's inventory days unblocked, or the reason it remains blocked is restated
[ ] AI-11 margin alerts route through AI-15's detector registry, not a new alert path
[ ] AI-27: twelve identical monthly subscription invoices produce ZERO flags
[ ] AI-27: retrospective sweep reports scanned / found / recoverable
[ ] AI-27: duplicateCheck.ts existing callers behave identically (third assertion)
[ ] AI-26: all six inherited policy gaps appear as findings with sources
[ ] AI-26 cannot write AccountingSettings or smart-rules.ts (assert)
[ ] AI-30: only the four permitted repairs; retry-capped; no financial collection writes (assert)
[ ] False-positive test for each of the five
[ ] Full suite green; tsc clean; eslint clean on touched files and baseline count not grown
[ ] API surface diffed; targeted UI scan clean
[ ] All docs updated; CAPABILITY_MAP shows 30/30 BUILT
```

**Report back with:** the three answers from 0.3; the targeted-scan composition and count; how many
of the accumulated `not_implemented` checks AI-19 closed and which remain, with reasons; AI-11's
inventory-account answer and whether AI-25 unblocked; AI-27's retrospective sweep numbers on your
fixtures **and** its false-positive result on the subscription fixture; AI-26's policy-gap count;
and AI-30's issue count on a healthy versus a deliberately-broken fixture.

Then request **Chunk 8b — AI-NL, learning and evaluation**, which is the last one: the
natural-language control surface mapping intent to the thirty registered workflows, the learning
loop's promotion machinery, golden datasets, and the evaluation metrics that have been
instrumented since Chunk 1 but never assembled into a picture.
