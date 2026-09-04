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

## Status, honestly, per workflow the brief named

| Workflow | Status | Detail |
|---|---|---|
| **AI-27** (duplicates) | **Real, CI-checked, 4/4 cases (100%)** | `tests/golden/ai27/goldenCases.ts` + `tests/golden/ai27.golden.test.ts`. Formalises the exact false-positive fixtures already relied on throughout Chunk 8a (same-number-different-formatting, the twelve-monthly-subscription false positive, legitimate PO instalments, same-vendor-same-amount-same-date) into the harness shape, rather than a second, different set. |
| AI-01 (extraction) | Not built this chunk | Would need real, anonymised sample documents (PDFs/images) with hand-verified expected field values — a genuinely different asset type (binary files, not JSON/fixture code) than the other four, and the extraction pipeline itself is LLM-assisted, so "expected" needs a tolerance band, not exact equality. Scoped out given this chunk's time budget; the harness SHAPE above (case file + pass-rate harness) is ready to receive it. |
| AI-02 (classification) | Not built this chunk | Real fixture data exists in `tests/ai/aiRuntime/ai02LedgerClassification.test.ts` (BankingRule matches + model-assisted fallback) — a real golden set here would mostly be formalising those, the same move already made for AI-27. Not done — scoped out for time. |
| AI-03 (bank matching) | Not built this chunk | Same story as AI-02 — `tests/ai/aiRuntime/ai03BankReconciliation.test.ts` already has the real fixtures; formalising them into the golden harness is real, scoped, and not done here. |
| AI-15 (anomaly detection) | Not built this chunk | Eleven detectors, each with its own precision-floor auto-disable logic already tested individually (`tests/ai/aiRuntime/ai15AnomalyDetection.test.ts`) — a golden set here is the highest-value one to build next (this is explicitly the workflow C.2 says costs the most on a wrong answer), just not built in the time this chunk had. |

**Why AI-27 first, honestly**: it was the workflow this chunk was already deep in (0.1's
`sourceId` duplicate-payment finding), so its fixtures were freshest and its scoring is fully
deterministic (no model call in the loop) — the cleanest case to prove the harness SHAPE works
before investing in the other four, which either need a different asset type (AI-01) or are
lower-marginal-value to formalise right now since their existing test suites already cover the
same fixtures directly.

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
