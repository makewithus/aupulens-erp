# PRODUCT_TEST.md

> *If AI is turned off, Aupulens should become materially more labor-intensive.*
> (docs/ai/BRIEF-08b-FINAL.md D.1)

This is the test that actually matters — not "did 1311 tests pass" but "does turning every kill
switch off measurably change what a human has to do." Each step below cites the real workflow and
the real, already-passing test(s) that prove the behavior happens (not narrated from memory —
grep-verified against this branch, `ai/workflows`, at the point all 30 workflows shipped). "With
AI on" describes `AiWorkflowPolicy.killSwitchEnabled: true` at the workflow's intended ceiling
(the **Real unlock** column in `docs/ai/AUTONOMY_RUNBOOK.md`); "with AI off" is every kill switch
at its default (`false`) — the exact state an unconfigured tenant starts in today.

## The scenario, step by step

### 1. A vendor bill arrives

- **AI on**: AI-01 extracts vendor/amount/line items from the uploaded document
  (`lib/docIntel/`), AI-02 codes it to an account via the `BankingRule` engine or model-assisted
  classification, AI-27 checks it against every other bill/expense/posted-payment in the tenant
  for a duplicate (same document number normalised, same vendor+amount+date, file hash, or the
  vendor being a near-duplicate of an existing one), and a draft bill appears with the extraction's
  own evidence linked. A `certain`/`probable` duplicate places a hold and blocks the draft from
  looking clean (`tests/ai/aiRuntime/ai27DuplicateDetection.test.ts`).
- **AI off**: a human reads the PDF, types every field into a new bill form, manually checks the
  vendor list and recent bills for a duplicate by memory or by searching, and codes the account by
  their own judgement.
- **What a human still does either way**: reviews and posts the draft. AI-01/02/27 never post
  anything themselves — Chunk 1's DRAFT-not-POST discipline holds throughout.

### 2. A bank statement imports

- **AI on**: AI-03 matches statement lines to source documents automatically wherever the
  autonomy gate allows (EXECUTE ceiling), leaving only genuinely ambiguous lines for review; AI-22
  recomputes the tenant's reconciliation position across bank/AP/AR/tax/inventory/suspense in the
  same pass (`tests/ai/aiRuntime/ai03BankReconciliation.test.ts`,
  `tests/ai/aiRuntime/ai22ContinuousReconciliation.test.ts`).
- **AI off**: a human opens the statement, manually pairs each line against outstanding
  invoices/bills one at a time, and separately re-derives each control account's tie-out by hand.

### 3. Period end approaches

- **AI on**: AI-07 proposes accrual/reversal entries (DRAFT), AI-08/AI-10 run their
  human-approved-schedule periods automatically (CONTROLLED_AUTONOMOUS once a schedule exists),
  AI-28 flags cutoff risk (documents dated near period boundary that haven't posted yet).
  (`tests/ai/aiRuntime/ai07AccrualIntelligence.test.ts`, `...ai08PrepaidSchedule.test.ts`,
  `...ai10FixedAsset.test.ts`, `...ai28CutoffIntelligence.test.ts`.)
- **AI off**: a human maintains a spreadsheet of what needs accruing this period, manually
  calculates each prepaid/depreciation period's amount from the original schedule, and manually
  scans for late-arriving documents that should have hit the prior period.

### 4. Close readiness and evidence

- **AI on**: AI-13 computes readiness across every close domain and ranks blockers with owners
  in one place; AI-24 verifies that every number on the close checklist has real supporting
  evidence, not just a posted balance. (`tests/ai/aiRuntime/ai13DayZeroClose.test.ts`,
  `...ai24CloseEvidence.test.ts`.)
- **AI off**: a controller manually walks every domain's own checklist, individually confirming
  each item is actually done (not just "looks closed"), and separately hunts for supporting
  documents when an auditor or reviewer later asks "how do you know this number is right."

### 5. Explaining what changed

- **AI on**: AI-14 explains a margin/variance movement with named drivers that sum exactly to
  the real movement (partition-exact by construction, `tests/ai/aiRuntime/ai14FluxAnalysis.test.ts`);
  AI-15 raises the anomalies that have actually cleared their own precision bar, silent otherwise
  — never a wall of low-value noise (`tests/ai/aiRuntime/ai15AnomalyDetection.test.ts`); AI-16
  flags a projected cash shortfall date (`tests/ai/aiRuntime/ai16CashIntelligence.test.ts`).
- **AI off**: a finance analyst builds the variance bridge by hand in a spreadsheet, re-derives
  cash runway manually from the bank position and known upcoming payables/receivables, and has no
  systematic anomaly scan at all — issues surface only when someone happens to notice them.

### 6. "Show me the support for this number"

- **AI on**: AI-18 returns an evidence pack with real citations — record references, not prose
  claims (`tests/ai/aiRuntime/ai18AuditEvidence.test.ts`). Via AI-NL, this is one chat message
  (`"Show me the support for this number"` → AI-18, `lib/aiRuntime/nl/workflowIntentMap.ts`).
- **AI off**: a human manually traces the number back through the ledger to its source documents,
  a process that can take from minutes to hours depending on how many hops back it takes.

### 7. "What blocks close?" via chat

- **AI on**: AI-NL resolves the utterance to AI-13 without an LLM call (the keyword layer,
  `tests/ai/aiRuntime/aiNl.test.ts`), runs it through the exact same executor and autonomy gate an
  event trigger uses (A.1), and returns the ranked blocker list as a chat answer.
- **AI off**: the same manual walk described in step 4, with no conversational shortcut to it at
  all — a human has to know which page to open and read it themselves.

## The honest limit of this document

This is a **backend-verified** scenario — every claim above cites a real, currently-passing
automated test proving the described behavior happens, not a narrated guess and not (yet) a
recorded browser click-through of a live seeded tenant. `docs/ai/UI_REGRESSION.md`'s own
established methodology (this machine's dev server is resource-contended, not the compiler —
Chunk 7's finding) is why a full interactive walkthrough wasn't captured for this document as
Chunk 8b's own time budget closed; the individual test suites cited above are the same discipline
applied consistently, at the level this project has used throughout — every one of the 30
workflows is proven against real fixtures, not narrated. A live click-through recording remains a
real, valuable next step for whoever owns this system's ongoing demo/sales narrative, not a gap
this document has silently papered over.

## The one-paragraph answer

With every AI kill switch on at its intended ceiling, a controller's day changes from typing bill
data by hand, individually pairing every bank line, manually maintaining an accrual/schedule
spreadsheet, walking every close checklist item by memory, building variance bridges from scratch,
and tracing supporting evidence hop-by-hop — to reviewing drafts, resolving the handful of
genuinely ambiguous items the autonomy gate declined to auto-act on, and asking a plain-language
question when they need an answer. Nothing this system does removes the controller's judgement —
every write above DRAFT stays proposal-only except the narrow, explicitly-bounded set (bank
auto-match at EXECUTE, two schedule types at CONTROLLED_AUTONOMOUS once human-approved, four
idempotent-repair types on AI-30) — but it removes nearly all of the mechanical labour that
judgement currently has to wade through to get exercised.
