# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 6 of 8 — BATCH E: COMPLIANCE, GROUP & STATEMENT INTELLIGENCE
# (AI-12, AI-17, AI-21, AI-20)

> **Prerequisite met.** Chunk 5 accepted: 1192/1192 green, 18/30 workflows built, the
> `/finance/ai-operations` page live with zero diffs across 239 pre-existing routes, and the
> policy seed reading `listWorkflows()` rather than a hand-maintained table — which is the right
> instinct and stops the seed drifting from reality.
>
> Two things in your report I want to single out. Shipping all nine anomaly detectors **silent**
> with precision unmeasured is exactly right for day one, and Part 0.3 gives you the missing
> half — there is currently no way for precision to ever become measurable. And declaring
> `early_payment_discount` as `not_implemented` when you discovered mid-build that no
> payment-terms field exists anywhere is precisely the behaviour this project needs; a lesser
> implementation would have invented Net-30.
>
> Save this file to `docs/ai/BRIEF-06-BATCH-E.md`.
>
> **This is the batch where I expect at least one workflow to come back as "cannot be built
> honestly."** See Part B, AI-20. That is a successful outcome, not a failure.

---

# PART 0 — CARRY-FORWARD AND TASK 0

## 0.1 AI-11 is **Inventory / COGS intelligence** — your one unknown row, resolved

`CAPABILITY_MAP.md` has carried AI-11 as `PENDING SPEC` since Chunk 1 because no cross-reference
existed. Its name is **Inventory / COGS intelligence**: keeping stock valuation honest and making
sure cost of goods sold matches what was actually sold — negative stock, count variances,
valuation anomalies, obsolescence, and margin breaks that usually indicate a costing error.

Update the `CAPABILITY_MAP.md` row now with the name and a status assessment against
`models/inventory/**` (which you already inventoried), so the map is complete for the first time.
**The full spec arrives in Chunk 8.** Do not build it yet.

Note the dependency this creates: AI-25's inventory-days gap (Part 0.5 of Chunk 5, the
`asset_current` bucket question) is really an AI-11 question. Leave it open; AI-11 answers it.

## 0.2 UI harness needs a warm-up phase

Eleven routes flagged on your first pass, all cold-compile timeouts, all clean on a warm re-scan.
You diagnosed it correctly, but a harness that produces eleven false positives on every run will
eventually be believed. Add a warm-up pass to `scripts/ui-regression-scan.ts`: hit every route
once, discard the results, then scan. Report both numbers so a genuine timeout is still visible.

## 0.3 Anomaly review actions — without these, precision can never be measured

Nine detectors shipped silent, precision unmeasured, "correct day-one state." Correct — but
nothing in the Attention tab lets a user tell the system whether an anomaly was real. Precision
will stay unmeasured forever and no detector will ever come out of silent mode.

Add two actions to the Attention tab, alongside the existing resolve and snooze:

- **Confirm as real** → increments the detector's true-positive count; the item stays as a task.
- **Expected — don't flag this again** → increments the false-positive count **and** writes the
  suppression key AI-15 already emits, scoped as the detector declares.

Both write through `internal_state` tools. Then AI-15's `detector_health` becomes live data, and
the auto-disable-below-floor mechanism you built has something to act on.

## 0.4 Give AI-28 a callable export

You reported AI-14's `timing_vs_real_change_decomposition` as `not_implemented` because AI-28
exports nothing callable. Fix the export, not the declaration: extract AI-28's cut-off evaluation
into a plain service function (`isTimingDifference(transactionRef, periodBoundary)` or similar)
that AI-14 can call without going through the executor. AI-28's workflow wraps the same function.

Then AI-14's driver `type` can return `"timing"` for real, and one of your three honest gaps
closes. Do this in Task 0, before AI-12 — AI-21 will want it too.

## 0.5 Prove the policy loop once, in a browser

You proved the Policy tab writes the same field the gate reads, at the mechanism level, across
every test in Chunk 5. That is strong. Close it end to end once: a single browser-level test that
flips `maxAutonomyLevel` for one workflow in the Policy tab, then runs that workflow and asserts
the effective level changed. One test, one workflow — enough to prove the loop, not a suite.

## 0.6 Carried gaps that belong to Chunk 8, not this batch

Do not build these here. Confirm they are recorded and move on:
`early_payment_discount` (no payment-terms field) → AI-19; `vendor_shares_bank_or_address_with_
employee` (no vendor bank details tracked) → AI-19; `cross_source_duplicate_search` → AI-27;
`vendor_bank_change_hold` → AI-19; the inventory account bucket → AI-11.

---

# PART A — DECISIONS FOR THIS BATCH

## A.1 The tax ledger is a **derived projection**, never a source of truth

`SYSTEM_INVENTORY.md` established: `TaxRate` holds rates; tax math is inline in
`lib/sales/invoiceMath.ts` and equivalent Finance logic; there is no tax transaction ledger and no
central tax engine. Chunk 3 added that `Invoice.invoiceLines[].taxIds` is vestigial.

Do **not** build an authoritative tax ledger. That would create a second place where tax truth
lives, and the two would diverge within a quarter.

Build `models/ai/AiTaxTransaction.ts` as a **rebuildable projection**: for each taxable
transaction, the tax amounts *already computed and stored by the existing inline math*, projected
into a queryable shape `{tenantId, sourceRef{model,id}, direction: input|output, jurisdiction,
taxRateRef, taxableAmount, taxAmount, documentDate, periodKey, evidenceRefs[], projectedAt,
projectionVersion}`.

Rules:
- **Rebuildable from source at any time.** A `rebuild(period)` function must reproduce the
  projection exactly. Test: rebuild twice, get identical results; corrupt a row, rebuild, it heals.
- **The AI never computes a tax figure.** It reads what the invoice already computed. If a
  document's stated tax and its `TaxRate` imply different numbers, that is a finding, not a
  correction — the same rule as Chunk 2's A.6.
- **Never written by a workflow's `act()` stage** except through a registered `internal_state`
  tool, and never modified per-row by anything other than a rebuild.

## A.2 One shared, human-maintained compliance profile

AI-12 needs to know which jurisdictions the tenant is registered in. AI-17 needs a filing
calendar. Neither exists. Rather than two half-models, build one:

`models/ai/AiComplianceProfile.ts` — `{tenantId, registrations[{jurisdiction, taxType,
registrationNumber, effectiveFrom, effectiveTo}], obligations[{jurisdiction, taxType, returnType,
frequency, dueDayOffset, firstPeriod}], thresholds[{jurisdiction, taxType, turnoverThreshold}]}`.

**Human-entered, AI read-only, enforced structurally.** Add it to the `internal_state` allow-list
as read-only — it is the one `models/ai/**` model no workflow may write. Surface it on the Policy
tab as a simple form. An empty profile means AI-12 and AI-17 report `not_configured` and produce
no obligations — never an assumed GST-monthly default.

## A.3 There is no submission mechanism, and none is being built

`submit_filing` stays **unregistered**. No workflow in this batch can submit anything anywhere.
AI-17 prepares and reports readiness; a human files. Assert this: a test that no registered tool
has an external-submission side effect.

This is not a limitation to work around. Submission requires portal integrations, credentials,
signing and a legal audit trail, none of which exist. Building a fake one would be the single most
dangerous thing in this project.

## A.4 Autonomy: `OBSERVE` / `RECOMMEND` across the whole batch

No new financial write tools. New tools this batch are read/analyse plus `internal_state`:
`get_tax_transactions`, `get_compliance_profile`, `run_tax_reconciliation`,
`build_tax_workpaper`, `get_statement`, `run_statement_annotation`, `rebuild_tax_projection`
(`internal_state`), `record_anomaly_review` (`internal_state`, from Part 0.3).

## A.5 Jurisdiction-agnostic, GST-shaped

`TAX_RATE_TYPE` includes GST and the tenant base currency is INR, so GST is the working example.
But **do not hard-code Indian return structures**. The return dataset is
`{boxes[{code, label, value, supporting_transaction_count, supporting_refs[]}]}` driven by the
obligation's `returnType` in the compliance profile. A tenant configuring a different jurisdiction
gets a workpaper with different boxes and no code change.

---

# PART B — THE FOUR WORKFLOWS

Order: **AI-12 → AI-17 → AI-21 → AI-20.**

---

## AI-12 — Tax intelligence

**Business meaning.** Get the tax treatment right on every transaction, keep the tax ledger
reconciled to the returns, and have the workpaper ready before the deadline.

**What you have.** `TaxRate` (rates only). Inline tax math per invoice. No ledger, no return, no
registration record. A.1 and A.2 give you the two models you need.

**Algorithm.**
1. **Project.** Build `AiTaxTransaction` rows from Finance `Invoice` (both `moveType`s),
   `SalesInvoice`, and `Expense`, per A.1. Direction: input tax on purchases and expenses, output
   tax on sales. Record the jurisdiction from the compliance profile, matched by the transaction's
   place of supply where determinable — otherwise `jurisdiction_unresolved`, which is a finding.
2. **Three-way reconciliation** — the core of this workflow:
   - **Ledger**: the tax control account balance in the GL.
   - **Transactions**: the sum of `AiTaxTransaction` for the period.
   - **Return**: the total the workpaper would report.
   All three must agree. Any two disagreeing is a finding with the difference traced to specific
   transactions. Register this as a new AI-22 reconciliation definition (`tax`) — Chunk 4 shipped
   it as `not_implemented` with the reason "no tax transaction ledger exists — Chunk 6." **Flip it
   to implemented and remove the deferral note.** That takes AI-13's permanent `not_checked`
   domains from one to zero.
3. **Treatment review, proposal-only.** For each transaction, evaluate whether the rate applied
   looks consistent with the counterparty's registration status, the place of supply, and how
   similar transactions were treated. Disagreements are findings. **Never change a tax code, never
   create or modify a `TaxRate`** — test the raise.
4. **Missing evidence.** Input credit claimed with no counterparty tax registration number; no
   tax invoice attached; a transaction in a jurisdiction with no registration in the profile.
5. **Build the return dataset and workpaper** per A.5: box values plus the transaction-level
   support behind each box, plus the exceptions list. A box whose value does not equal the sum of
   its supporting transactions is a defect, not a rounding note.

**Expected output.** `{period, jurisdiction, profile_configured, return_dataset{return_type,
boxes[]}, three_way{ledger, transactions, return, differences[{pair, amount, traced_refs[]}]},
treatment_exceptions[], missing_evidence[], jurisdiction_unresolved_count}`.

**Tests.** Rebuild the projection twice → identical. Corrupt a row, rebuild → healed. Box totals
equal the sum of their supporting transactions, exactly. A seeded 1-unit tax control account
difference is detected and traced. Input credit without a counterparty registration number is
flagged. **The workflow cannot mutate a `TaxRate` at any confidence** — assert the raise.
**False positive:** a clean period with matching three-way totals produces zero findings. Empty
compliance profile → `not_configured`, no invented obligations.

---

## AI-17 — Compliance readiness

**Business meaning.** Never miss a filing, and never file with a gap. Watch the statutory calendar
and check the data behind each obligation is complete *before* the deadline.

**What you have.** AI-12's reconciliation, `AiComplianceProfile`'s obligations, AI-24's evidence
assertions. Nothing else — no filing model, no submission path (A.3).

**Algorithm.**
1. **Generate the obligation calendar** from the profile: for each obligation, the periods and
   their due dates from `frequency` + `dueDayOffset`. Empty profile → no obligations, stated
   plainly.
2. **Readiness per obligation**: is AI-12's three-way reconciled for that period; is the workpaper
   generated; is evidence complete per AI-24; are there unresolved treatment exceptions?
3. **Registration gaps**: taxable activity in a jurisdiction with no registration in the profile;
   turnover crossing a configured threshold. Both are `HIGH` findings, and both depend entirely on
   the profile being filled in — say so when it isn't.
4. **Deadline risk, scored early.** Days remaining versus unresolved blockers versus how long
   preparation has historically taken. **An obligation that first appears at-risk three days
   before its deadline is a failure of this workflow** — the warning window must be configurable
   and default generous (weeks, not days).
5. Feed obligations into AI-13's close state and into the Attention tab.

**Expected output.** `{profile_configured, obligations[{jurisdiction, tax_type, return_type,
period, deadline, days_remaining, readiness: "ready"|"at_risk"|"blocked"|"not_assessable",
blockers[], workpaper_ref, missing_evidence[], last_filed_note}], registration_gaps[],
submission_capability: "not_implemented"}`.

**Tests.** An obligation with unresolved blockers inside the warning window → `at_risk`, and the
warning fires at the configured window, not at the deadline. Threshold crossed → registration gap.
Empty profile → zero obligations and `profile_configured: false`, never a default calendar.
No registered tool can submit anything (A.3 assertion). **False positive:** a fully reconciled
period with complete evidence and weeks remaining → `ready`, no noise.

---

## AI-21 — Financial statement intelligence

**Business meaning.** The statements, live, with every line interrogable — click a number, get the
transactions. See at a glance which lines are unsupported, stale, or unexplained.

**What you have.** `lib/accounting/reports.ts` and `/api/finance/reports` (P&L, balance sheet,
trial balance, aged). **Extend the existing report engine — it remains the source of the numbers.**
You are adding an annotation and drill layer, not a second reporting engine. Part 9 item 1.

**And you already have every input this needs:** AI-14 for movement explanation, AI-22 for
reconciliation status per account, AI-24 for evidence completeness, AI-13 for staleness,
AI-28 (via Part 0.4's export) for timing. AI-21 is mostly composition. Resist rebuilding any of it.

**Algorithm.**
1. Generate statements through the existing engine. Do not recompute a single figure.
2. **Annotate each line** with: materiality verdict; movement versus comparative; the
   reconciliation status of the underlying accounts (from AI-22); evidence status (from AI-24);
   staleness in days since the supporting control last verified.
3. **Flag unsupported material lines** — a material balance whose supporting reconciliation is
   stale, failed or missing. This is the highest-value output of the workflow and it is the thing
   an auditor asks for first.
4. **Drill-down**: line → accounts → journals → transactions → source documents. Reuse whatever
   AI-18 will formalise in Chunk 7; for now build the chain and keep it in a shared service so
   AI-18 consumes it rather than duplicating.
5. **Attach AI-14's explanation** to each material movement.
6. **Surface it** as a fourth tab on `/finance/ai-operations` — **Statements**. Do not modify the
   existing `/finance/reports` pages or `/reports/p-l` etc. Zero diffs, again.

**Autonomy.** `OBSERVE`. **No path in this workflow may modify a ledger value** — source-grep test,
same pattern as AI-09's Sales restriction and AI-13's `PeriodClosing` restriction.

**Expected output.** Statements where each line carries `{value, comparative, variance,
materiality, reconciliation_status, evidence_status, staleness_days, explanation, drill_ref,
flags[]}`, plus a summary `{unsupported_material_lines[], stale_reconciliations[],
unexplained_movements[]}`.

**Tests.** Statement totals equal the trial balance, exactly. The balance sheet balances. A line
whose account has a stale AI-22 reconciliation is flagged. Drill-down from any P&L line reaches
real transaction records. **No write path exists** (source-grep). **False positive:** a fully
reconciled, fully evidenced, immaterially-moved line carries no flags.

---

## AI-20 — Intercompany / consolidation intelligence

**Read this section fully before writing any code. I expect most of it to come back as
`not_implemented`, and that is the correct answer.**

**What you found.** No intercompany model. No consolidation mapping. And the deeper problem:
`Organization` is the legal entity, and `subdomain` **is** `tenantId` — so two group companies are
two tenants, and the context service enforces that a workflow is *structurally unable* to read
across them. That isolation is a security property of the whole system, and it is correct.

**So group consolidation is not blocked by a missing model. It is blocked by the tenancy
architecture.** Building it would require either an entity-within-tenant concept that does not
exist, or relaxing tenant isolation. Both are decisions well above a workflow's pay grade, and
neither belongs in this batch.

**What to deliver instead — two things:**

### 1. A design memo, not code

`docs/ai/AI-20-ARCHITECTURE-NOTE.md`, one page, covering: what consolidation requires; why the
current `Organization`-as-tenant model prevents it; the two options (a group/parent concept with
member entities inside one tenant boundary, versus a cross-tenant consolidation service with
explicit consent and its own isolation model); what each would cost and what each would risk; and
a recommendation. **Do not implement either.** This memo is the deliverable.

Then register AI-20 with AI-22 as a reconciliation definition permanently marked
`not_implemented`, reason: *"group consolidation requires an entity model that does not exist; see
AI-20-ARCHITECTURE-NOTE.md"* — replacing Chunk 4's placeholder reason with a real one.

### 2. Related-party detection, which **is** buildable within one tenant

Within a single tenant, a `Customer` and a `Vendor` can be the same legal entity, and transactions
between them are related-party transactions that need disclosure and often elimination. This
needs no cross-tenant access and is genuinely useful.

**Algorithm.** Match `Customer` against `Vendor` on: identical or near-identical name after
normalisation; same tax registration number; same bank account (where present); same address;
same email domain plus name similarity. Score, classify `certain | probable | possible`, and for
each match, find transactions flowing both ways. Report exposure in each direction and the net.

**Autonomy.** `OBSERVE`. Proposes nothing, merges nothing, eliminates nothing. Related-party
*status* is a legal determination, not a fuzzy-match result — the output is "these two records
look like the same entity, here is the evidence, a human should confirm."

**Expected output.** `{consolidation: {status: "not_implemented", reason, memo_ref},
related_parties[{customer_ref, vendor_ref, match_score, matched_on[], classification,
receivable_exposure, payable_exposure, net, transaction_refs[]}]}`.

**Tests.** A customer and vendor sharing a tax registration number → `certain`. Name-only
similarity ("Acme Ltd" / "Acme Limited") without a shared identifier → `possible`, never
`certain`. **False positive, and the important one:** two genuinely different companies with
similar names and no shared identifiers → not matched. No merge, no elimination entry, and no
cross-tenant read is possible (assert the context service refuses).

---

# PART C — CHUNK 6 STOP GATE

```
[ ] AI-11 named in CAPABILITY_MAP.md (Inventory/COGS intelligence); map complete for the first time
[ ] UI harness warm-up pass added; both cold and warm counts reported
[ ] Attention tab: confirm-as-real and expected-dont-flag actions live, writing through
    internal_state tools; AI-15 detector_health now populated by real reviews
[ ] AI-28 exported as a callable service; AI-14's timing driver type works; that gap closed
[ ] One browser-level test proves the Policy tab → effective autonomy loop end to end
[ ] AiTaxTransaction is a rebuildable projection; rebuild is idempotent and self-healing
[ ] AiComplianceProfile is human-entered and structurally read-only to every workflow
[ ] Empty compliance profile → not_configured everywhere; no default calendar, no assumed GST
[ ] AI-22's `tax` definition flipped from not_implemented to implemented
[ ] AI-13's permanent not_checked domains now ZERO — report this explicitly
[ ] submit_filing not registered; no tool has an external-submission side effect (assert)
[ ] AI-12 cannot mutate a TaxRate at any confidence (assert the raise)
[ ] Return dataset box values equal the sum of their supporting transactions, exactly
[ ] AI-17 warning window is configurable and defaults to weeks, not days
[ ] AI-21 extends the existing report engine; recomputes no figure; has no write path
[ ] AI-21 Statements tab added to /finance/ai-operations; /finance/reports/** untouched
[ ] AI-21's drill chain lives in a shared service AI-18 can consume in Chunk 7
[ ] AI-20: architecture note written; consolidation permanently not_implemented with a real reason
[ ] AI-20: related-party detection works; no merge, no elimination, no cross-tenant read
[ ] False-positive test for each of the four
[ ] Full suite green; tsc + eslint clean; API surface diffed; UI regression zero-diff
[ ] All four docs updated; 22/30 workflows BUILT
```

**Report back with:** confirmation that AI-13's `not_checked` count is now zero and what it took;
the three-way tax reconciliation result on your fixtures (ledger / transactions / return, and any
difference); how many obligations a configured profile generated versus an empty one; the count of
unsupported material lines AI-21 found on a realistic fixture; AI-20's related-party matches by
classification; and your recommendation from the architecture note in one sentence.

Then request **Chunk 7 — Batch F (AI-18, AI-23, AI-29: audit evidence, journal review and
continuous control monitoring)**. That batch consumes AI-21's drill chain, AI-15's journal-pattern
detectors and the `JournalEntry.approvalRequired`/`approvalDetails` fields you inventoried in
Phase 0 — so keep all three in a shape another workflow can call.
