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
| AI-04 (expense intelligence) | 5/5 (100%) | `tests/golden/ai04/`. The mandatory no-policy-configured false positive, an over-limit violation, a prohibited-category violation, a within-limit clean pass with a policy configured (a distinct silent branch from "no policy at all"), and a policy-independent duplicate-claim detection. |
| AI-05 (receivables operations) | 4/4 (100%) | `tests/golden/ai05/`. An exact single-invoice allocation, a short payment (85%) opening a dispute rather than a false allocation, an overpayment classified as a credit, and the mandatory false positive (not-yet-due, no lateness history — no allocation candidate, no worklist entry). |
| AI-06 (payables operations) | 4/4 (100%) | `tests/golden/ai06/`. A clean in-tolerance PO match (must-stay-silent), a quantity-mismatch exception, the adversarial vendor-mismatch case (a bill from a different vendor referencing another vendor's real PO with agreeing line amounts — a permanent regression guard for the confident-match trap found and fixed this chunk), and a no-PO-reference bill (`no_po_reference`, a distinct silent branch from a clean match). |
| AI-08 (prepaid/deferred schedule) | 4/4 (100%) | `tests/golden/ai08/`. A stated 12-month span (schedule drafted, periods sum exactly to the bill amount), the mandatory one-month-rent false positive, a non-INR `fx_unsupported` skip, and an inferred keyword-only match that raises a finding but never auto-drafts, regardless of confidence threshold. |
| AI-30 (ERP operations) | 3/3 (100%) | `tests/golden/ai30/`. The mandatory healthy-tenant false positive (zero issues), a broken tenant where exactly three distinct issue types are detected (`stuck_draft`, `dead_lettered_event`, `stale_tax_projection`), and a dead-lettered event correctly, autonomously repaired back to `pending` — the one live repair type this chunk wires end to end. |
| AI-12 (tax intelligence) | 3/3 (100%) | `tests/golden/ai12/`. A seeded ₹1.00 ledger-vs-projection gap (asserts BOTH `ledger_vs_transactions` and `ledger_vs_return` fire, since the two are mathematically identical in a single-direction period — a real, confirmed-correct shape, not a bug), a missing-counterparty-registration-number finding isolated from any false three-way mismatch, and the mandatory clean-reconciled-period false positive. |
| AI-17 (compliance readiness) | 3/3 (100%) | `tests/golden/ai17/`. A registration gap that fires alongside its own independent `not_started` obligation finding (neither silently drops the other), a `blocked` (not merely `at_risk`) obligation from a missing GSTIN with a ledger that otherwise ties out exactly, and the mandatory ready/well-before-deadline false positive — deadline-relativity-proofed against real wall-clock "now" via a deliberately large `dueDayOffset`/small `warningWindowDays` margin. |
| AI-18 (audit/evidence intelligence) | 3/3 (100%) | `tests/golden/ai18/`. A swept (material + GL-unreconciled) account with a real missing-document gap, a swept account that is nonetheless fully documented (a must-stay-silent case guarding against conflating "swept" with "problem" — being unreconciled and being undocumented are independent signals), and the true-empty zero-material-accounts-this-period case. |
| AI-25 (working-capital intelligence) | 3/3 (100%) | `tests/golden/ai25/`. A single dominant late-customer AR driver with cash impacts summing exactly to the AR movement, DIO becoming computable to the exact expected value once AI-11's inventory-account mapping resolves, and the mandatory stable-AR/AP false positive (zero drivers, zero recommended actions). |
| AI-22 (continuous reconciliation) | 24/24 (100%) | `tests/golden/ai22/`. One correct-answer + one must-stay-silent case for all 10 real, registered reconciliation definitions (`bank`, `ap_control`, `ar_control_finance`, `fixed_assets`, `inventory`, `payroll`, `suspense_clearing`, `tax`, `prepaid`, `deferred_revenue`), the 2 permanently `not_implemented` siblings (`intercompany`, `processor_settlement`), and 2 dedicated Chunk 10 P0.5 cases proving `ap_control`/`ar_control_finance` correctly refuse to compute (`not_supported_for_closed_periods`) once a period is taken past `PeriodClosing.status: "open"`. Building this dataset found and fixed a real sign error in one definition (see docs/ai/BRIEF-10-PRE-QA.md and AI-22's own verification record). |

**Real bugs found while building these fourteen workflows' golden datasets**: AI-22's dataset
caught a real sign error in one reconciliation definition (a magnitude-correct-but-sign-flipped
difference) — fixed, with the golden case itself now the permanent regression guard. Every other
case across the other thirteen workflows passed against the actual, already-shipped workflow logic
on first or second iteration (a fixture mistake corrected in the case data, never the workflow
source). This
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
