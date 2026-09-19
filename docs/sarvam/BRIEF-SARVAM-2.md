# AUPULENS — SARVAM, PHASE 2 (saved verbatim-in-substance; branch `sarvam`, commit locally, NEVER push/merge)

Report 2 accepted. Build the Part 6 checklist first and work it in order.

## PART 0 — Decisions
0.1 Numbers verified after translation (not masked) — APPROVED, record in DISCOVERY.md as a deliberate deviation from Rule 5. CONDITION: comparison must be by VALUE not string. Prove 4 cases: `45,000`→`45000` passes; `45000`→`4500` fails+falls back; Devanagari/Tamil numerals in, Latin out = same value; a number silently dropped fails (explicit test). A false fallback on every comma is as bad as a missed corruption.
0.2 No LLM normalisation pass — APPROVED. Record as scoped decision: "deterministic normalisation only; an LLM pass is available if live testing shows rules are insufficient."
0.3 `ZXQnZXQ` placeholder: verify first (live) + safety net: altered/missing/duplicated placeholder ⇒ fall back to original text, low-confidence. Test with a mangled placeholder in the mock.
0.4 Streaming has no language layer — decide now. If streaming feeds a user-facing chat: wire input translation in (stream English reply for now, state plainly in docs). If internal/non-chat: declare in LIVE_VERIFICATION.md + status table with reason. Built or declared; not carried.

## PART 1 — Feature 3
1.1 `tryAiCreateFlow` and explain/do/ask classifier key off NORMALISED ENGLISH from the pipeline, never raw input. Prove end-to-end in a test: regional input → pipeline → classifier → slot filling → pre-filled form (mock translating).
1.2 Explain ("How do I create an invoice?": steps/where/fields, nothing created, no form) / Do (all present → open pre-filled form) / Ask ("Create an invoice": one question at a time then open pre-filled form). Ambiguous ⇒ ask which they meant.
1.3 Slot filling, sales invoice only: one question at a time; real choices from real data (customer picker); multi-answer ("Acme, 45000, next Friday"); back/skip optional/change earlier/cancel anytime; progress "3 of 5"; answers via same pipeline (own language); resolve references ("same customer as last time", "next Friday"); resume/expire via existing AiCommandProposal TTL pattern.
1.4 Declarative field registry + drift test that FAILS CI (not warns): asserts registry matches BOTH the route's checks and the model's required fields. Registry generic: adding customer/bill/expense = data entry.
1.5 Default path (ships ON): summary → confirm → open real pre-filled form → user clicks Create; tryAiCreateFlow contract unchanged (receives complete data). Execute path (ships OFF): `settings.ai.autoCreateEnabled` default false; same summary+confirm, create THROUGH THE EXISTING ROUTE, redirect to record; all permission/validation rules apply. Test both states; flag off ⇒ byte-identical to default path. Summary shows every field in user's language; amounts/dates/identifiers unchanged.

## PART 2 — Carried
2.1 One stable baseline: run full suite sequentially or --maxWorkers=3, THREE times on clean checkout of the branch point; record identical result + exact command in docs/sarvam/BASELINE.md; use only it. Failure outside it = regression.
2.2 Mark every supplied phrase in LIVE_VERIFICATION.md "needs native-speaker confirmation"; top section: which languages to check first (Hindi, Tamil), what a wrong phrase looks like.

## PART 3 — Metering/admin
Platform AI dashboard split by provider (requests, characters/tokens, cost; Azure, Sarvam, combined); combined cost is what tenant limit applies against (true in code and visible in UI). Configuration tab: multilingual enabled?, languages actually used, per-tenant switch. Seeded Sarvam rate reaches real cost figures server-side.

## PART 4 — Verification
Edge cases beyond existing: customer name that is a common misspelling; name that normalises into a DIFFERENT existing customer; invoice number that looks like a typo; quoted deliberate typo; code-mixed mid-slot-filling; language switch mid-conversation; tenant with zero customers when picker opens; answer failing route validation; abandon+return; "cancel"; unrelated question mid-flow; Sarvam failing between two questions.
Adversarial per flow: what input opens a form pre-filled with the wrong customer or wrong amount, confidently? (decimal shift, name→different real customer.) Test them.
Every new surface: loading/empty/error/populated states; clear refusal without permission; original text always displayed, never normalised copy.

## PART 5 — Deliverables
BASELINE.md · LIVE_VERIFICATION.md (updated: placeholder check first, native-speaker flags, streaming decision, regional-create case) · PERFORMANCE.md (English delta, slot-filling turn latency, cached/uncached) · VOICE_READINESS.md · QA test guide (phrases, English meaning, expected outcome) · final status table (feature | implemented | verified | notes; no cell partial/pending/unknown — "declared" with reason is fine).

## PART 7 — Rules unchanged
Azure stays brain · additive only · English path must not regress · never autocorrect input field · protected entities never altered · fail open · never act on a guess for financial · every provider call metered · no secrets · Sarvam mocked in tests · suite green vs Part 2.1 baseline · clean tree + fresh-worktree verification · commit locally, never push/merge.
Ask before acting only if: streaming needs a non-additive change; registry reveals route and model disagree such that existing invoices can be created invalid (pre-existing bug); Sarvam real API differs from mocks in a way that changes the design.
Closing: Feature 3 is where degrade-not-break matters most — every pipeline safeguard must still hold when a field reaches the pre-filled form.
