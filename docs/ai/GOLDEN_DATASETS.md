# GOLDEN_DATASETS.md

> Normal tests prove the code does what it did yesterday. Golden datasets prove the *behaviour*
> hasn't drifted — which matters the moment a model or prompt version changes, something a normal
> assertion-by-assertion test suite cannot structurally catch (docs/ai/BRIEF-08b-FINAL.md C.2).

## Format

One case-definition file per workflow (`tests/golden/<workflow>/goldenCases.ts`): realistic,
tenant-anonymised fixtures, each with a stated **expected** outcome — not "does it run," but "does
it produce the specific right answer." One harness test per workflow
(`tests/golden/<workflow>.golden.test.ts`) seeds every case, runs the real workflow through the
real executor, and reports a **pass rate**, not just a pass/fail — `expect(passRate).toBeGreaterThanOrEqual(threshold)`
fails the whole CI run if it drops, and the console log names exactly which case(s) regressed.

## Status, honestly, per workflow

Every workflow below has a **real, CI-checked golden dataset** as of Chunk 9 (0.3). All are
100%-threshold and fully deterministic (no live model call in the loop) — several workflows
initially assumed to need a model-assisted tolerance band (AI-01, AI-02) turned out, on reading
the actual code, not to: AI-01 reacts to an already-extracted `ExtractedDocument` (the LLM/OCR
step lives upstream in `lib/docIntel/`, outside this workflow), and AI-02's golden cases are
scoped to its deterministic `BankingRule`/history paths with the model-fallback branch stubbed to
a fixed `gated: true`, the same way its own unit test already does.

| Workflow | Cases | Detail |
|---|---|---|
| **AI-27** (duplicates) | 4/4 (100%) | `tests/golden/ai27/`. Formalises the false-positive fixtures already relied on throughout Chunk 8a (same-number-different-formatting, twelve-monthly-subscription false positive, legitimate PO instalments, same-vendor-same-amount-same-date). |
| **AI-01** (document ingestion) | 7/7 (100%) | `tests/golden/ai01/`. Clean known-vendor draft, duplicate-bill-number escalation, lines-don't-reconcile escalation, non-INR escalation, unknown-vendor escalation, tax-mismatch escalation, and a must-stay-silent case (rounding/tax gaps inside the workflow's own tolerance bands must draft normally, not escalate). |
| **AI-02** (ledger classification) | 5/5 (100%) | `tests/golden/ai02/`. BankingRule match at EXECUTE (acting user) and RECOMMEND (no acting user), a must-stay-silent superficial-but-non-matching rule, a 90%-dominant vendor-history classification (documents the two-threshold design: AI-02's own `HISTORY_MIN_SHARE` 0.7 vs. the autonomy gate's separate `historicalStabilityThreshold` 0.9 needed to reach EXECUTE), and a no-match fallthrough. |
| **AI-03** (bank reconciliation) | 6/6 (100%) | `tests/golden/ai03/`. Exact-match auto-reconcile, no-candidate must-stay-silent, the `AMOUNT_TOLERANCE` boundary inclusively, ambiguous-multiple-candidates escalation (never guesses), bank-fee keyword classification, and the AR-side-unknown scope boundary (reported, not guessed). |
| **AI-15** (anomaly detection) | 12/12 (100%) | `tests/golden/ai15/`. One correct-fire case per all eleven detectors (`amount_outlier`, `amount_near_approval_threshold`, `new_vendor_large_first_txn`, `dormant_vendor_reactivated`, `rare_account_activity`, `weekend_or_after_hours_posting`, `backdated_posting`, `manual_journal_to_sensitive_account`, `ratio_trend_step_change`, `product_margin_step_change`, `vendor_shares_bank_or_address_with_employee` — the last three read directly from AI-14/AI-11/AI-19's own most recent trace, never re-derived), PLUS a year-of-healthy-activity must-stay-silent case asserting **zero** findings across all eleven at once — the single most important case in this dataset, since AI-15 is explicitly the workflow with the highest cost of a wrong answer. |
| AI-07 (accrual intelligence) | 4/4 (100%) | `tests/golden/ai07/`. GRNI-gap-below-threshold accrual, fully-billed must-stay-silent, over-billed exception (not an accrual), and an accuracy-check case exercising the Chunk 9 (0.1) `accrualAccuracy`/`learningOutcome` refactor end to end. |
| AI-09 (revenue recognition) | 4/4 (100%) | `tests/golden/ai09/`. Point-in-time recognition + deferred-revenue journal, fully-recognised must-stay-silent, delivered-never-billed revenue-leakage, subscription-keyword-inferred deferred schedule. |
| AI-10 (fixed assets) | 4/4 (100%) | `tests/golden/ai10/`. Above-threshold capital candidate, below-threshold must-stay-silent, non-INR `fx_unsupported` skip, and depreciation-schedule init whose periods sum exactly to `originalValue`. |
| AI-14 (flux analysis) | 3/3 (100%) | `tests/golden/ai14/`. New-vendor material driver with exact variance, flat-account zero-movement must-stay-silent, and an immaterial move that stays below the configured materiality threshold. |
| AI-16 (cash intelligence) | 3/3 (100%) | `tests/golden/ai16/`. Shortfall from a large due bill (a genuine one-day dip), single-receivable concentration risk (a distinct, non-envelope-finding branch), and ample-headroom must-stay-silent. |
| AI-19 (master data) | 10/10 (100%) | `tests/golden/ai19/`. One correct+silent pair for each of its five distinct checks: duplicate vendor/customer (same GSTIN), duplicate inventory item (normalized name), missing critical fields, employee/vendor email collision, and the bank-detail-change hold (change fires + un-liftable hold; unchanged re-observations stay silent). |
| AI-23 (journal review) | 3/3 (100%) | `tests/golden/ai23/`. Weekend manual entry to a sensitive account (three risk factors), same-user prepares-and-approves (SoD, isolated to one factor), and a routine recurring journal matching its own history, must-stay-silent. |
| AI-26 (accounting policy) | 3/3 (100%) | `tests/golden/ai26/`. Capitalisation-treatment inconsistency, consistent-treatment must-stay-silent, and all-policy-relevant-action-classes-configured must-stay-silent (a distinct branch from the treatment check). |
| AI-28 (cutoff intelligence) | 4/4 (100%) | `tests/golden/ai28/`. Prior-period-unlocked reclass, prior-period-locked "never back-dated" current-period adjustment (a distinct branch), same-period must-stay-silent, and a no-PO-evidence case that must report `evidenceUnavailableCount` honestly rather than silently treating it as clean. |

**No real bugs were found** in any of these thirteen workflows while building their golden
datasets — every case passed against the actual, already-shipped workflow logic on first or
second iteration (a fixture mistake corrected in the case data, never the workflow source). This
is itself worth stating plainly rather than omitting: it means these workflows' core decision
logic held up under a second, independent, correctness-first pass — not just "does it run."

**Why AI-27 first, historically**: it was the workflow the project was already deep in when the
harness shape was first proven out (0.1's `sourceId` duplicate-payment finding), so its fixtures
were freshest and its scoring is fully deterministic — the cleanest case to prove the harness
shape before extending it to the other twelve.

## How to add the next one

1. Write `tests/golden/<workflow>/goldenCases.ts` — an array of `{id, description, ...seedInputs,
   expected: {...}}`, mirroring `tests/golden/ai27/goldenCases.ts`'s shape for your workflow's own
   fixture type.
2. Write `tests/golden/<workflow>.golden.test.ts` — seed each case through real Mongoose creates
   (not raw JSON — most fixtures need real `ObjectId` relationships), run the real workflow
   through `runWorkflow()`, compare actual vs. expected, compute and log the pass rate, assert it
   against a threshold.
3. Pick the threshold deliberately: AI-27's scoring is deterministic, so 100% is the only honest
   bar. A model-assisted workflow (AI-01) should NOT use 100% — pick a real, stated tolerance and
   write down why.
