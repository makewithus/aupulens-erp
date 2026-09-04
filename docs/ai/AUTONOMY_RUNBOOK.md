# AUTONOMY_RUNBOOK.md

> The gap between "built" and "removes labour" is a safe path to raising autonomy
> (docs/ai/BRIEF-08b-FINAL.md D.2). An unconfigured tenant runs everything at `RECOMMEND` by
> default (`AiWorkflowPolicy`'s own seed, `killSwitchEnabled: false`) — correct and safe, and also
> inert. This document is how a tenant owner decides, per workflow, when it's safe to turn the
> dial up, and when to turn it back down.

## How to read this document

Every workflow row states: its **declared ceiling** (`defaultAutonomy` — the highest level it will
ever request, hard-coded, never exceedable by policy), the **real unlock** at that ceiling (what
changes in practice), the **evidence bar** to raise `AiWorkflowPolicy.maxAutonomyLevel` toward it,
and the **rollback trigger**. The evidence bar is checked automatically where the data exists
(`/finance/ai-operations`'s **Performance** tab, sourced from `AiMetricSnapshot` — see
`docs/ai/BRIEF-08b-FINAL.md` C.1) and stated qualitatively where it doesn't yet.

**Honest state of instrumentation, today**: only AI-05 and AI-07 currently call
`record_learning_outcome` (the tool that populates `AiLearningRecord`, the source of `override_rate`
— the sharpest evidence-bar number this system can produce). Every other workflow's evidence bar
below is stated in real, checkable terms, but the automatic "meets bar" check on the Performance
tab can only evaluate it once that workflow also calls `record_learning_outcome` at its own
proposal points. Wiring that call is real, incremental work — not a blocker to *reading* this
runbook, only to the tab checking a row automatically instead of a human reading the workflow's
own audit trail (`AiWorkflowRun`/`AiDecisionTrace`/`AiAttentionItem`) by hand.

## The permanent gates — unaffected by any evidence, ever

These never move regardless of how clean a tenant's history is. Not a policy default; a hard
ceiling in the workflow's own `defaultAutonomy`/tool `maxAutonomyLevel`, unchangeable by
`AiWorkflowPolicy`:

- **Payments and payment releases** — no `release_hold` tool exists anywhere at any autonomy
  level (AI-19/AI-27's holds are cleared by a human only, through the Attention tab). No workflow
  can execute a payment.
- **Bank-detail changes** — AI-19 places a hold on a detected change; it never approves or clears
  one.
- **Statutory submission** — nothing in this system files anything with a tax authority or
  regulator. Every tax/compliance workflow (AI-12, AI-17) stops at workpaper/readiness output.
- **Tax rate / accounting policy / account-mapping changes** — AI-26 proposes; it cannot write
  `AccountingSettings` or `lib/accounting/smart-rules.ts` at any confidence (asserted in its own
  tests). `AiAccountMapping` overrides are human-written only (`record_account_mapping`, no
  workflow calls it on itself).
- **Period close and lock** — no workflow can lock/unlock a transaction period or close a period.
  AI-13/AI-24 report readiness and evidence; a human closes.
- **Group consolidation** — AI-20 stops at related-party detection by design
  (`docs/ai/AI-20-ARCHITECTURE-NOTE.md`); consolidation itself is permanently `not_implemented`.

This list has not changed since Chunk 1 and is not expected to.

## Per-workflow table

Declared ceilings, current as of Chunk 8b (30 of 30 workflows built). `OBSERVE` rows have no
"unlock" beyond what they already do at OBSERVE — there is no higher level to raise them to; they
are listed for completeness (a tenant owner scanning the whole catalogue shouldn't have to wonder
why a workflow is missing).

| Workflow | Declared ceiling | Real unlock at ceiling | Evidence bar to raise toward it | Rollback trigger |
|---|---|---|---|---|
| AI-01 Document ingestion | DRAFT | Drafts a bill/expense from an extracted document without a human re-keying it first | `AiLearningRecord` override_rate < 15% over ≥ 30 extracted documents (not yet instrumented — wire `record_learning_outcome` at the confirm step) | 2 consecutive weeks of override_rate > 25%, or any single mis-extraction that posted to the wrong vendor |
| AI-02 Ledger classification | EXECUTE | Auto-codes a transaction to an account with no draft/review step | `BankingRule` match rate stable ≥ 80% and override_rate < 10% over ≥ 50 classifications | override_rate > 20% over a rolling 20, or one classification to a sensitive account type (asset/equity) that gets reversed |
| AI-03 Bank reconciliation | EXECUTE | Auto-matches bank lines to source documents with no confirmation | false_match_rate < 5% over ≥ 50 auto-matches (`AiDetectorHealth`-style precision — fold in once AI-03 registers its own detector health rows, mirroring AI-15's pattern) | any confirmed false match, or false_match_rate > 10% over a rolling 20 |
| AI-04 Expense policy | DRAFT | Flags/drafts a policy exception without a human triaging every expense first | override_rate < 15% over ≥ 30 flagged expenses | override_rate > 30%, or a real policy violation missed twice in a row |
| AI-05 Receivables ops | DRAFT | Drafts a collection action (reminder, worklist entry) without review | override_rate < 15% over ≥ 30 proposals (instrumented — real data on the Performance tab today) | override_rate > 25% over a rolling 20 |
| AI-06 Payables ops | DRAFT | Drafts a payment-run proposal without review (never executes — payment release is permanently gated) | override_rate < 15% over ≥ 30 proposed runs (not yet instrumented) | any payment-run proposal that included an already-paid or disputed bill |
| AI-07 Accrual intelligence | DRAFT | Drafts accrual/reversal entries without a human building them from scratch | override_rate < 15% over ≥ 30 proposals (instrumented — real data on the Performance tab today) | override_rate > 25% over a rolling 20, or a reversal that didn't net to zero |
| AI-08 Prepaid schedule | CONTROLLED_AUTONOMOUS | Posts a scheduled prepaid-amortisation entry with no per-period confirmation, once the schedule itself was human-approved | `AiSchedule` reversal/correction rate = 0 over ≥ 3 full schedule cycles; `autoPostSchedules` policy flag explicitly enabled | any posted period needing manual correction, or a schedule total drifting from its own approved total |
| AI-09 Revenue recognition | DRAFT | Drafts a recognition entry without a human computing it manually | override_rate < 15% over ≥ 30 proposals (not yet instrumented) | override_rate > 25%, or a recognised amount exceeding the contract's remaining balance |
| AI-10 Fixed asset | CONTROLLED_AUTONOMOUS | Posts a depreciation-schedule period automatically once the asset itself was human-posted | Same shape as AI-08 — 0 corrections over ≥ 3 cycles, `autoPostSchedules` enabled | any posted depreciation period needing correction |
| AI-11 Inventory/COGS | RECOMMEND | (ceiling — this workflow proposes only; valuation adjustments are judgement by design) | n/a — RECOMMEND is the permanent ceiling, not a step toward something higher | n/a |
| AI-12 Tax intelligence | RECOMMEND | (ceiling — workpaper and reconciliation only; no statutory action exists to unlock) | n/a | n/a |
| AI-13 Close readiness | OBSERVE | (ceiling — read-only by design) | n/a | n/a |
| AI-14 Flux analysis | OBSERVE | (ceiling) | n/a | n/a |
| AI-15 Anomaly detection | OBSERVE | (ceiling — deliberately never accuses or corrects; ships `silent: true` until a detector clears its own precision floor, `AI15_PRECISION_FLOOR`) | Each detector's own `AiDetectorHealth.precision` ≥ floor over `AI15_MIN_SAMPLE` reviewed anomalies before that ONE detector stops being silent — already real, automatic, per-detector (`lib/aiRuntime/tools/anomalyTools.ts`) | precision falling below the floor auto-disables that detector (already built) |
| AI-16 Cash intelligence | OBSERVE | (ceiling) | n/a | n/a |
| AI-17 Compliance readiness | OBSERVE | (ceiling — statutory submission is permanently gated) | n/a | n/a |
| AI-18 Audit evidence | OBSERVE | (ceiling) | n/a | n/a |
| AI-19 Master data | RECOMMEND (+ `place_hold` at CONTROLLED_AUTONOMOUS) | The hold-placement half is already at its real ceiling — placing a hold is inherently safe (reversible only by a human, never by the AI); the RECOMMEND half has no higher level (duplicate/gap findings are proposals) | n/a for RECOMMEND; `place_hold` needs no evidence bar — it is deliberately one-directional-safe by construction, not something more evidence makes "more allowed" | a hold that turns out to be a false alarm on 2+ consecutive real bank-detail changes for the same tenant would be cause to review the detection logic itself, not the autonomy level |
| AI-20 Related party | OBSERVE | (ceiling — consolidation permanently `not_implemented`) | n/a | n/a |
| AI-21 Statement intelligence | OBSERVE | (ceiling) | n/a | n/a |
| AI-22 Continuous reconciliation | OBSERVE | (ceiling — read-only controller over AI-03/AI-08 etc.'s own actions) | n/a | n/a |
| AI-23 Journal review | RECOMMEND | (ceiling — flags/reviews only) | n/a | n/a |
| AI-24 Close evidence | OBSERVE | (ceiling) | n/a | n/a |
| AI-25 Working capital | OBSERVE | (ceiling) | n/a | n/a |
| AI-26 Accounting policy | OBSERVE | (ceiling — cannot write `AccountingSettings`/`smart-rules.ts` at any confidence, asserted) | n/a | n/a |
| AI-27 Duplicate detection | RECOMMEND (+ `place_hold`) | Same shape as AI-19's hold half — already at its real, safe ceiling | n/a | 2+ consecutive false "duplicate" holds on the same tenant's real, distinct bills is cause to review the scoring thresholds (`lib/aiRuntime/duplicates/detect.ts`), not raise/lower an autonomy level |
| AI-28 Cutoff intelligence | RECOMMEND | (ceiling — flags cutoff risk only) | n/a | n/a |
| AI-29 Control monitoring | OBSERVE | (ceiling) | n/a | n/a |
| AI-30 ERP operations | CONTROLLED_AUTONOMOUS, bound to exactly 4 permitted repair types (A.5), 2 wired live | Repairs a dead-lettered event / refreshes a stale tax projection with no human click, within the retry cap | Already gated correctly by construction, not by an evidence accumulation — `lib/aiRuntime/opsHealth/repairGate.ts`'s retry cap + "fails twice escalates, never retried" is the safety mechanism itself, not a threshold to earn past. Enabling requires only `killSwitchEnabled: true` + `maxAutonomyLevel: controlled_autonomous`, since every individual repair is already idempotent and reversible by construction | any repair outcome `"failed"` twice on the same issue auto-escalates and stops retrying (already built, `MAX_REPAIR_ATTEMPTS`) |

## What raising a ceiling actually changes, mechanically

`AiWorkflowPolicy.maxAutonomyLevel` (per tenant, per workflow) is read by
`lib/aiRuntime/policy/autonomyGate.ts::policyCeilingIndex()` and clamped against the workflow's own
`defaultAutonomy` — `min(declared ceiling, policy ceiling)`. Raising it in the Policy tab
(`/finance/ai-operations`) takes effect on the very next run; there is no deploy, no code change,
no restart. `killSwitchEnabled` must also be `true` — both gates apply.

## What the Performance tab checks automatically vs. what needs a human read

The Performance tab's "meets bar" column is a **generic default proxy** (override_rate < 10% over
≥ 20 samples) — a single number that requires nothing more than `AiLearningRecord` activity.
Reading the actual per-workflow bar in the table above (which cites the right metric for THAT
workflow — false_match_rate for AI-03, reversal rate for AI-08/AI-10, precision-floor autopromote
for AI-15) is still a human's job until each workflow's own real bar gets its own automated check.
That's real, scoped follow-up work, not a gap papered over here.
