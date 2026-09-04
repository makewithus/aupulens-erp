# IMPLEMENTATION_LOG.md

## Chunk 8b — Final: AI-NL, learning/evaluation, project acceptance, 2026-09-04, branch `ai/workflows`

**This is the last chunk. All 30 workflows were already built (Chunk 8a); this chunk builds the
control surface over them and the project's acceptance documentation.**

### Part 0 — three reconciliations, done first as instructed

**0.1 — AI-27's payment-duplicate detection, implemented, not explained away.** Chunk 8a's own
0.3 investigation found `postInvoicePayment()` posts a real `JournalEntry` (`voucherType:
"payment"`) whose lines carry `sourceId` back to the paid bill — sufficient to detect the same
bill paid twice directly: `findDuplicatePaymentPostings()` (`lib/aiRuntime/duplicates/detect.ts`)
groups posted payment postings by the bill `sourceId` they reference and flags an OVERPAYMENT
(total paid exceeds the bill's own total — legitimate instalments summing to the bill total do
NOT flag). `certain` by construction, not scored; places a hold on the bill (reusing AI-19's
`place_hold`). 2 new tests incl. the legitimate-instalment false positive. Retrospective sweep
folds the recoverable overpaid amount in directly.

**0.2 — `AiAccountMapping` was not built in Chunk 8a; built now.** `models/ai/AiAccountMapping.ts`
+ `lib/aiRuntime/accountMapping/resolve.ts::resolveMappedAccounts()` — a configured mapping always
wins over a heuristic. Wired into BOTH latent false-completion paths the brief named: AI-11's
inventory-account code heuristic (`lib/aiRuntime/inventory/accountMapping.ts`) and AI-22's
`suspense_clearing` name-regex (`lib/aiRuntime/reconciliation/definitions.ts`). AI-12's tax
control lookup was checked and found NOT to need it — `TaxRate.accountId` is already a real,
human-configured field, not a heuristic. `glBalanceForAccount()` exported additively with an
optional `asOfDate` param (also used by AI-25 below). 2 new override tests (AI-11, AI-22).

**0.3 — the bank-detail contradiction, clarified.** One line added to `bank_detail_change_process`'s
own description (`lib/aiRuntime/controls/definitions.ts`) and to `CAPABILITY_MAP.md`'s AI-29 row:
the control covers Employee/BankAccount changes only — Vendor/Customer genuinely have no
bank-detail field to watch (AI-19's own `vendor_bank_change_detection` `not_implemented`
declaration is the honest statement of that gap, unchanged).

**Bonus find while closing 0.2**: AI-25's DIO (inventory days) — blocked since Chunk 4/5 on the
same "which accounts are inventory" question — unblocked for real using AI-11's now-live mapping
+ the newly-exported `glBalanceForAccount(tenantId, accountId, asOfDate)`. 1 new test proves a
real DIO=56 result on a seeded fixture; CCC now includes DIO when computable.

**Bonus find while closing D.3 (below)**: AI-06's own `checksNotImplemented` array had gone stale
— it still declared `early_payment_discount` and `cross_source_duplicate_search` as
not_implemented even though Chunk 8a's report said AI-19/AI-27 closed them. Fixed; 2 tests updated
(`docs/ai/OPEN_QUESTIONS.md` #36).

**Bonus find while closing D.3**: AI-29's `master_data_verification` and `bank_detail_change_process`
— deferred in Chunk 7 "until AI-19" — flipped to real now that AI-19's `AiHold`/
`AiMasterDataProfile.bankChangeAlerts` exist. AI-29's `not_implemented` count drops from 4 to 2. 2
new tests.

### Part A/B — AI-NL, the natural-language control layer

Extends the EXISTING Command Center chassis (`AiCommandProposal`, `app/api/ai/command/**`) — no
second chat, per A.2's explicit instruction. Widens the action set from 7 hard-coded accounting
actions to all 30 registered workflows.

- **Layered resolution** (`lib/aiRuntime/nl/resolveIntent.ts`, `workflowIntentMap.ts`): a curated
  keyword table tried first (no LLM call), then an explicit `AI-XX` mention, then the existing
  LLM classifier's prompt extended with a `"workflow"` intent constrained to the live registry
  (`listWorkflows()`) — never a workflow id the model invented.
- **A.1's load-bearing rule, as code**: `lib/aiRuntime/nl/chatBridge.ts::runWorkflowFromChat()`
  does nothing but assemble a `TriggerEvent` and call the SAME `runWorkflow()` every event trigger
  uses. No second executor, no bypassed gate.
- **Confirmation preview** (`previewWorkflow()`, added to `lib/aiRuntime/runtime/executor.ts`):
  runs `context → extract → reason → validate → decideAutonomy()` and stops — no `act()`, nothing
  persisted — the exact first half of the real pipeline, not a second guess at what it would do.
  OBSERVE-level workflows run and explain immediately (nothing to confirm); above OBSERVE previews
  with real counts/amounts (`summarizePreview()`) and proposes through `AiCommandProposal`
  (`module: "ai-workflow"`), confirmed through the SAME existing confirm route.
- **Citation discipline** (`lib/aiRuntime/nl/explain.ts`): every chat explanation is built from
  the run's own envelope + decision trace, never the model's own knowledge; a query with no
  supporting data answers "I don't have that."
- **Real architectural finding, discovered building this**: `rt.callTool()`'s own
  `requestedAutonomy` is checked ONLY against the tool's declared `maxAutonomyLevel`, never against
  `decision.autonomyApplied` — safe for `internal_state` tools by construction (worst case: a wrong
  bookkeeping row) but NOT automatic for a workflow whose actions have real effect. AI-30's own
  `act()` now checks `decision.autonomyApplied` explicitly before attempting any repair — the
  generic framework doesn't do this for you (`docs/ai/README.md` documents the pattern for future
  workflows).
- 10 tests (`tests/ai/aiRuntime/aiNl.test.ts`) incl. all 12 canonical utterances resolving without
  an LLM call, the ambiguous-utterance clarifying-question path, the A.1 policy-forbidden/allowed
  pair (via AI-30's real gate), and the "delete this layer, event runs still complete" proof
  (source-grep: nothing in `lib/aiRuntime/runtime/**`/`bootstrap.ts`/`app/api/cron/**` imports
  `lib/aiRuntime/nl/**`).

### Part C — learning loop, metrics, golden datasets, promotion

- **Metrics** (`models/ai/AiMetricSnapshot.ts`, `lib/aiRuntime/metrics/computeMetrics.ts`): every
  number computed from data this system already writes — `AiLearningRecord` (override_rate),
  `AiWorkflowRun.metrics` (automation_coverage, policy_overrides folded in unchanged),
  `AiAttentionItem` (exception_resolution_time), `AiDetectorHealth` (false_match_rate, folded in
  unchanged for AI-03/15/22). **Honestly not computed**: `hours_saved` (no manual-effort baseline
  exists to multiply by) and `downstream_reconciliation_survival` (a real join not yet built) —
  declared `notComputable` with the specific reason, never guessed. Nightly cron
  (`app/api/cron/ai/metrics-snapshot`, registered in `vercel.json`). 8 tests.
- **Drift** (`lib/aiRuntime/metrics/drift.ts`): compares today's snapshot against a 7-day trailing
  baseline per workflow, raises a named `AiAttentionItem` on a real regression. **Honest scope
  limit**: true per-segment drift (a specific vendor/document-type) needs `AiLearningRecord.
  contextRef` populated at the call site, which neither current caller (AI-05, AI-07) sets — this
  compares per-workflow, the finest real segment the data supports today.
- **Performance tab** (`/finance/ai-operations`, 5th tab, admin-only): live, sourced from
  `AiMetricSnapshot` + `AiWorkflowPolicy`, a generic default evidence-bar check (documented as
  generic — the real per-workflow bars are `docs/ai/AUTONOMY_RUNBOOK.md`). `next build` verified
  clean (full production build, exit 0) — no live browser click-through was captured this chunk
  given this machine's own documented dev-server resource contention (`UI_REGRESSION.md`).
- **Golden datasets** (`tests/golden/`): AI-27 built for real — 4 cases, 100% pass rate, formalising
  the exact false-positive fixtures already relied on in Chunk 8a rather than rewriting them.
  AI-01/02/03/15 honestly scoped out this chunk (`docs/ai/GOLDEN_DATASETS.md` states why per
  workflow — mostly time budget, not a real blocker).
- **Promotion** (`lib/aiRuntime/learning/promotion.ts`): aggregates `AiLearningRecord` by proposed
  account, proposes a `BankingRule` via the existing `create_banking_rule` `AiActionProposal` path
  once a pattern clears a real stability bar (≥10 observations, ≤10% override rate) — never writes
  `BankingRule` directly, idempotent (no duplicate proposals). **Honest limit**: AI-02 itself
  doesn't call `record_learning_outcome` yet, so this has real, tested aggregation logic but no
  real AI-02 traffic to act on until that's wired — proven against synthetic `AiLearningRecord`
  data, labelled as such. 5 tests.

### Part D — acceptance

- `docs/ai/PRODUCT_TEST.md` — the 7-step scenario, each step citing the real, currently-passing
  test that proves the described "AI on" behavior; explicitly labelled backend-verified, not a
  captured browser walkthrough.
- `docs/ai/AUTONOMY_RUNBOOK.md` — every workflow's declared ceiling, real unlock, evidence bar,
  and rollback trigger; the permanent-gates list restated.
- `docs/ai/README.md` — the handover: architecture diagram, all 30 workflows, how to add a 31st,
  the autonomy gate's real mechanics (including the `internal_state`-vs-real-effect subtlety found
  above), kill switches, and the full, current `not_implemented` inventory across the whole system.

### Test results

1325/1325 passing (154 test files), `tsc --noEmit` clean, `eslint` clean on every file this chunk
touched (baseline unchanged). `next build` clean (production build, exit 0). API surface: 2 new
routes (`/api/cron/ai/metrics-snapshot`, `/api/finance/ai-operations/performance`), 2 existing
routes extended additively (`/api/ai/command`, `/api/ai/command/actions/[id]/confirm`) — no
existing behaviour changed (the seven `aiActions.ts` actions and non-`workflow` Command Center
intents are untouched code paths).

### Docs updated

`CAPABILITY_MAP.md` (header note, AI-25/AI-29 rows), `OPEN_QUESTIONS.md` (#34 the internal_state/
RBAC architectural finding, #35a the two more AI-29 flips, #36 the AI-06 staleness finding),
`SYSTEM_INVENTORY.md` unchanged this chunk (no new "what exists" findings beyond what 0.1-0.3
already covered), new: `PRODUCT_TEST.md`, `AUTONOMY_RUNBOOK.md`, `README.md`,
`GOLDEN_DATASETS.md`, this file.

---

## Chunk 8a — Batch G: Operations & Data Quality (Task 0 + AI-19, AI-11, AI-27, AI-26, AI-30), 2026-09-04, branch `ai/workflows`

**All 30 workflows are now BUILT.**

### Task 0.3 — the bounded investigation before AI-27

Three real answers, written to `SYSTEM_INVENTORY.md`: (1) `lib/accounting/payments.ts::
postInvoicePayment()` posts a real `JournalEntry` whose lines carry `sourceId` = the paid bill's
own `_id` — a payment IS traceable to its bill, just not via a dedicated Payment record (AP has
none; `models/sales/Payment.ts` is AR-only). This flipped AI-29's `payment_against_approved_bill`
from Chunk 7's `not_implemented` to real (`OPEN_QUESTIONS.md` #33). (2) Vendor bank details exist
nowhere in this codebase — confirmed, not assumed. (3) No `BankStatement`→bill link exists besides
AI-03's own reconciliation match. Answers (2) and (3) scoped AI-19's bank-change detection and
AI-27's "same bank account paid twice" check honestly.

### AI-19 — Master data intelligence

Duplicate entities reuse AI-20's matcher directly. Bank-detail changes (Employee/BankAccount only
— Customer/Vendor confirmed to have no bank field) raise `CRITICAL`, place a hold via a new,
fully generic `place_hold` tool (`models/ai/AiHold.ts` — a deliberate deviation from the brief's
literal "mark it on `AiPaymentRunProposal`" suggestion, which is a fresh per-run document unsuited
to a hold that must persist across future runs). **No `release_hold` tool exists at any autonomy
level, anywhere in the registry** — asserted directly. Employee/vendor collision redesigned
honestly as name+email matching once bank/address were confirmed absent — this also closes AI-15's
`vendor_shares_bank_or_address_with_employee` detector (wired into AI-15's own registry, reading
AI-19's trace, `OPEN_QUESTIONS.md` #35). Bank values masked (last 4 digits) everywhere, asserted
including inside the decision trace. `master_data.changed` events added additively to the
Vendor/Customer/Employee/BankAccount create/update routes (7 route edits, `safeEmitEvent`, never
throws back). 7 tests.

### AI-11 — Inventory / COGS intelligence

Answered the standing "which accounts constitute inventory" question live
(`lib/aiRuntime/inventory/accountMapping.ts`), reusing `lib/accounting/inventory.ts`'s own real
posting-account resolution rather than a second guess — this closes `OPEN_QUESTIONS.md` #21/#24,
open since Chunk 5. Subledger-to-GL feeds AI-22's own `inventory` reconciliation definition
directly. New, real weighted-average-cost computation (confirmed nothing else in this codebase
computes one). Negative stock reports the causing movement sequence, not just the item. Count
variances valued at WAC against a new human-entry-only `AiInventoryCount` model. Margin-by-item
routes through AI-15's ratio/trend family (`product_margin_step_change`) rather than a new alert
path, per the brief's explicit instruction — documented throughout as an ESTIMATE (no real
COGS-on-fulfillment posting path exists anywhere in this codebase). 7 tests incl. a seeded
0.01-unit subledger-to-GL difference.

### AI-27 — Duplicate & duplicate-payment intelligence

Cross-source scoring (`lib/aiRuntime/duplicates/detect.ts`) — same-vendor+normalised-document-
number (own stricter normaliser, `lib/aiRuntime/duplicates/normalize.ts`; `lib/docIntel/
duplicateCheck.ts` itself is untouched, its existing callers asserted unchanged), same-vendor+
amount+date, file hash (via `ExtractedDocument`), the duplicate-vendor case (reusing AI-19's
`findDuplicateEntities`), and a real "two bills sum to a third" split detector. `certain`/
`probable` → hold (reusing AI-19's `place_hold`, never a second implementation) + side-by-side
comparison. Retrospective sweep quantifies the recoverable amount from pairs where at least one
side is already paid. 8 tests incl. the mandatory 12-monthly-subscription false positive and a
same-PO legitimate second instalment producing zero flags.

### AI-26 — Accounting policy intelligence

Policy registry (`AiAccountingPolicy`, configured vs observed). Real consistency check: an
above-(configured)-threshold bill posted to an expense account vs one posted to `asset_fixed` — an
inconsistency with both sides cited by record, not just counted. All 6 A.3-inherited policy gaps
surfaced with **live evidence queried from the tenant's own data** where the underlying data makes
that possible — e.g. the real `semanticOverride.applied` rate on posted `JournalEntry`s, not the
static text the brief itself uses. `OBSERVE` only; never writes `AccountingSettings` or
`lib/accounting/smart-rules.ts` — asserted directly (source-grep). 6 tests incl. all-six-gaps-
present and the mandatory false positive.

### AI-30 — ERP operations intelligence

Health sweep across 10 detector families (stuck drafts/approvals/runs/tool-calls, dead-lettered
events, failed integrations, stale tax projections/FX rates, overdue schedules, orphan runs,
duplicate executions). **The only workflow with real autonomous repair** — bound to A.5's 4
permitted types via one shared `repairGate.ts` (retry cap, exponential backoff, "fails twice
escalates, never retried", every attempt audited before/after). **2 of 4 wired live**: re-queue a
dead-lettered `AiEvent`; refresh a stale tax projection (AI-12's own `rebuildTaxProjection`,
unchanged). **2 declared honestly `not_implemented`**, both real findings, not shortcuts: orphan
relink has no genuine dangling-reference-with-determinable-parent pattern anywhere in this schema
(the generic primitive, `relinkOrphan.ts`, is built and unit-tested standalone, ready the moment a
real case exists); integration-sync retry has no safe write path at all for an autonomous action
— `testConnection()`, the only re-runnable connector operation, mutates `Integration`
(`models/shared/**`, not `Ai*`), which the `internal_state` category structurally forbids, and the
normal RBAC write path requires a human `userId` an hourly cron sweep never has
(`OPEN_QUESTIONS.md` #34 has the full architectural finding). AI-30's own `act()` checks
`decision.autonomyApplied` explicitly before attempting any repair — the generic framework does
NOT auto-cap `internal_state` tool calls against the gate's decision (by design, since those tools
are assumed safe-by-construction as `Ai*`-only bookkeeping), so a workflow whose repairs have real
operational effect must gate itself, which AI-30 now does and tests. 7 tests incl. healthy-vs-
broken fixtures and the retry-cap/escalation sequence.

### AI-29 revisited — two more controls flipped from not_implemented to real

`master_data_verification` and `bank_detail_change_process` were deferred in Chunk 7 explicitly
"until AI-19 (Chunk 8)" — now that AI-19 exists (real `AiHold` + `AiMasterDataProfile.
bankChangeAlerts`), both flipped to `implemented` in `lib/aiRuntime/controls/definitions.ts`
(`OPEN_QUESTIONS.md` #35a). AI-29's `not_implemented` count drops from 4 to 2. 2 new tests.

### AI-25 revisited — DIO unblocked

`docs/ai/OPEN_QUESTIONS.md` #21/#24 asked this since Chunk 4/5. AI-25 now calls AI-11's
`resolveInventoryAccountMapping()` directly and computes DIO whenever it resolves for the tenant,
using `glBalanceForAccount()` (exported additively from AI-22's reconciliation definitions, given
an optional `asOfDate` param — never a second balance query) against the same COGS figure DPO
already used. CCC now includes DIO when computable. 1 new test proves a real DIO=56 result on a
seeded fixture; the existing not_computable test is unchanged (no inventory account in that
fixture, so the mapping still doesn't resolve there — proving the per-tenant conditionality, not
a hardcoded flip).

### Test results

1297/1297 passing (150 test files), `tsc --noEmit` clean, `eslint` clean on every file this chunk
touched (repo-wide baseline unchanged — the same two pre-existing `safety.test.ts` require-import
errors recorded in `BASELINE_FAILURES.md` since Chunk 7). **30 of 30 workflows now BUILT.** API
surface diffed: zero new routes (AI-19/11/27/26/30 are backend-only; the 13 route edits are the
already-completed Task 0.5 `master_data.changed` hooks on existing routes). UI regression: zero UI
files touched this chunk (confirmed via `git status` against `app/**`/`components/**`) — no scan
needed under `UI_REGRESSION.md`'s own coverage rule (an empty branch-diff import graph for UI).

### Docs updated

`CAPABILITY_MAP.md` (AI-19/11/27/26/30 rows to BUILT; header spec-availability to 30/30; summary
counts), `OPEN_QUESTIONS.md` (#33 the `payment_against_approved_bill` flip, #34 the integration-
sync-retry architectural finding, #35 the AI-15 registry wiring), `SYSTEM_INVENTORY.md` (0.3's
vendor-bill-payment row), `BASELINE_FAILURES.md` (four pre-existing UI route failures, flagged
separately), `UI_REGRESSION.md` (coverage-composition rule), `DECISIONS.md` (rbac authority-tier
open question), this file.

---

## Chunk 7 — Batch F: Audit, Journal Review & Control Monitoring (Task 0 + AI-18, AI-23, AI-29), 2026-09-03, branch `ai/workflows`

### Task 0.1 — UI regression harness switched to a production build, then to a targeted scan

Chunk 6's 239-route `next dev` scan was correctly called out as an endurance test, not a
regression harness. First fix tried: `npm run build:local` + `npm run start:local` against all
239 routes — the build itself succeeded cleanly in a few minutes (confirming compilation really is
a one-time cost), but the full-route scan against the running production server still logged 194
of 218 as TIMEOUT/ERR in warm-up and then crashed outright (`page.waitForTimeout: Page crashed`).
Diagnosed via `free -h`/`ps aux`: this is a shared desktop machine (Firefox with dozens of tabs,
VS Code, its TypeScript server, this coding session, all running concurrently, ~2GB free RAM at
the time) — the bottleneck was resource contention, never Next.js compilation. Adopted the brief's
own documented fallback instead: production build + a **targeted** ~28-route scan (every route
whose page or API dependency reaches a module this chunk's diff touched, plus a fixed 20-route
canary across every other module). Result: 0 timeouts, 28/28 clean, 102 seconds total — the
methodology that actually works reliably on this machine, not merely the cheaper one. Documented
in the new `docs/ai/UI_REGRESSION.md`, including what "zero diffs" does and doesn't cover.

### Task 0.2 — eslint baseline recorded formally

`docs/ai/BASELINE_FAILURES.md` gained an "Eslint baseline" section: a full-repo `npx eslint .` run
once (18,819 problems, two known pre-existing sources — one generated data file's thousands of
repeated `@ts-ignore` errors, and `tests/ai/aiRuntime/safety.test.ts`'s two deliberate
`require()` calls for static source analysis) — with the standing rule going forward: clean on
every file this work touches, repo-wide count must not increase. `docs/ai/DECISIONS.md` created,
recording AI-20's Option A (parent/child entity within one tenant, built only on real demand) as
the accepted product decision.

### Task 0.3 — `not_applicable` audit across every reconciliation definition

Found and fixed the exact bug the brief named from Chunk 6's own tax fixture (AI-22's `tax`
definition returning `not_applicable` while real `AiTaxTransaction` rows existed — hiding a real
blocker) and hardened three more definitions (`ap_control`/`ar_control_finance`/`inventory`) plus
`payroll` for the softer version of the same issue (an empty population falling through to a
vacuous `"reconciled"` rather than an honest `not_applicable`). Full write-up:
`docs/ai/OPEN_QUESTIONS.md` #32. New tests added/rewritten in `ai12TaxIntelligence.test.ts` and
`ai17ComplianceReadiness.test.ts` (two AI-17 fixtures needed a real `TaxRate`+`JournalEntry` pair
added to stay "ready"/"at_risk" now that an unconfigured control account with real activity
correctly reports as a blocker instead of a false-clean `not_applicable`).

### Task 0.4 — `check_sod` made real; permission-conflict SoD declared not_implemented

`lib/aiRuntime/journalPatterns/sod.ts::checkSod()` extracted from the `check_sod` tool's inline
handler (`lib/aiRuntime/tools/control.ts`) — the same real preparer≠approver comparison as before,
now a plain function AI-23 and AI-29 both call directly. Permission-conflict SoD recorded
`not_implemented` with a specific reason (`docs/ai/OPEN_QUESTIONS.md` #29) — no role-permission
matrix exists anywhere in this codebase to check against.

### Task 0.5 — the `closed_period_still_postable` design finding, shipped in AI-29

Chunk 4's A.2 deferred this exact finding to AI-29: `PeriodClosing` and `TransactionLock` are
never cross-wired. Shipped as a real control (`lib/aiRuntime/controls/definitions.ts`) — a
`PeriodClosing` marked `closed` with no `TransactionLock` covering its month-end is a real
exception, with evidence and severity. The two models are still **not** wired together — that
remains a deliberate non-change, a behaviour decision for a future chunk, not this one.

### AI-18 — Audit / evidence intelligence

Composes existing evidence sources — AI-21's `drillIntoAccount()` (extended downward to
`ExtractedDocument.createdRecordId` for source documents and `JournalEntry.approvalDetails` for
approvals) and AI-22's reconciliation engine — builds no new trace infrastructure.
`lib/aiRuntime/audit/citations.ts`'s `makeClaim()` makes A.2's citation rule structural: it throws
on an empty `citations[]`, so an uncited claim cannot exist in this workflow's output — proven
directly by a test, not just described. "No evidence found" cites the search performed
(`{model: "Query", id: <description>}`). Decision-trace retrieval
(`lib/aiRuntime/audit/decisionTrace.ts`) answers "why did the system do this" for any AI-touched
record — a documented reasonable-effort scan of the tenant's recent `AiDecisionTrace` rows (no
workflow's trace carries a structured "which record did this touch" index yet, so this doesn't
pretend to be an index lookup). Sampling (`lib/aiRuntime/audit/sampling.ts`) is a seeded mulberry32
PRNG, reproducible from `{method, seed}` alone — proven by running the same parameters twice.
Default trigger sweeps AI-21's own `unsupportedMaterial` lines and persists an `AiEvidencePack`.
9 tests.

### AI-23 — Journal review intelligence

A.3 held: AI-15's own detectors were extracted into `lib/aiRuntime/journalPatterns/
{sensitiveAccountPattern,timingPatterns}.ts` (manual-journal-to-sensitive-account, weekend/after-
hours, backdated-posting) — AI-15's workflow now wraps these exact functions (behaviour-preserving
refactors, its pre-existing 10-test suite stayed green throughout), and AI-23 consumes the
identical functions rather than re-deriving the signals. Every dimension scores against **this
tenant's own posting history** (`lib/aiRuntime/journalReview/tenantBaseline.ts`: per-account
amount mean/stddev, account-combination frequency, poster frequency) — a global threshold would be
wrong for most tenants, per A.3's own framing. `check_sod` (0.4) reused directly for the
preparer=approver dimension. Recommendations always carry named `reasons[]`, never a bare score.
The brief's own "round-number amounts" dimension was built, then removed once it started flagging
ordinary ₹1000 sales — caught by this workflow's own false-positive test
(`docs/ai/OPEN_QUESTIONS.md` #31) — folded into the more honest `amount_outside_normal_range`
z-score check instead. Cannot post, approve, or alter `voucherStatus` at any confidence — asserted
directly, no such tool exists anywhere in its registry. 8 tests incl. a month of ordinary journals
producing near-zero flags.

### AI-29 — Audit / control monitoring

A.4 held: `lib/aiRuntime/controls/{types,engine,definitions}.ts` mirrors AI-22's reconciliation
architecture exactly — one generic engine, twelve data-plus-two-functions definitions. 7 real
(`approval_present`, `sod_preparer_approver`, `no_posting_into_locked_period`,
`closed_period_still_postable`, `journal_documentation`, `override_logged`), 1 partial
(`approver_authority` — honestly scoped to a plausible-role check since no authority-tier concept
exists), 4 `not_implemented` (`sod_permission_conflict`, `master_data_verification`,
`bank_detail_change_process`, and two the brief itself suggested as "Partial" that research showed
had nothing partial to check — `payment_against_approved_bill`, `access_change_authorised`;
full reasoning in `docs/ai/OPEN_QUESTIONS.md` #30). `overall_control_health` structurally excludes
`not_implemented` controls from its average — the false-completion vector, asserted directly.
Remediation and `design_concern` both route through the already-registered `create_task` tool
(never a second task mechanism) — its existing dedupe-by-key upsert is what makes a persistently-
failing control raise its design concern once across five consecutive runs, not five times, and
what makes an exception impossible for the AI to self-close (the tool always resets a
dedupe-matched item to OPEN on write; only a human closes one, through the Attention tab). The
`override_logged` control's real test is whether `JournalEntry.semanticOverride` carries a stated
`reason` — "logged" is guaranteed by construction, "reviewed" has no field to check, so the
honest test is whether a business justification was captured at override time. 10 tests incl. the
`closed_period_still_postable` design finding firing on a real fixture and the five-consecutive-
runs dedup proof.

### Test results

1258/1258 passing (145 test files), `tsc --noEmit` clean, `eslint` clean on every file this chunk
touched (repo-wide baseline unchanged at ~18,819, per Task 0.2). 25 of 30 workflows now BUILT (up
from 22) — AI-29 counted BUILT with 4 of 12 controls permanently `not_implemented`, the same shape
as AI-13/AI-20's own honest partial-completeness. API surface diffed: zero routes added or changed
(AI-18/23/29 are backend-only, no new pages or API routes this chunk).

### Docs updated

`CAPABILITY_MAP.md` (AI-18/23/29 rows to BUILT; header spec-availability count; summary counts),
`OPEN_QUESTIONS.md` (#29 SoD permission-conflict, #30 the two Partial→not_implemented downgrades,
#31 round-number-amount removal, #32 the `not_applicable` audit), `BASELINE_FAILURES.md` (eslint
baseline section), `DECISIONS.md` (new file, AI-20's Option A), `UI_REGRESSION.md` (new file, the
harness methodology), this file.

## Chunk 6 — Batch E: Compliance, Group & Statement Intelligence (Task 0 + AI-12, AI-17, AI-21, AI-20), 2026-09-02, branch `ai/workflows`

> This entry is being written incrementally. Task 0 (six sub-items) is complete; the four Part B
> workflows follow in the brief's stated order (AI-12 → AI-17 → AI-21 → AI-20).

### Task 0.1 — AI-11 named in CAPABILITY_MAP.md

AI-11 is **Inventory / COGS intelligence** (`docs/ai/BRIEF-06-BATCH-E.md` Part 0.1). Row updated
with the name and an honest assessment against `models/inventory/**`: real costing groundwork
exists (`Product.tab_prices.standard_price`, `Stock.quantity`) but no valuation method, no
obsolescence/count-variance model — nothing to build against without the Chunk 8 spec, so nothing
was built. Recorded the real dependency this creates: AI-25's `not_computable` inventory-days gap
and AI-22's `inventory` reconciliation definition's `asset_current`-bucket simplification are both
really AI-11 questions. `CAPABILITY_MAP.md`'s header note updated too (26 of 30 workflows now
specced, up from 20).

### Task 0.2 — UI harness warm-up pass

`scripts/ui-regression-scan.ts` now hits every non-dynamic route once before the real scan,
discarding the results, specifically to absorb Next.js dev's lazy first-compile latency (the
exact cause of Chunk 5's 11 false-positive timeouts). Both counts are reported: warm-up
cold-timeout count and the real scan's genuine error count, so a real regression stays visible
rather than being silently absorbed by the warm-up itself.

### Task 0.3 — Attention tab anomaly-review actions

New tool `record_anomaly_review` (`lib/aiRuntime/tools/anomalyTools.ts`, `internal_state`) — the
Attention tab's two new actions ("Confirm as real" / "Expected — don't flag this again") both go
through it, keyed by outcome. "Confirmed" behaves like the existing `confirm_anomaly`; "Expected"
combines `dismiss_anomaly`'s effect with writing an `AiAnomalySuppression` row for the anomaly's
own suppression key, atomically — a single UI action, two effects, exactly as the brief frames it.
New API routes `GET /api/finance/ai-operations/attention/anomalies` (lists open `AiAnomaly` rows,
regardless of `silent` — that's the whole point, silent ones never became `AiAttentionItem` rows)
and `PATCH .../anomalies/[id]`. New "Anomalies to Review" section added to the Attention tab.
`AiDetectorHealth.precision` can now genuinely move off `null` for the first time in this project.
10/10 AI-15 tests passing (2 new, covering both `record_anomaly_review` outcomes directly).

### Task 0.4 — AI-28 exported as a callable service; AI-14's `timing` driver closes

New `lib/aiRuntime/cutoff/evaluateCutoff.ts` — AI-28's cut-off evidence logic extracted into a
plain function, `evaluateCutoff(tenantId, invoiceId, periodBoundary)`. AI-28's own workflow now
wraps this exact function (a behaviour-preserving refactor — its pre-existing 5-test suite is
still green, unmodified). AI-14's `decomposeVariance()` calls it directly for any driver whose
single current-period transaction traces to a vendor bill (`JournalEntry` line `sourceId`, added
additively to `getAccountTransactionDetail()`'s output — real linkage, confirmed via
`app/api/accounting/invoices/[id]/route.ts`, not assumed) and reclassifies it `"timing"` when the
posted date and receipt evidence disagree on period. `timing_vs_real_change_decomposition`'s
`not_implemented` entry is gone; `OPEN_QUESTIONS.md` #26 marked resolved. Proven by a new AI-14
test (constructing a real bill + PO + StockMove fixture with a genuine period mismatch). One
subtlety caught before it became a bug: the extracted function's first draft added a
boundary-relative condition to `isTimingDifference` that would have silently changed AI-28's own
existing behaviour in an edge case (a transaction whose posted and evidence dates are both outside
the period being evaluated) — reverted to AI-28's exact original comparison
(`postedPeriod !== evidencePeriod`, nothing else) once traced through, confirmed safe by the
still-green pre-existing suite.

### Task 0.5 — Policy tab → effective autonomy, proven end to end in a browser

New script `scripts/verify-policy-loop.ts` (not part of the vitest suite — a live-system
integration script, same category as `ui-regression-scan.ts`): logs into the real dev server as
`admin@aupulens.com`, creates one small tagged fixture (`POLICY-LOOP-VERIFY-DELETE-ME` — one
Customer, one open SalesInvoice, one draft Payment with a matching `unusedAmount`) so AI-05 has a
genuine "exact match" allocation candidate and clears its own confidence-threshold gate check
regardless of what else exists in the tenant, then: sets AI-05's `maxAutonomyLevel` to `observe`
via the real Policy tab UI, runs AI-05, records `autonomyApplied`; sets it to `draft` via the same
UI, runs AI-05 again, records `autonomyApplied`. Result: `observe → recommend (escalated)`,
`draft → draft (completed)` — the effective level genuinely changed, driven by a real browser
click, not just the field-level mechanism proof every workflow test already gave. The script
restores the tenant's original policy values and deletes every fixture document in a `finally`
block regardless of outcome (verified: the tenant's AI-05 policy and data were confirmed
unchanged after the run). Six iterations were needed to get the Playwright interaction reliable —
recorded in `docs/ai/OPEN_QUESTIONS.md` as a pattern note: a tab click issued before hydration
completes is a silent no-op (the element exists and "receives" the click, but no handler is
attached yet), and a page's own mount-time data fetch (not the tab click) is often what a script
should actually wait on.

### Task 0.6 — carried gaps confirmed recorded

`early_payment_discount`, `vendor_shares_bank_or_address_with_employee`,
`cross_source_duplicate_search`, `vendor_bank_change_hold`, and the inventory account bucket are
all already recorded in `OPEN_QUESTIONS.md` (#24, #25, #26 resolved this chunk) — confirmed
present, none built this batch, per the brief's explicit instruction that these belong to Chunk 8
(AI-19, AI-27, AI-11).

### Part A — decisions

- **A.1** `models/ai/AiTaxTransaction.ts` — a rebuildable projection, never a source of truth.
  `lib/aiRuntime/tax/rebuildTaxProjection.ts` is the only writer (delete-then-recreate per period,
  content idempotent across rebuilds — `projectionVersion` itself deliberately isn't, for audit
  trail). `taxRateRef`/`taxType` honestly `null` always — no source document reliably links to a
  `TaxRate` (same vestigial-field class as `Invoice.invoiceLines[].taxIds`). Jurisdiction resolved
  only for single-registration tenants.
- **A.2** `models/ai/AiComplianceProfile.ts` — one shared, human-maintained model; the one
  `models/ai/**` model no workflow may write (no write tool exists anywhere, asserted). Surfaced
  on the Policy tab as a real form (registrations/obligations/thresholds, add/remove rows, one
  PUT). Empty profile → `not_configured`/zero obligations everywhere, never an assumed default.
- **A.3** `submit_filing` was never registered. Asserted directly in both AI-12's and AI-17's test
  suites (`getTool("submit_filing")` undefined), matching the AI-06 payment-run precedent.
- **A.4** OBSERVE/RECOMMEND across the whole batch — AI-12 is the batch's only RECOMMEND
  (`defaultAutonomy`), AI-17/AI-21/AI-20 are OBSERVE. No new financial write tools; the only new
  write tool anywhere is `rebuild_tax_projection` (`internal_state`, targets `AiTaxTransaction`
  only).
- **A.5** Jurisdiction-agnostic by construction: `build_tax_workpaper`'s box set
  (`output_tax`/`input_tax_credit`/`net_payable`) is the universal shape every GST/VAT-style tax
  works from, never a hard-coded per-jurisdiction filing layout — recorded as a real simplification
  in `OPEN_QUESTIONS.md` #28, not just a code comment.

### AI-12 — Tax intelligence

The one workflow this batch that needed a real architectural correction mid-build:
`extract()`/`reason()` never receive a tool handle (`rt`) — only `act()` does, confirmed by
`executor.ts`'s exact call sites (`workflow.extract(observed, context)`, two args; `workflow.act
(reasoned, context, decision, rt, extracted)`, five). AI-12's first draft called
`rt.callTool("rebuild_tax_projection", ...)` from inside `extract()`, which would have thrown
`Cannot read properties of undefined` the moment it actually ran. Restructured so `extract()`/
`reason()` do only lightweight setup (compliance-profile lookup, a placeholder proposal), and all
substantive work — the rebuild, the fresh re-read, the three-way reconciliation, treatment review,
missing-evidence pass, and the workpaper build — happens inside `act()`, which mutates
`reasoned.proposal` in place (confirmed via `executor.ts` lines ~240-250: `finalizeTrace()` reads
`reasoned.proposal` again *after* `act()` returns, same object reference — a supported pattern, not
a hack) and returns real findings via `ActResult.findings` (confirmed merged identically with
`reason()`'s own findings via `allFindings`).

Three-way reconciliation: ledger (AI-22's new `tax` reconciliation definition, `glBalanceForAccount`
summed across every `TaxRate.accountId`), transactions (`AiTaxTransaction` summed, input positive/
output negative — the GL's own debit-credit axis), return (the workpaper's net-payable box).
Transactions and return tie exactly by construction (both derived from the same rows) — the
meaningful signal is always ledger-vs-either. Treatment review and missing-evidence detection were
extracted into `lib/aiRuntime/tax/taxSignals.ts` (`findTreatmentExceptions`/`findMissingEvidence`)
specifically so AI-17 could reuse the identical signals rather than re-derive a disagreeing answer.
11 tests: rebuild idempotent, rebuild self-healing (corrupt a row, rebuild, healed), box totals
exact, a seeded 1-unit ledger-vs-transactions difference detected and traced, missing-registration-
number flagged, a clean period → zero three-way findings, empty profile → `not_configured`, a
configured profile drives a real workpaper, cannot mutate `TaxRate` (source-grep), no tool anywhere
can write `TaxRate`/`AiComplianceProfile`, `submit_filing` doesn't exist.

AI-22's `tax` reconciliation definition flips from Chunk 4's `not_implemented` placeholder to real
(`lib/aiRuntime/reconciliation/definitions.ts`) — this takes AI-13's permanent `not_checked`
domains from one to zero, confirmed by rewriting the two `ai13DayZeroClose.test.ts` tests whose
entire premise depended on `tax` staying `not_checked` forever.

### AI-17 — Compliance readiness

Shares `lib/aiRuntime/compliance/computeReadiness.ts` with a new `compliance` domain added to
AI-13's close state (`lib/aiRuntime/closeReadiness/domains.ts::checkComplianceDomain`, wired into
`compute.ts`'s `otherDomains` list) — "feed into AI-13's close state" from the brief, done the same
way every other AI-22-backed domain already is: wrap the shared computation, never re-derive a
disagreeing one. AI-13 now has 16 close domains (15 + `compliance`), both doc comments in
`domains.ts` updated.

**"Deadline risk scored early" required a real design correction while building the tests**: the
first-instinct design (readiness driven only by real blockers — reconciliation/evidence/treatment/
registration — deadline proximity only escalating a finding's *severity*, never the readiness verdict
itself) turned out to under-deliver on the brief's own bar ("an obligation that first appears
at-risk three days before its deadline is a failure of this workflow"). The test suite makes the
correct shape explicit: a *fully clean* obligation (reconciled, evidenced, no registration gap)
still reports `at_risk`, not `ready`, once its deadline falls inside `warningWindowDays` — a real,
useful "this needs attention soon, nothing's wrong yet" signal, not a false positive. A *hard*
problem (unreconciled three-way, missing evidence, an open registration gap) is always `blocked`
regardless of how much time is left. `warningWindowDays` is per-obligation, human-configurable,
defaulting generous (21 days).

Registration gaps are config-internal-consistency checks only — no place-of-supply signal exists
anywhere to detect "taxable activity in an unregistered jurisdiction" from transaction data itself
(the same limitation `rebuildTaxProjection.ts`'s jurisdiction resolution already documents). What's
honestly derivable: an obligation naming a jurisdiction with no matching registration, or a
configured turnover threshold crossed (fiscal-year-to-date output tax base) with no registration —
both real, both HIGH. 11 tests incl. the deadline-risk-early case, the hard-blocked-not-merely-at-
risk case, both registration-gap triggers, and the AI-13 domain-sharing proof (`sourceWorkflow:
"AI-17"` on the fed-through blocker).

### AI-21 — Financial statement intelligence

An annotation layer only — `lib/aiRuntime/statements/annotateStatement.ts` wraps
`buildPostedJournalReport()` verbatim (never a second figure) and attaches, per line: reconciliation
status (AI-22's own results, matched to the account via the same account-selection queries each
reconciliation definition already runs internally — an account nothing checks is honestly
`not_covered`, never accused of being unreconciled), evidence status + staleness (AI-13's own
`AiCloseState.domains[]`, never re-derived), materiality + movement (AI-14's own most recent
`AiDecisionTrace.rawProposal.comparisons[]`, `not_available` when AI-14 hasn't run). `drillIntoAccount()`
is a thin, named wrapper over AI-14's own `getAccountTransactionDetail()` — the shared entry point
AI-18 (Chunk 7) will also consume. `unsupportedMaterial` (the headline output) is deliberately
narrow: `material` AND a real, machine-detected `unreconciled` status — never raised for uncovered
or immaterial lines. Surfaced as a fourth "Statements" tab on `/finance/ai-operations`;
`/finance/reports` untouched. OBSERVE, no ledger-value write path anywhere in this workflow's
folder (source-grep, same pattern as AI-09/AI-13). 6 tests incl. statement-totals-equal-trial-
balance exactly, balance-sheet-balances, a seeded unreconciled-material line raising a HIGH finding,
a fully-reconciled-immaterial line raising nothing, and the drill-down chain reaching real
`JournalEntry`/transaction-line data.

### AI-20 — Intercompany / consolidation intelligence

Read the whole section before writing code, per the brief's own instruction — the conclusion (group
consolidation cannot be built honestly on this codebase's data model) was confirmed, not assumed.
`docs/ai/AI-20-ARCHITECTURE-NOTE.md`: `Organization.subdomain` **is** `tenantId`, so two group
companies are structurally two tenants, and `contextService.ts` has no code path that lets a
workflow read a second tenant's data — a security property, correct as-is, not a gap. Two options
laid out (single-tenant parent/child entity model vs. an explicit-consent cross-tenant service),
with cost/risk for each; recommendation is Option A, only if a tenant actually asks — never built
speculatively. `lib/aiRuntime/reconciliation/definitions.ts`'s `intercompany` entry stays
`not_implemented`, reason now pointing at the memo (replacing Chunk 4's placeholder text).

What *is* buildable within one tenant: related-party detection
(`lib/aiRuntime/relatedParty/detectRelatedParties.ts`). The brief frames this as "match Customer
against Vendor" — this codebase has no separate vendor table for Finance purposes at all
(`PurchaseOrder.partnerId` and vendor-bill `Invoice.partnerId` both ref `Customer`, Odoo-style
unified partner model, `CLAUDE.md` Known Issue #4; `models/admin/Vendor.ts` is an unrelated
procurement-rating list with no GSTIN/PAN/address — a real landmine, now recorded in
`GLOSSARY.md`). So matching is one `Customer` record used in a sales role against a different one
used in a purchase role: shared GSTIN/PAN → `certain`; shared normalized address, or same
non-generic email domain plus name similarity → `probable`; name similarity alone → `possible`,
**never** `certain` (the brief's own explicit false-positive guard). Shared bank account declared
`not_implemented` — `Customer` has no bank-details field anywhere. OBSERVE, proposes/merges/
eliminates nothing — every finding is evidence for a human to confirm. 5 tests incl. the
false-positive guard, genuinely-different-similar-named-companies not matched at all, and
structural (not filter-based) cross-tenant isolation.

### Test results

1229/1229 passing (142 test files), `tsc --noEmit` clean, `eslint` clean on every file touched this
chunk. 22 of 30 workflows now BUILT (up from 18) — AI-20 counted BUILT for its related-party half,
consolidation itself permanently `not_implemented` by design, the same shape as AI-13 shipping with
permanently `not_applicable` domains.

### Docs updated

`CAPABILITY_MAP.md` (AI-11 named + assessed; AI-12/17/20/21 rows updated to BUILT; summary counts),
`GLOSSARY.md` (related-party vs. consolidation; the `models/admin/Vendor.ts` landmine — AI-20's own
finding, not AI-21's; AI-21 never touches `models/sales/**` at all, so the pre-existing `SalesInvoice`
cast prediction there didn't apply this chunk), `OPEN_QUESTIONS.md` (#27 the Playwright hydration
pattern note, #28 the universal-workpaper-box-set simplification), this file.

## Chunk 5 — Batch D: The Intelligence Layer (Task 0 + AI-05, AI-06, AI-16, AI-14, AI-15, AI-25), 2026-09-02, branch `ai/workflows`

> This entry is being written incrementally as the chunk progresses (Task 0 is done; the six
> Part B workflows follow in the brief's stated order). Sections below are complete for the work
> done so far; later sections will be appended as each workflow lands.

### Task 0.3 — `internal_state` tool category

Added `category?: "internal_state"` to `ToolDefinition` (`lib/aiRuntime/tools/registry.ts`) —
tools tagged this way write only `models/ai/**` and skip the financial-module permission check in
`callTool()` (`if (isWriteEffect(tool.sideEffect) && tool.category !== "internal_state")`) while
still going through idempotency, audit, and the autonomy gate like every other tool. Seven tools
now carry the tag: `create_task`, `resolve_task`, `record_close_assertion`,
`draft_prepaid_schedule`, `draft_depreciation_schedule`, `link_schedule_draft`, and the new
`record_learning_outcome` (`lib/aiRuntime/tools/internalStateTools.ts`, replacing AI-07's direct
`recordProposal`/`recordOutcome` calls — a real Hard Rule 2 gap this migration closed). Proven via
a new `safety.test.ts` test that statically reads each handler's real `.ts` source (not
`.toString()` on the compiled function — Vite/esbuild renames default-imported model bindings to
`default` in the compiled source, which produced false positives on the first attempt) and
brace-depth-extracts the handler body to grep for write-call identifiers, asserting every one
matches `/^Ai[A-Z]/`.

### Task 0.4 — AI-24 wired into AI-13's `evidence` domain

`checkEvidenceDomain()` (`lib/aiRuntime/closeReadiness/domains.ts`) no longer hardcodes
`not_checked`. Recognized before writing any code that a naive wiring (`domains.ts` →
`evaluateCloseAssertions()` → `computeCloseReadiness()` → `domains.ts`) would recurse forever, so
the pure assertion logic was extracted into a new dependency-free module
`lib/aiRuntime/evidence/deriveAssertions.ts` (`CLOSE_ASSERTIONS`, `deriveAssertions()` — no DB, no
import of either `compute.ts` or `assertions.ts`). `compute.ts` now builds the other 14 domains
first, then derives `evidence` from those directly. Permanent `not_checked` domains are down from
2 to 1 (`tax` only) — verified by a new test in `ai13DayZeroClose.test.ts`.

### Task 0.5 — carry-forward notes

Standing-rule comment added directly above the OBSERVE/RECOMMEND short-circuit in
`autonomyGate.ts` explaining why escalation keys off the workflow's *declared* level, never the
clamped one (the Chunk 4 bug this exact check caught). `GLOSSARY.md` gained a `## Landmines`
section recording the `smart-rules.ts` `"asset_bank"` dead-code reference (do not edit that file).
`OPEN_QUESTIONS.md` gained #24: no account type identifies "inventory" for reporting, so AI-25
must report `not_computable` for DIO rather than guess.

### Task 0.1/0.2 — `/finance/ai-operations` (first UI in the project) and the policy seed

**Route**: `app/finance/ai-operations/page.tsx`, reached via one new sidebar entry appended to the
existing "Others" section of `config/sidebar/finance.ts` (additive — no existing item touched).
Gated at the page level: the Policy tab and its two backing routes are hidden/rejected for anyone
outside `lib/org/rbac.ts::canManageOrg()` (`["admin", "master-admin"]`) — confirmed by prior
research that no "finance-owner" role exists anywhere in this codebase, so the brief's
"admin/finance-owner" language maps onto the two real elevated roles.

Three tabs, three backing route groups, all new and additive:
- **Attention** — `GET /api/finance/ai-operations/attention` (filterable by status/priority/
  workflowId) and `PATCH /api/finance/ai-operations/attention/[id]` (`resolve` | `snooze` |
  `dismiss`). No approve-and-post action exists — a human closing/deferring their own queue item
  is a direct, tenant-scoped write in this route (same shape as the pre-existing PeriodClosing
  route), not a Hard Rule 2 violation, since that rule governs writes *by AI code*, not a human
  operating a human-facing queue UI. "Snooze" reuses the existing `AiAttentionItem.due` field
  (push it forward) rather than adding a new status value, so no state-machine enum changed.
- **Close** — `GET /api/finance/ai-operations/close` — a pure read of `AiCloseState`, never
  triggers a recomputation. Domain grid renders `not_checked`/`not_applicable` with a visibly
  distinct (dashed, muted/italic) style from `ready`/`blocked`/`at_risk`. Ranked blockers flatten
  every domain's blockers and sort by severity (`hard_blocker` → `unclassified`).
- **Policy** — `GET /api/finance/ai-operations/policy` seeds one `AiWorkflowPolicy` row per
  currently-*registered* workflow (via `listWorkflows()` from the runtime registry itself, not a
  hand-maintained duplicate table — so the seed can never drift from what a workflow actually
  declares) at that workflow's own `defaultAutonomy`, with `killSwitchEnabled: false`, only for
  rows that don't already exist. `PATCH /api/finance/ai-operations/policy/[workflowId]` updates
  `maxAutonomyLevel` (validated against `AI_AUTONOMY_LEVEL_ORDER` — `NEVER_AUTONOMOUS` is
  excluded from that array by design, so it is not a selectable value), `killSwitchEnabled`,
  `autoPostSchedules`, `materialityThreshold`, and `confidenceThreshold`. Both routes are
  admin-gated. (`AiMaterialityPolicy`'s separate per-action-class thresholds collection was left
  out of this tab's scope — the brief's "materiality fields" reads as `AiWorkflowPolicy`'s own
  `materialityThreshold`/`confidenceThreshold`, both real per-workflow fields; a dedicated editor
  for the per-action-class collection is a reasonable follow-up, not built this chunk.)

**UI regression result**: ran the Phase 0 scanner (`scripts/ui-regression-scan.ts`) against all
239 routes in `artifacts/routes.txt`, output to `artifacts/ui-after/`, and diffed every field
against `artifacts/ui-baseline/`. Zero routes present in baseline are missing from the new scan.
27 routes appeared in the new scan with no baseline counterpart — all pre-existing Sales routes
(`/sales/quotes`, `/sales/subscriptions/**`, etc.) that were simply never captured in the original
Phase 0 baseline; unrelated to this chunk, nothing new was added to `routes.txt` for this chunk's
own page. 11 routes showed a behavioral diff on the first pass — every one was a bare
`page.goto: Timeout 20000ms exceeded` with zero console/page errors captured, spread across
completely unrelated modules (Finance, HR, Manufacturing, Sales) never touched this chunk, and 3
of the 11 were routes flipping from *error in baseline* to *clean now*. That bidirectional,
cross-module pattern is the signature of Next.js dev-server cold-compile latency on a route's
first hit in a resumed scan, not a functional regression — confirmed by re-scanning exactly those
7 timed-out routes once the dev server was fully warm: all 7 came back clean (200, zero errors).
One additional pre-existing, unrelated flake was spotted and left alone: `/crm/mobile` has a
non-deterministic SSR/client hydration mismatch on a connectivity-status dot's color class — real,
but present in code this chunk never touched, out of scope to fix here.

The new page itself (`/finance/ai-operations`, not part of `routes.txt`) was scanned separately:
200, zero console errors, zero page errors, sidebar entry renders in the correct section.

**Net result: zero UI regressions on any pre-existing route.**

### AI-05 — Receivables operations

`lib/aiRuntime/workflows/ai-05-receivables-operations/index.ts`, new tools in
`lib/aiRuntime/tools/receivablesTools.ts` (`draft_receipt_allocation` — module `sales`, real
financial write; `draft_communication` and `open_dispute` — `internal_state`, `models/ai/**`
only). Two new models: `AiDispute.ts`, `AiCommunicationDraft.ts`.

Never fabricates money: the only allocation candidates are existing DRAFT `Payment` documents
with `unusedAmount > 0` — `draft_receipt_allocation` completes their allocation (appends rows,
reduces `unusedAmount`) through `lib/sales/paymentAllocation.ts`'s real validation functions;
it never creates a new Payment and never touches `SalesInvoice.payments[]` directly (that sync
only runs when a human later confirms the payment to PAID via the existing route — A.2). Short
payment vs ordinary partial is a documented heuristic (no config value exists for this): below
80% of the customer's oldest open invoice reads as a short payment → `AiDispute` opened, no
allocation; at or above 80% but still short of total due, FIFO-allocates oldest-first. Predicted
payment dates use each customer's own paid-invoice history (mean days-to-pay, ≥3 samples) rather
than invoice terms. `reminderEngine.ts` gained one additive guard — skip any invoice with an open
`AiDispute` — "stop the reminder sequence for that invoice" implemented in the real send path,
not a second mechanism. `models/sales/DunningRule.ts` was not touched (see `GLOSSARY.md`).

10/10 new tests passing, including the two required false-positive/behavioural proofs (a customer
within terms with no lateness history produces no worklist entry; a paid invoice is never in the
worklist) and a direct proof of the Sales-vs-Finance payment-state divergence detector (added
after initial review found the mechanism had never been exercised with a real positive case: 1
divergent invoice, ₹1000, Finance-side left untouched). Full suite: 1156/1156 passing after this
workflow's initial cut, `tsc --noEmit` clean.

### AI-06 — Payables operations

`lib/aiRuntime/workflows/ai-06-payables-operations/index.ts`. New pure export
`computeLineVariances()` added to `lib/accounting/matching.ts` (additive only — `runPOMatching()`
untouched, its existing test file `tests/accounting/matching.test.ts` still green unmodified,
proving existing callers behave identically). Turns the existing matcher's terse boolean verdict
into a structured "which leg, by how much" (quantity/price/receipt), 1% tolerance both directions
(documented heuristic, no config field exists). Two new tools
(`lib/aiRuntime/tools/payablesTools.ts`): `draft_match_annotation` (module `finance`, DRAFT —
replaces `Invoice.discrepancyNotes` only on a bill the real matcher already flagged `mismatch`,
never sets the verdict itself) and `record_payment_run_proposal` (`internal_state`). New model
`models/ai/AiPaymentRunProposal.ts` — "no payment-run concept exists anywhere," so this is new,
not a wrapper; no "release" tool exists anywhere for it (asserted directly in tests).

Duplicate check reuses the existing `run_duplicate_scan` tool (AI-01/AI-27's extended
`duplicateCheck.ts`) unchanged. Three `checks_not_implemented`: vendor-bank-change hold and
cross-source duplicate search (both per A.3), plus `early_payment_discount` — found during this
workflow, not declared by the brief, but no payment-terms/discount field exists anywhere to
compute it from (`OPEN_QUESTIONS.md` #25).

11/11 new tests passing (quantity/price/missing-receipt/over-receipt variance identification,
false-positive match, duplicate detection, payment-run grouping/exclusion, and the two "cannot
be faked/released" proofs). Full suite: 1167/1167 passing, `tsc --noEmit` clean.

### AI-16 — Cash intelligence

`lib/aiRuntime/workflows/ai-16-cash-intelligence/index.ts` — OBSERVE only, zero write tools, zero
`rt.callTool` calls anywhere in its folder (asserted by source-grep). Position reuses AI-03's
`computeBankPosition()` (`ai-03-bank-reconciliation/position.ts`) per bank account's latest
statement, never a second bank-vs-GL comparison. Inflows/outflows are read from AI-05's and
AI-06's own most recent `AiDecisionTrace.rawProposal` for the tenant — the existing persisted
output surface, not a new coupling or a re-derivation of either workflow's logic; a tenant where
neither has run yet gets an honest `omissions` entry, not a fabricated number. Fixed 30-day
horizon (no config field exists for this). Non-INR currency with no `FxRate` is excluded from
`position.total_available` and from the forecast entirely, `incomplete_reason` says why — proven
by a test with a real FX rate seeded (folds in correctly) and one without (stays incomplete).
`AI-05`'s `PredictedPayment` output gained an `amount` field (additive) since AI-16 needs a
number to forecast a date against, which the original shape didn't carry.

6/6 new tests passing, including the two invariant proofs the brief calls out specifically:
opening + inflows − outflows = closing exactly on every one of 30 forecast days, and a tenant
with ample headroom produces zero risks. Full suite: 1173/1173 passing, `tsc --noEmit` clean.

### AI-14 — Flux analysis

`lib/aiRuntime/workflows/ai-14-flux-analysis/index.ts` — OBSERVE, read-only by construction (no
write tool exists, asserted by source-grep). New pure export `getAccountTransactionDetail()`
added to `lib/accounting/reports.ts` (additive — `buildPostedJournalReport()` untouched) for
line-level drill-down; account TOTALS still come exclusively from `buildPostedJournalReport()`.

Comparative basis is budget (`Budget.lines[].amounts[].periodLabel` matching the period) where a
tenant has one, else the immediately preceding calendar month — `basis_available` reports which
exist. Two-part materiality (absolute OR percentage, via `AiMaterialityPolicy` `flux_analysis`)
gates decomposition and escalation only; an unconfigured policy reports every movement
`unclassified`, never filters it out (Chunk 3 precedent).

Driver decomposition groups an account's transactions by counterparty and computes each group's
delta from the same posted data that produced the account total — the sum of every group's delta
therefore always equals the account's variance exactly. Only groups >= 5% of the variance's
magnitude are listed as named drivers; everything else becomes `unexplained_amount`, computed as
the exact residual, never estimated — this is what makes "drivers + unexplained = total variance,
to the cent" true by construction, not by rounding luck. `timing_vs_real_change_decomposition` is
declared `not_implemented`: the brief says "ask AI-28," but AI-28 exports no reusable function
(confirmed, `OPEN_QUESTIONS.md` #26) — inventing a timing heuristic here would duplicate logic
that belongs to AI-28.

6/6 new tests passing. Full suite: 1179/1179 passing, `tsc --noEmit` clean.

### AI-15 — Anomaly detection

`lib/aiRuntime/workflows/ai-15-anomaly-detection/index.ts` — OBSERVE, no write tool touches a
financial document anywhere (source-grep proven). Three new models
(`AiAnomaly.ts`, `AiDetectorHealth.ts`, `AiAnomalySuppression.ts`) and four new `internal_state`
tools (`lib/aiRuntime/tools/anomalyTools.ts`): `record_anomaly`, `confirm_anomaly`,
`dismiss_anomaly`, `suppress_anomaly` — A.5's precision machinery in full: `AiDetectorHealth.
sampleSize` counts reviewed (confirmed+dismissed) anomalies, not raised ones; a detector crossing
`AI15_MIN_SAMPLE` (20) reviewed with precision below `AI15_PRECISION_FLOOR` (50%) auto-disables
itself (one-way — nothing re-enables it automatically) and raises exactly one INFO attention item,
both happening at the one place `sampleSize`/`precision` actually change (inside the shared
`reviewAnomaly()` the confirm/dismiss tools call).

Nine detectors across all six named families (Amount ×2, Counterparty ×2, Account ×1, Timing ×2,
Journal pattern ×1, Ratio/trend ×1 — the last one reads AI-14's latest trace, never recomputes its
variance logic) — a deliberately smaller, real set rather than every named sub-example, matching
AI-07's "build the strongest version of fewer things" precedent. `vendor_shares_bank_or_address_
with_employee` is declared `not_implemented` (`Vendor.ts` has neither field — confirmed).
**Every anomaly ships `silent: true`** unconditionally this chunk — a freshly-built detector has
zero review history by construction, so "cleared a minimum sample at acceptable precision" cannot
yet be true for any of them; this is correct day-one behaviour, not a shortcut.

8/8 new tests passing, including the brief's own "single most important test" (a year of
consistent, weekday, business-hours, real-business-document activity → zero anomalies) and the
full precision-floor-crossing → auto-disable → single INFO item chain, proven end-to-end via
direct tool calls (20 reviewed anomalies, 5 confirmed, precision 25%, `autoDisabled: true`,
exactly one `AiAttentionItem` created). One real bug caught while writing these tests, not in
production code: `Model.updateOne` (not just `.save()`) is also intercepted by Mongoose's
`timestamps: true` plugin, silently re-stamping `createdAt` — fixed by going through
`Model.collection.updateOne` (the raw driver) wherever a test needs to backdate a fixture.
Full suite: 1187/1187 passing, `tsc --noEmit` clean.

## Chunk 4 — Batch C: Continuous Reconciliation & Day Zero Close (Task 0 + AI-22, AI-13, AI-24, AI-28), 2026-09-02, branch `ai/workflows`

### Part 0 — foundation defects: sign-off and carry-forward

**0.1 — `AiWorkflowPolicy.maxAutonomyLevel` clamp, now live.** `lib/aiRuntime/policy/autonomyGate.ts::decideAutonomy()`
now computes the effective ceiling as `min(workflow's declared requestedAutonomy,
policy.maxAutonomyLevel)` **before** the seven-check gate runs, not after. A missing/unrecognized
policy value resolves to RECOMMEND (fail closed — matches the existing missing-row default already
established in `contextService.ts`), never up to the workflow's declared level. The clamp source
(`clampedBy: "workflow_declared" | "policy_max_autonomy" | "never_autonomous"`) is recorded on
every `AutonomyDecision` and its reasoning surfaces in the run's `reasons`/trace. A workflow
clamped down to RECOMMEND by *policy* (not by its own native design) still `escalate: true`s for
human attention, same as every other gate failure — only a workflow that natively declared
OBSERVE/RECOMMEND (AI-04, and this whole batch) skips the gate/escalation path entirely, since
there's nothing to clamp.

New test: `tests/ai/aiRuntime/safety.test.ts` — a synthetic workflow declaring EXECUTE, with
`AiWorkflowPolicy.maxAutonomyLevel: RECOMMEND` and `killSwitchEnabled: true` (deliberately ON, to
prove the *clamp*, not the kill switch, is what blocks it), never reaches EXECUTE-level behaviour
in `act()`. Same flag-never-set assertion pattern as the Chunk 1 `NEVER_AUTONOMOUS` fix.

**Required verification pass — effective autonomy for all 8 shipped workflows.** For an
unconfigured tenant (no `AiWorkflowPolicy` row — the real state of every tenant today, since no
UI exists yet to set one; `maxAutonomyLevel` defaults to `"recommend"` per the schema):

| Workflow | Declared ceiling | Policy `maxAutonomyLevel` (unconfigured tenant) | Effective level | Changed by this fix? |
|---|---|---|---|---|
| AI-01 | DRAFT | recommend (default) | RECOMMEND | **Yes** — previously reached DRAFT with only `killSwitchEnabled: true` set |
| AI-02 | EXECUTE | recommend (default) | RECOMMEND | **Yes** — previously reached EXECUTE with only `killSwitchEnabled: true` set |
| AI-03 | EXECUTE | recommend (default) | RECOMMEND | **Yes** — same |
| AI-04 | RECOMMEND | recommend (default) | RECOMMEND | No — already native RECOMMEND, clamp is a no-op |
| AI-07 | DRAFT | recommend (default) | RECOMMEND | **Yes** |
| AI-08 | CONTROLLED_AUTONOMOUS | recommend (default) | RECOMMEND | **Yes** |
| AI-09 | DRAFT | recommend (default) | RECOMMEND | **Yes** |
| AI-10 | CONTROLLED_AUTONOMOUS | recommend (default) | RECOMMEND | **Yes** |

7 of 8 shipped workflows change real behaviour the moment this fix ships: every one of them was
previously reachable at its full declared ceiling with nothing more than
`killSwitchEnabled: true` — `maxAutonomyLevel` was dead configuration. This is not a regression;
it is every ceiling set across Chunks 2-3 finally being enforced by the runtime instead of by
convention. For a tenant that explicitly configures `maxAutonomyLevel` to match each workflow's
own declared ceiling (the scenario every Batch A-C test fixture was updated to construct, and the
state a validated/rolled-out tenant would actually be in), the effective level equals the declared
ceiling for all 8, unchanged from before this fix. 22 pre-existing tests across AI-01/02/03/07/08/
09/10 broke the moment this clamp went live — every one was a test fixture missing an explicit
`maxAutonomyLevel`, not a workflow-code bug; all 22 fixed by adding it, matching what a real
validated tenant's configuration would need to look like going forward.

**0.2 — `subscriptionFilter` ownership contract.** `WorkflowDefinition.subscriptionFilter?(event):
boolean | Promise<boolean>` (new, optional field, `lib/aiRuntime/workflows/types.ts`), enforced by
`lib/aiRuntime/runtime/eventBus.ts::dispatchEvent()` — but **only when an eventKey has more than
one subscribed workflow** (a genuinely shared key); a sole subscriber needs no filter, there is
nothing to disambiguate. On a shared key: no filter declared → skipped (default-reject, before any
`AiWorkflowRun` row is created for it); a filter returning `false` also skips it.

Two shapes of "shared," treated differently, both explicit rather than assumed:
- **Fan-out** (`bill.created`, `invoice.created`, `expense.submitted`, `ai.sweep.hourly`) — every
  subscribed workflow legitimately wants every event of that key for its own independent domain
  question; there is no single "owner" of a bill or a sweep tick. AI-02/03/04/07/08/09/10 each
  declare `subscriptionFilter(): true` — a deliberate, explicit accept, not an accidental one.
- **Entity ownership** (`schedule.due`) — one specific `AiSchedule` was created by exactly one
  workflow. Generalised the ad-hoc extract()-time checks Batch B hand-wrote into
  `lib/aiRuntime/schedules/ownership.ts::scheduleBelongsTo()`, called from each of AI-07/08/09/10's
  `subscriptionFilter`. Each workflow's `extract()` keeps its own inline check too — defense in
  depth, same pattern as `callTool()`'s structural permission gate backing up each workflow's own
  permission logic.

New tests in `tests/ai/aiRuntime/eventBus.test.ts`: a synthetic pair of workflows sharing a fake
key, one with `subscriptionFilter` declared and one without, proves default-reject (the
undeclared one never runs, zero `AiWorkflowRun` row created for it); a real `schedule.due` dispatch
against a genuine AI-08-owned `AiSchedule` proves only AI-08 (not AI-07/09/10) receives it.

**0.3 — `allowNonStandard` visibility.** Every `allowNonStandard: true` tool call across AI-08,
AI-09, AI-10's schedule-posting `act()` branches now: (a) contributes its exact override reason to
the run's trace `reasonChain` via a new `ActResult.reasonChain?: string[]` field, merged in
`lib/aiRuntime/runtime/executor.ts`'s `finalizeTrace()` call; (b) increments a new
`metrics.policy_overrides` counter, added to `AiWorkflowRun.metrics` (schema change — the field is
a strict nested object, so this needed an actual additive schema field, not just an app-level
counter, or Mongoose would have silently stripped it on save) and threaded through
`WorkflowRunEnvelope`. New/extended tests in all three workflows' suites assert both the metric and
the trace text.

**0.4/0.5 — Vestigial fields section, model export quirk.** `GLOSSARY.md` now has a dedicated
**Vestigial fields** section (all three: `Invoice.invoiceLines[].taxIds`,
`SaleOrder.revenueRecognition.amount`, `.method` — with evidence each) and a **Model export
quirks** section for `SalesInvoice`'s ambiguous `Model` export, both promoted out of scattered
per-chunk mentions into a single lookup point. `revenueRecognition.recognizedAt`/`.recognizedBy`
recorded separately as human-set-not-engine-derived, per the brief's explicit distinction.

### Part A — decisions

**A.1 FX, narrowly.** `models/finance/FxRate.ts` — manual/import entry only, AI never writes it.
No remeasurement engine built: Chunk 3 established `PurchaseOrder`/`SaleOrder`/`SalesInvoice`
carry no currency field at all, so only `Invoice.currencyId`/`BankAccount.currency` can ever be
non-INR, and the only consumer is AI-13's FX close-domain check (missing rate for a non-INR
balance at period end → blocker; no non-INR balances at all → `not_applicable`, never silently
`ready`).

**A.2 `PeriodClosing` stays read-only.** `models/ai/AiCloseState.ts` and
`models/ai/AiCloseAssertion.ts` are the parallel state AI-13/AI-24 write to. A human-advanced
`PeriodClosing.status` contradicted by computed data raises a CRITICAL finding naming both the
human status and the machine evidence — never a status mutation. Proven by source-grep tests in
both AI-13's and AI-24's suites, matching AI-09's Sales-boundary test pattern. `PeriodClosing`↔
`TransactionLock` not cross-wired, per instruction — reported as an AI-29-territory control
finding, not fixed.

**A.3 OBSERVE/RECOMMEND for the whole batch.** AI-22: OBSERVE, never invokes another workflow
(the brief's "may invoke AI-03's Pass-1" language is read as describing AI-13's auto-resolve
pattern, not a capability AI-22 itself needed — AI-22's own algorithm section never asks it to
trigger anything). AI-13: OBSERVE, auto-resolves safe blockers by emitting the owning workflow's
own trigger event (`schedule.due`/`ai.sweep.hourly` via `emitEvent()`, going through the same
dispatch/ownership/gate machinery as any other trigger — never a direct act). AI-24: OBSERVE plus
`create_task`. AI-28: RECOMMEND, drafts nothing. Two tools needed beyond A.3's registered list —
`resolve_task` and `record_close_assertion` — both deliberate, reasoned exceptions, not silent
additions; full justification in `OPEN_QUESTIONS.md` #19.

**A.4 Materiality is load-bearing.** `classifyBlockerSeverity()`
(`lib/aiRuntime/closeReadiness/classify.ts`) returns `unclassified` — a fifth severity value,
added to `AiCloseState`'s enum — whenever a domain's materiality isn't configured, never silently
downgraded to `minor_exception`. A single `unclassified` blocker anywhere forces the whole
tenant's readiness to `indeterminate`, unconditionally, in the pure `classifyReadiness()` rollup.

### Part B — the four workflows

Built in the brief's specified order: **AI-22 → AI-13 → AI-24 → AI-28.**

**AI-22 — Continuous reconciliation controller.** `lib/aiRuntime/reconciliation/{types.ts,
classify.ts, definitions.ts, engine.ts}` — one generic engine, 12 registered definitions (9 real +
3 `not_implemented`: `tax`, `intercompany`, `processor_settlement`, each with a stated reason).
`bank` wraps `lib/aiRuntime/workflows/ai-03-bank-reconciliation/position.ts` — extracted out of
AI-03's own `extract()` (a safe, behaviour-preserving refactor; AI-03 calls the identical function
now, so the two can never silently drift) and additively gained a real `glBalance`/`difference`
AI-03 itself never needed. `fixed_assets` wraps `computeAssetRegisterToGl()` (AI-10, Chunk 3)
verbatim, enumerated across every distinct asset account. The one structurally load-bearing piece:
`classifyReconciliationStatus()` (`classify.ts`) — `"reconciled"` is unreachable with an
`"unexplained"`-type difference in scope, or a net difference outside tolerance, regardless of
what a definition's own `run()` computed; tested directly against a synthetic difference list, not
only indirectly through a full definition run. Workflow itself
(`lib/aiRuntime/workflows/ai-22-continuous-reconciliation/index.ts`) is a thin OBSERVE wrapper: run
the engine, turn non-`reconciled`/non-`not_applicable` results into findings. 5 tests, incl. the
required bank-equals-AI-03 numeric equality assertion.

**AI-13 — Day Zero Close.** `lib/aiRuntime/closeReadiness/{classify.ts, domains.ts, compute.ts}`.
`classify.ts` is pure (no DB reads) and unit-tested against a fixture matrix — `classifyBlockerSeverity()`
per-item, `classifyReadiness()` for the tenant-wide rollup. `domains.ts` covers all 15 domains from
the brief's table; 8 of them (`bank`, `ar_finance`, `ap`, `inventory`, `prepaid`, `revenue`,
`fixed_assets`, `payroll`) wrap an AI-22 reconciliation definition via
`runReconciliationDefinition()`, never reimplemented. `accruals`/`prepaids`/`fixed_assets` each
also re-derive one workflow-specific signal (AI-07's stale-accrual/open-GRNI query, AI-08's
overdue-recognition query, AI-10's fully-depreciated-but-active query) as a lightweight, additive
query against the same models those workflows read — not a replay of their full 10-stage runs.
**Deliberately not built**: the Revenue domain's AI-09 "delivered but never billed" half, which
needs the same bounded `models/sales/**` read exception A.2 granted only to AI-09 in Chunk 3 —
AI-13 wasn't granted it here, so that half stays honestly unreplicated (`OPEN_QUESTIONS.md` #20).
`compute.ts` orchestrates: runs every domain, rolls up readiness, auto-resolves safe blockers by
emitting the owning workflow's trigger event, reads (never writes) `PeriodClosing` for the
contradiction check, and persists to `AiCloseState` upserted per `{tenantId, period}` (a read is
then a single lookup). The workflow itself is a thin OBSERVE wrapper around
`computeAndPersistCloseReadiness()`. 7 tests, incl. material-bank-difference→blocked,
data-fix-clears-it-but-a-bare-rerun-doesn't, the `PeriodClosing` contradiction, and
no-materiality→indeterminate.

**AI-24 — Close evidence controller.** `lib/aiRuntime/evidence/assertions.ts::
evaluateCloseAssertions()` — 10 pure predicates over the exact same live computation AI-13
produces (`computeCloseReadiness()`), never a parallel re-derivation; a `PeriodClosing.status`
gate table per assertion detects a contradiction (a human-implied "done" that the assertion still
fails) without ever touching `PeriodClosing` itself. The workflow
(`lib/aiRuntime/workflows/ai-24-close-evidence/index.ts`) persists each evaluation to
`AiCloseAssertion` via the new `record_close_assertion` tool (see Part A), and manages the
evidence-request lifecycle by reusing the *existing* `create_task` tool's `{tenantId, dedupeKey}`
upsert (Chunk 1's attention engine already deduped on that key — no new dedupe mechanism needed)
plus the new `resolve_task` tool once a previously-failing assertion re-evaluates to verified. 5
tests, incl. the dedupe-across-repeated-sweeps and auto-resolve-on-data-arrival requirements.

**AI-28 — Cut-off intelligence.** `lib/aiRuntime/workflows/ai-28-cutoff-intelligence/index.ts`.
Scope, recorded honestly: only the brief's highest-priority evidence row is implemented
deeply — vendor bill vs. `StockMove` receipt date, traced via `PurchaseOrder.stockMoveIds` (a
real `ObjectId` link) rather than `StockMove.sourceDocument` (a plain string). Every other
transaction type reports `evidence_unavailable` rather than assuming the posting date is correct.
RECOMMEND only, `act()` never calls a tool — cut-off is judgement, and this workflow structurally
cannot double-accrue a next-period cost since it never accrues anything in the first place. 5
tests, incl. the locked-prior-period→`current_period_adjustment`-never-back-dated case, asserted
against the real `TransactionLock`.

### Two real defects found and fixed while building this batch's tests (recorded for the pattern)

1. **`decideAutonomy()`'s OBSERVE/RECOMMEND short-circuit, naively extended to the clamped level,
   would have suppressed escalation on a policy-forced clamp.** My first implementation clamped
   the *effective requested autonomy* down to RECOMMEND before checking whether it equalled
   OBSERVE/RECOMMEND, which meant a workflow *policy-clamped* down to RECOMMEND took the same
   `escalate: false` path as a workflow that natively declared RECOMMEND (AI-04) — silently
   swallowing exactly the "this workflow wanted more but couldn't get it" signal the clamp exists
   to surface. Caught by an existing AI-02 test (`false positive: an ambiguous new vendor... gated
   model proposes nothing`) that expected `escalated` and got `no_action` once the clamp shipped.
   Fixed by checking the workflow's *own declared* level first (unconditional early return, no
   clamp involved) and only applying the clamp/escalate logic to workflows that declared something
   above RECOMMEND.
2. **AI-24 wrote `AiCloseAssertion` directly from `act()`** — a real Hard Rule 2 violation, caught
   by the pre-existing `safety.test.ts` source-grep test the moment AI-24's file existed. Fixed by
   adding `record_close_assertion` (see Part A) rather than special-casing the test.

### Test results

132 test files, 1145 tests, 0 failures, 0 regressions against the Chunk 3 baseline (1102) — 43 new
tests this chunk (5 AI-22, 7 AI-13, 5 AI-24, 5 AI-28, 12 pure classifier fixture-matrix tests
across `reconciliationClassify.test.ts`/`closeReadinessClassify.test.ts`, 2 `eventBus.test.ts`
`subscriptionFilter` tests, plus the 2 additional AI-08/AI-09/AI-10 `policy_overrides` assertions
and the 1 `safety.test.ts` clamp test from Part 0). `tsc --noEmit` clean repo-wide. `eslint` clean
on every file touched this chunk.

### API surface / UI regression

Zero new API routes: `git status` shows only files already modified by earlier chunks plus new
files under `lib/aiRuntime/`, `models/`, `tests/ai/`, `docs/ai/`, `app/api/cron/ai/` — no new
`route.ts` anywhere. `artifacts/api-surface.txt` diffs clean except `/cron/ai/runtime-sweep`
(added Chunk 1, before that baseline snapshot was captured). Zero UI files touched — no path under
`app/(dashboard)/**`/`components/**` appears anywhere in `git status` across the whole session.

### Known limitations / follow-ups (also in `OPEN_QUESTIONS.md`)

1. AI-13's Revenue domain doesn't replicate AI-09's Sales-side "delivered but never billed"
   signal — needs the same bounded `models/sales/**` read exception A.2 granted only to AI-09.
2. `ap_control`/`ar_control_finance` compare current open balances, not a `periodEnd`-accurate
   history replay. `inventory`'s GL side uses the `asset_current` bucket (no dedicated inventory
   account type exists). `suspense_clearing` matches accounts by name.
3. AP domain's "unmatched bills from AI-06" sub-check not built — AI-06 doesn't exist yet.
4. `report.refreshed` (named in the brief as arriving this batch) was not wired to anything — no
   real "report" event source exists anywhere in this codebase yet.
5. `period.horizon.reached` is emitted unconditionally every sweep, not gated to an actual
   approaching period boundary — no close-calendar-awareness exists to gate it on.
6. AI-28 only implements the vendor-bill/goods-received evidence row deeply; every other
   transaction type reports `evidence_unavailable`.
7. `resolve_task` and `record_close_assertion` are two new write tools beyond A.3's registered
   list — both reasoned exceptions, flagged for confirmation in `OPEN_QUESTIONS.md` #19.

### Commit

Not committed — awaiting instruction, same posture as every prior chunk.

---

## Chunk 3 — Batch B: Schedules (Task 0 + AI-08, AI-10, AI-07, AI-09), 2026-09-01, branch `ai/workflows`

> **Integrity note (found while writing Chunk 4's entry, 2026-09-02)**: this chunk's own
> "## Chunk 3" heading was missing from the file — the body below was intact, but nothing marked
> where it began. Restored here; no content was lost, only this heading line.

### Part 0 carry-forward

**0.1 — AI-04 receipt extraction**: case **(a)** — policy checking and duplicate detection over
*existing* `Expense` records only; receipt OCR/extraction and drafting deliberately deferred, not
blocked by anything in the code. `OPEN_QUESTIONS.md` #14 records what remains; picked up in Chunk
8 alongside AI-19/AI-27 (same `docIntel` module).

**0.2 — `taxIds` vestigial finding propagated**: `GLOSSARY.md` now records
`Invoice.invoiceLines[].taxIds` as always `[]` on every real create path — every Batch B workflow
that touches an invoice line follows AI-01's precedent (tax rate is proposal metadata, never a
written field).

**0.3 — OPEN_QUESTIONS.md scanned for blockers**: none found blocking. The missing-dimensions gap
and the `models/legacy/ApprovalRequest.ts` question (both flagged as possibly relevant) are
real but neither AI-07/08/09/10 needed a GL dimension or an approval-request write this batch.
`OPEN_QUESTIONS.md` #7 (no service-principal for pure-sweep triggers) directly recurred here —
every `ai.sweep.hourly`/`schedule.due` run with no `actingUserId` is structurally capped at
RECOMMEND by the same honest mechanism AI-03 already established, not a new gap.

### Task 0 — the recurring schedule engine

**`models/ai/AiSchedule.ts`**: `scheduleType: prepaid|deferred_revenue|depreciation|
accrual_reversal`, `status: draft|approved|suspended|completed|cancelled`, `periods[]` each with
their own `status: pending|drafted|posted|skipped`. Four invariants, each with its own unit test
in `tests/ai/aiRuntime/scheduleMath.test.ts`: (1) periods sum exactly to `totalAmount`, rounding
remainder in the final period; (2) part-period arithmetic is real day-count proration on actual
calendar month/quarter/year boundaries — a 12-month policy starting the 17th produces 13 periods,
not 12 (a calendar-alignment bug in my own first implementation, caught by this exact test, fixed
before it reached any workflow); (3) `recognisedToDate + remaining === totalAmount` always; (4) a
`periodKey` posts exactly once via a real compound-unique-index compare-and-swap
(`AiSchedule.findOneAndUpdate` filtered on the period's current status), not application logic.

**`lib/aiRuntime/schedules/scheduleMath.ts`**: `buildPeriods()` (equal day-count division of a
known total — prepaid/deferred/revenue-recognition's shape) and `buildDepreciationPeriods()`
(fixed monthly rate held constant, first period day-count pro-rated — depreciation's shape,
matching `computeMonthlyDepreciation()`'s existing formula exactly rather than reimplementing it).

**The runner**: extended the existing `app/api/cron/ai/runtime-sweep` route (no second cron
entry) to emit `schedule.due` for every `approved` `AiSchedule` past its `nextRunDate`.

**Tools** (`lib/aiRuntime/tools/scheduleReadTools.ts` / `scheduleWriteTools.ts`):
`get_purchase_order`, `get_stock_moves`, `get_asset`, `get_sale_order`, `get_sales_invoice`,
`get_schedule`, `run_depreciation_compute` (read/analyse); `draft_prepaid_schedule`,
`draft_accrual`, `draft_asset`, `draft_depreciation_schedule`, `link_schedule_draft` (DRAFT/
CONTROLLED_AUTONOMOUS write); `post_journal` (CONTROLLED_AUTONOMOUS, the single highest-risk tool
this batch — refuses anything not from an `approved` `AiSchedule`, refuses a period already
posted via the compare-and-swap, checks the real period lock, delegates balance/category
validation to the existing engines).

**`AiMaterialityPolicy`** (`models/ai/AiMaterialityPolicy.ts`): per-tenant, per-action-class
`{absoluteAmount, percentOfBalance}`, seeded empty — absent means every workflow that needs it
drops to RECOMMEND and says so, never an invented number, same precedent as `AiExpensePolicy`.

**`AiWorkflowPolicy.autoPostSchedules`** (new field, default `false`): narrowly scoped to whether
a due schedule period may reach `post_journal` (CONTROLLED_AUTONOMOUS) instead of
`draft_journal`+`link_schedule_draft` (DRAFT). AI-09 ignores this flag entirely and always drafts
— "nothing about revenue recognition auto-posts" per its spec, an intentional per-workflow
override of the generic policy.

**`lib/accounting/depreciation.ts::computeMonthlyDepreciation()`**: extracted the exact formula
`app/api/finance/assets/compute/route.ts` already used into a shared function, and had that
existing route call it too — a safe, behaviour-preserving refactor (both paths now guaranteed to
agree by construction), not a parallel reimplementation.

**`lib/accounting/registerToGl.ts::computeAssetRegisterToGl()`**: the fixed-asset register↔GL
control-account tie-out, built as a reusable function per the brief's explicit note that AI-22
(Chunk 4) will consume it — compares `Asset.originalValue` totals minus `AiSchedule`-tracked
accumulated depreciation (the register's own numbers) against the actual GL balance of the asset
account (from posted `JournalEntry` lines), independent of each other.

### AI-08 — Prepaid / deferred schedule intelligence

First consumer of the schedule engine, proves it. Two trigger modes: `bill.created`/
`invoice.created` (detect — stated explicit date-range vs. inferred keyword-only service period;
only `stated` can reach DRAFT, `inferred` is always RECOMMEND by construction, never by a
confidence-tuning accident) and `schedule.due` (execute — draft or post each due period).
Extended, not created: none (fully new workflow). 8 tests incl. one fx_unsupported case.

### AI-10 — Fixed asset intelligence

"Three additions to a working feature, not a rebuild." Capital-candidate detection is
RECOMMEND-only — asset creation never auto-writes, "capital vs expense is judgement" per spec.
Depreciation-schedule creation triggers off a new `asset.created` event (one-line
`safeEmitEvent` added to `app/api/finance/assets/route.ts`'s POST handler, same established
pattern as every other Batch A/B trigger wiring) once a human has posted the asset —
CONTROLLED_AUTONOMOUS, mechanical at that point. Register-to-GL tie-out runs after every
depreciation run and surfaces any difference as a finding. 8 tests incl. a seeded 1-unit
difference and one fx_unsupported case.

### AI-07 — Accrual intelligence

GRNI (`PurchaseOrder.orderLines[].receivedQty > billedQty`) built and proven first, exactly as the
brief asked — deterministic, zero LLM calls, DRAFT-eligible below materiality. Over-billed lines
raised as exceptions, never accrued. Reversal reuses the schedule engine (`accrual_reversal`
type, exactly one period) via a new `schedule.due` handler. Accuracy tracking wired on
`bill.created`: when a new bill matches a PO this workflow previously accrued for, the delta is
recorded into the shared learning store (`lib/aiRuntime/learning/learningStore.ts`). Recurring-
vendor pattern-matching (spec algorithm step 2) **not built** — no 12–24-period statistical
baseline exists anywhere in this codebase to build it on honestly (documented in this workflow's
own module doc comment; the effect is conservative by construction, satisfying the "new vendor,
no history → never drafted" test). 6 tests.

### AI-09 — Revenue recognition intelligence

Built last, per the brief. **A.2 investigation answered**: `SaleOrder.revenueRecognition.
recognizedAt`/`.recognizedBy` are set in exactly one place — `app/api/sales/sale-orders/[id]/
route.ts`, on a human `q2cStatus` transition, not derived from any engine. `.amount`/`.method` are
never written anywhere; vestigial. Reads `SaleOrder`/`SalesInvoice`/`Customer` freely (A.2's
bounded exception), writes only Finance-side journals — proven by a source-grep structural test
mirroring `safety.test.ts`'s own style. Four independent divergence checks (deferred revenue,
unbilled/accrued revenue, revenue leakage — loud, customer-named, "the finding most likely to pay
for the whole project" per spec — and fulfilment gap), so a fully delivered/billed/recognised
order trips none of them. Milestone basis never auto-anything — no milestone-tracking data exists
anywhere to infer one, so a human-stated `method: "milestone"` order stays report-only by
construction. DRAFT always this batch; nothing auto-posts, overriding `autoPostSchedules`
unconditionally. 7 tests.

### Two real bugs found and fixed while building/testing this batch (recorded for the pattern)

1. **`schedule.due` fans out to every workflow registered on that eventKey** — AI-07/08/09/10 all
   are. Without an ownership check, all four would process every due schedule regardless of who
   created it; the tool layer's own compare-and-swap would have stopped actual double-posting
   (defense-in-depth working), but three workflows would still race for, and record unwanted runs
   against, a schedule that isn't theirs. Fixed with an explicit `scheduleType`/`sourceRef.model`
   ownership check at the top of each workflow's `schedule.due` extract path. Found by this
   batch's own tests, not by inspection. Full write-up: `OPEN_QUESTIONS.md` #15.
2. **`smart-rules.ts`'s expense/income semantic check doesn't recognise an asset/liability
   drawdown as a valid offset** — every schedule-period posting this batch (prepaid amortisation,
   depreciation, deferred-revenue recognition) is exactly that pairing by accounting nature, and
   the existing manual asset-compute route never hit this check at all (bypasses
   `applySemanticRulesAndClassify` entirely), so the same operation a human could already post was
   newly, silently blocked for the AI's version of it. Fixed by passing the already-existing
   `allowNonStandard`/`overrideReason` escape hatch on every schedule-posting `draft_journal`/
   `post_journal` call — the semantic engine still runs and still stamps an audited
   `semanticOverride`, never bypassed silently. Full write-up: `OPEN_QUESTIONS.md` #17. A related,
   narrower type-level issue (`SalesInvoice`'s ambiguous `Model` export breaking `.find()`'s
   overload resolution — the first code anywhere to call it) is `OPEN_QUESTIONS.md` #18.
3. Two workflow-authoring bugs caught by tests, not review: AI-08's/AI-10's/AI-07's/AI-09's
   `schedule.due` `act()` branches originally called write tools without checking
   `decision.autonomyApplied` first — relying only on `callTool()`'s own per-tool
   `maxAutonomyLevel` ceiling, which (confirmed by reading `registry.ts`) never consults the run's
   actual gate decision. A failed gate (kill switch off, no acting user) would still have let
   `draft_journal`/`post_journal` through. Fixed by adding the same explicit
   `decision.autonomyApplied === RECOMMEND` early-return AI-02/AI-03 already used, to all four
   `schedule.due`-triggered branches.

### Test results

126 test files, 1102 tests, 0 failures, 0 regressions against the Chunk 2 baseline (1073) — 29 new
tests this chunk (8 AI-08, 8 AI-10, 6 AI-07, 7 AI-09, incl. two fx_unsupported tests added after
noticing AI-08/AI-10 both read a real `Invoice.currencyId` field the fx check needed to cover).
`tsc --noEmit` clean repo-wide. `eslint` clean on every file touched this chunk.

### API surface / UI regression

Zero new API routes: `git status` shows only existing files modified (`app/api/finance/assets/
route.ts`, `.../compute/route.ts`) plus new files under `lib/aiRuntime/`, `models/ai/`,
`tests/ai/`, `docs/ai/` — no new `route.ts` anywhere. `artifacts/api-surface.txt` diffs clean
except `/cron/ai/runtime-sweep`, which was added in Chunk 1 (before that baseline snapshot was
captured), not this chunk. Zero UI files touched (`git status` confirms no path under
`app/(dashboard)/**`/`components/**` changed) — the Playwright UI-regression scan itself wasn't
re-run live (needs a running dev server, not up in this sandbox), but the file-level diff is
conclusive given nothing UI-facing changed.

### Known limitations / follow-ups (also in `OPEN_QUESTIONS.md`)

1. Recurring-vendor pattern-matching accrual detection (AI-07 algorithm step 2) not built — no
   statistical baseline to build it on honestly.
2. `AiWorkflowPolicy.maxAutonomyLevel` is stored but never consulted by the gate (`OPEN_QUESTIONS.md`
   #16) — a Chunk 1 foundation gap this batch's testing surfaced, not fixed here (blast radius
   spans every already-shipped workflow).
3. `smart-rules.ts`'s expense/income rule itself not widened to recognise asset/liability offsets
   as standard (only overridable) — a policy-engine change outside this batch's scope.
4. AI-09's "delivered" signal is a boolean (`shipmentStatus: fulfilled`), not a partial quantity —
   a `partially_shipped` order reports zero delivered rather than an invented fraction, honest but
   coarse; a future chunk with real fulfilment-quantity data could sharpen this.

### Commit

Not committed — awaiting instruction, same as Chunk 2's stated posture.

---

## Chunk 2 — Batch A: Accounting Core (Task 0 + AI-01, AI-02, AI-03, AI-04), 2026-09-01, branch `ai/workflows`

Built in the brief's specified order: **Task 0 → AI-02 → AI-01 → AI-03 → AI-04.**

### Task 0 — Foundation hardening

**A.3, persistent idempotency**: `models/ai/AiToolCall.ts` (compound unique index
`{tenantId, toolName, idempotencyKey}` — the lock itself) + `lib/aiRuntime/tools/registry.ts`
rewritten so every DRAFT/EXECUTE tool call with an `idempotencyKey` goes through
`callWithPersistentIdempotency()`: insert `in_flight` first, duplicate-key → read the existing
row (`succeeded` → replay; `failed` → reclaim and retry once; still-`in_flight` and not timed
out → `ToolCallInProgressError`). The Chunk 1 in-memory `Map` stays as a same-process fast path
in front of it. 3 new tests prove durability across a simulated "fresh process" (registry
cleared, DB row still replays) and reject a genuinely concurrent in-flight call.

**A.2, real `check_permission` routing**: `lib/aiRuntime/tools/rbacRouter.ts` — `module: "crm"`
routes to the real `lib/crm/rbac.ts::hasPermission`; every other known module (finance, sales,
inventory, manufacturing, hr, admin, master-admin) checks the acting user's role against the
exact same allow-list `middleware.ts` already enforces (no finer permission layer exists
underneath it — confirmed in `SYSTEM_INVENTORY.md` — so this wraps the real authorization
boundary rather than inventing a new one). An unmapped module denies by default. 11 new tests.
**Also added, beyond A.2's literal ask**: `callTool()` itself now structurally enforces this
check for every DRAFT/EXECUTE tool (previously only `check_permission`-as-a-tool existed;
nothing forced a workflow to actually call it) — a real gap caught by testing, fixed the same
way the Chunk 1 NEVER_AUTONOMOUS fail-closed bug was. 2 new tests (denied-by-default with no
user/no module; allowed-through with a real authorized user).

**A.4, LLM helper**: `lib/aiRuntime/llm/reasonHelper.ts::callLlmForReasoning()` wraps
`lib/ai/tenantAi.ts::callClaudeForTenant()` (Azure OpenAI despite the naming — see
`GLOSSARY.md`), returns a typed `{gated:true,...}` or `{gated:false, proposal, confidence,
reasons, rawText}`, and turns a parse failure into a zero-confidence outcome rather than a
crash. Narrows on `"text" in result`, not `!result.gated` — matching `lib/docIntel/extractor.ts`'s
own documented pattern for this codebase's `strictNullChecks:false` setting.

**Tool registrations (Part C)**: `lib/aiRuntime/tools/financeReadTools.ts` (`get_invoice`,
`get_vendor`, `get_ledger`, `get_journal`, `get_bank_transactions`, `get_period_status`,
`get_source_document`, `get_chart_of_accounts`, `run_duplicate_scan`) and
`lib/aiRuntime/tools/financeWriteTools.ts` (`draft_bill` wraps `billCreate.ts::createDraftBill`
unchanged; `draft_journal` delegates to `journal-validation.ts` + `smart-rules.ts`, veto →
`SmartRulesVetoError`; `set_draft_account` refuses non-draft records; `reconcile_transaction`
mirrors the real manual reconcile route's exact logic including its `assertTransactionNotLocked`
call site, and additionally populates the previously-unused `BankReconciliation` model;
`link_evidence` extended with an optional `markStatus` so an auto-draft can reach the same
terminal `CONFIRMED` state a human confirm would; `create_task` wraps the attention engine).
`post_journal`, `draft_payment`, `allocate_receipt`, `send_reminder`, `submit_filing`,
`place_payment_hold` intentionally **not** registered — nothing in this batch needs them.

**Event emission (B.2)**: `document.received` (extract route, plus a SHA-256 `fileHash` computed
at the only point raw bytes exist — additive `ExtractedDocument.fileHash` field),
`bill.created` (`billCreate.ts`), `invoice.created` (`app/api/finance/invoices/route.ts`),
`bank.transaction.imported` (`app/api/finance/bank/import/route.ts`), `expense.submitted`
(`app/api/finance/expenses/route.ts`), `journal.posted` (`lib/accounting/posting.ts::
createJournalEntry`, only when `voucherStatus === POSTED`), and `ai.sweep.hourly` (added to the
existing `app/api/cron/ai/runtime-sweep` route, iterating active `Organization`s the same way
`business-health`'s cron does). **Every one of these events carries the real, authenticated
`actingUserId`** (the uploader/creator/importer — a genuine human action in every case except
`ai.sweep.hourly`, the one truly autonomous trigger this batch adds) — see
`docs/ai/OPEN_QUESTIONS.md` #7 for why that distinction turned out to matter.

**A real regression found and fixed while wiring these**: a static top-of-file
`import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap"` in `lib/accounting/posting.ts`
transitively imports `lib/db.ts`, which throws at MODULE LOAD time if `MONGODB_URI` is unset —
breaking 5 pre-existing test files that import `posting.ts` without a DB connection (confirmed:
118→121 full-suite files went from all-green to 5 failing, then back to all-green). Fixed with
`lib/aiRuntime/runtime/safeEmit.ts` — a dependency-light wrapper with zero heavy imports at its
own top level, dynamically importing the real runtime only inside its function body, wrapped in
a try/catch that swallows *any* failure (including a broken/unconfigured runtime, not just an
in-runtime error) — a strictly stronger guarantee than `eventBus.ts`'s own internal dispatch
try/catch alone provided. All 6 call sites use this one wrapper now.

### AI-02 — Ledger classification (built first, per the brief's reordering)

`lib/aiRuntime/workflows/ai-02-ledger-classification/bankingRuleEngine.ts` — the first-ever
interpreter for `BankingRule.criteria`/`criteriaMatch` (confirmed in `CAPABILITY_MAP.md`: the
model existed, nothing ever applied it). Recognizes a fixed, documented operator set
case-insensitively; unrecognized operators fail safe (never a false match). No priority field on
the model — evaluates in `createdAt` order (documented limitation, not a schema change).

`index.ts`: classifies one subject per run (an `Invoice`'s first line, or an `Expense`'s
account — full per-line classification is a documented simplification). Order: BankingRule
(zero LLM calls, proven by a mock-spy test) → vendor/category history (≥3 occurrences, ≥70%
share) → model, **constrained to a pre-filtered `get_chart_of_accounts(excludeControlAccounts:
true)` candidate set** — a control/inactive/non-postable account is structurally impossible to
select, not just checked after the fact. `EXECUTE` only for a draft record, with a real acting
user and a validated (`killSwitchEnabled: true`) `AiWorkflowPolicy` — both required, both tested
independently. 8 tests.

### AI-01 — Document ingestion & accounting extraction

**Extends, does not duplicate** `lib/docIntel/` (Part 9 item 1's exact failure mode) —
`extractor.ts`/`textExtract.ts`/`extractionSchemas.ts` untouched; this workflow reacts to
`document.received`, adds context/history/the gate/the decision trace, and calls the *same*
`createDraftBill` via the `draft_bill` tool. The existing manual upload→confirm flow is
byte-identical and still works (tested directly).

Escalates (never drafts) on: wrong `docType` (only `vendor_bill` in scope), duplicate (extended
`run_duplicate_scan` with file-hash + PO-reference, without changing `duplicateCheck.ts`'s
existing exact/near-exact behaviour for its existing callers), arithmetic mismatch, non-INR
(no FX rate source exists anywhere — `GLOSSARY.md` — never guessed at), unknown vendor
(resolved against `models/admin/Vendor.ts` per A.1, **never auto-created** — AI-19's job), and
tax-amount-vs-best-matching-`TaxRate` disagreement. **Real finding**:
`Invoice.invoiceLines[].taxIds: number[]` is vestigial — always `[]` in every real create path,
disconnected from `TaxRate` entirely — so "select a TaxRate" is proposal/evidence metadata, not
a field this workflow writes (`OPEN_QUESTIONS.md`). 9 tests, including the byte-identical manual
flow check and a same-document replay test.

### AI-03 — Bank reconciliation

New matcher (`lib/aiRuntime/workflows/ai-03-bank-reconciliation/matcher.ts`), deliberately
separate from `lib/accounting/matching.ts` (PO↔invoice, different scope, per A.1). Real ledger
candidates come from posted `JournalEntry` lines via `BankStatement.header.journalId → Account`
(confirmed the actual link in this schema) — not `Invoice` directly, since real payments are
recorded as posted journal entries. Pass 1 (exact, date+amount window) is the sole `EXECUTE`-
eligible path; Pass 2 (fuzzy, >1 candidate) and Pass 3 (keyword/cross-account classification into
bank_fee/interest/internal_transfer/`unknown_ar_side`/unknown) are **unconditionally**
`RECOMMEND`-shaped per A.5, independent of the run's overall gate outcome for the exact-match
subset — required a hybrid gate design (the run-level decision governs only Pass 1; Pass 2/3
always propose/draft-and-escalate regardless). A `Customer`-tagged line with no Finance-side
explanation is `unknown_ar_side` (A.1's Sales-module scope boundary), never guessed. Fee/interest
lines get a real 2-line `draft_journal` (bank leg + a looked-up placeholder expense account —
AI-03 doesn't own account classification, that's AI-02), never posted. 9 tests: exact match with
a real user, no-user-no-auto-reconcile, cross-tenant false positive, fuzzy-never-auto-applied,
internal transfer, `unknown_ar_side`, fee drafting, locked-period refusal (via the real
`TransactionLock`), and no-double-reconcile on a sweep re-run.

**A real bug found and fixed here**: `AiWorkflowRun`'s `{workflowId, triggerEventId}` unique
index was `sparse`, which only excludes genuinely *absent* fields — Mongoose writes an explicit
`null` for an unset ObjectId path, which a sparse index does **not** exclude. Two direct
(no-event-id) invocations of the same workflow collided. Fixed with a `partialFilterExpression:
{triggerEventId: {$type: "objectId"}}` instead — correct regardless of serialization quirks.
Regression test added to Chunk 1's own `executor.test.ts`.

**Also found and fixed while testing this workflow's multi-line nature**: the executor was
silently **doubling every finding** (`[...reasoned.findings, ...actResult.findings]` assumed
`act()` adds new findings on top of `reason()`'s, but AI-01/02/03 all passed `reasoned.findings`
straight through for convenience) — fixed by having every `act()` return `findings: []`.
Separately, escalation only fired when the *whole run's* status was `escalated`, silently
dropping review-worthy findings from a run that also completed something else (exactly AI-03's
shape: some lines exact-matched, others still need a human) — fixed to escalate per qualifying
finding (`EXCEPTION` type, or `PROPOSAL` below the workflow's confidence threshold) independent
of the overall run status. Neither bug had a regression test before AI-03's real multi-subject,
findings-pass-through code surfaced both — Chunk 1's AI-00-SMOKE (one trivial finding,
`findings:[]` in `act()`) was structurally incapable of catching either class of bug. Both fixes
verified against all of AI-00/01/02's existing tests (no regressions) before AI-03's own tests
were written.

### AI-04 — Expense intelligence

Fully deterministic — **zero LLM calls** (account classification for expense lines is already
covered by AI-02, which also subscribes to `expense.submitted`; not duplicated). New, additive
`models/ai/AiExpensePolicy.ts`, seeded empty by design: an absent/unconfigured policy means
`policy_configured: false` and **zero invented violations** — the single most emphasized
guarantee in this workflow (a false positive here is worse than any other failure mode in this
batch, per the brief). Checks: category limit, prohibited category (both only when a policy is
configured), and duplicate-claim (same employee + amount ±0.01 + within 1 day — runs regardless
of policy configuration, since it's a data-integrity check, not a policy rule). Two real gaps
recorded, not built around: no corporate-card feed model exists anywhere to match against, and
`Expense` has no receipt-attachment field to check a "missing receipt" threshold against
(`OPEN_QUESTIONS.md` #9). `DOC_INTEL_TYPE.RECEIPT` + `ReceiptExtraction` + `coerceReceipt` +
`parseReceiptExtraction` added additively to `extractionSchemas.ts` (same pattern as
`vendor_bill`, independently unit-testable) but not wired into `extractor.ts`'s typed pipeline —
this batch reacts to an already-created `Expense`, not a receipt upload (`OPEN_QUESTIONS.md` #10).
6 tests, headlined by the "no policy configured → pass, nothing invented" case.

### Test results

126 new tests across this chunk (11 tool/runtime-hardening tests + 8 AI-02 + 9 AI-01 + 9 AI-03 +
6 AI-04, plus the executor regression test and a handful of registry structural-gate tests —
32 net new AI-runtime test files' worth landed at **121 files / 1069 tests, full suite, 100%
green**, zero regressions against Chunk 1's baseline (118 files / 1044 tests before this chunk's
work began). `npx tsc --noEmit` and `eslint` clean throughout.

### API surface / UI regression

Exactly the same one new route as Chunk 1 (`/api/cron/ai/runtime-sweep`) — no new routes added
this chunk; every change to an existing route file is a small additive `safeEmitEvent(...)` call
plus (for the extract route) a `fileHash` computation, none changing existing response shape or
status codes (tested directly for the document-intelligence flow). No UI file was touched.

### Kill-switch flag names

`AiWorkflowPolicy` rows keyed `{tenantId, workflowId}` for `AI-01`, `AI-02`, `AI-03`, `AI-04` —
same fail-closed-by-default-missing-row semantics as Chunk 1's `AI-00-SMOKE`.

### Commit

Per Hard Rule "one workflow per branch, one workflow per PR": this chunk's Task 0 plus the four
workflows are being tracked as this session's single work-in-progress on `ai/workflows` pending
the user's instruction on branching/PR granularity — flagged, not assumed.

## Chunk 1 — Foundation (Phase 0 discovery + Phase 1 runtime), 2026-08-31, branch `ai/workflows`

### What existed before this chunk

Nothing AI-runtime-shaped. Full inventory in `docs/ai/SYSTEM_INVENTORY.md` and
`docs/ai/CAPABILITY_MAP.md`. Headline findings that shaped every design decision below:

- **No internal domain-event bus anywhere** (repo-wide grep for `EventEmitter`/`.emit(`/
  `eventBus`/`domainEvent` — zero server-side hits). Aupulens Studio (`lib/studio/`) has a
  structurally similar `dispatchEvent()` but it's called from exactly one manual test route in
  the whole codebase — unused in production, no retries/DLQ/idempotency, no reasoning/validation
  stages. Not extended; new infrastructure built instead (reasoning documented in
  `docs/ai/FOUNDATION-plan.md`).
- **A real, working document-intelligence feature already exists** (`lib/docIntel/`) — vendor-
  bill extraction, LLM-backed (Azure OpenAI GPT-4o via `lib/ai/claude.ts`, name kept for
  stability post-migration), duplicate detection, draft-only bill creation. Directly relevant to
  three future workflows (AI-01, AI-19, AI-27) — flagged in `CAPABILITY_MAP.md` so those chunks
  extend it, not duplicate it.
- **A real, already-enforced period lock exists** (`lib/accounting/transactionLock.ts::
  assertTransactionNotLocked`, called inline from journal/bill/invoice/bank-reconcile routes) —
  wrapped, not reimplemented, by the new `check_period_lock` tool.
- **A real propose→confirm→execute pattern already exists** (`AiActionProposal`/
  `AiCommandProposal` + `lib/accounting/aiActions.ts`'s 7-action switch) — the precedent the new,
  more general tool registry generalizes, not replaces.
- No generic materiality/confidence-threshold/autonomy concept existed anywhere.

### What was built

**Namespace**: `lib/aiRuntime/` (new — distinct from the pre-existing, unrelated `lib/ai/`).
Models added to the existing `models/ai/` folder.

```
lib/aiRuntime/
  runtime/{eventBus,executor,registry,killSwitch}.ts
  context/contextService.ts
  policy/{autonomyGate,constants}.ts
  tools/{registry,control}.ts
  workflows/{types.ts, ai-00-smoke/index.ts}
  learning/learningStore.ts
  attention/attentionEngine.ts
  audit/auditTrace.ts
  contracts/outputContract.ts
  bootstrap.ts

models/ai/{AiEvent,AiWorkflowRun,AiDecisionTrace,AiAttentionItem,AiLearningRecord,AiWorkflowPolicy}.ts

app/api/cron/ai/runtime-sweep/route.ts   (new cron entry added to vercel.json, hourly)

lib/constants/statuses.ts   — additive: AI_AUTONOMY_LEVEL, AI_RUN_STATUS, AI_EVENT_STATUS,
                               AI_FINDING_TYPE, AI_FINDING_SEVERITY, AI_ATTENTION_PRIORITY,
                               AI_ATTENTION_STATUS, AI_LEARNING_OUTCOME, AI_TOOL_SIDE_EFFECT
```

The fixed 10-stage pipeline (Part 2.1) is enforced by `lib/aiRuntime/runtime/executor.ts` —
`context`, `learn`, `explain` are generic (run for every workflow, not overridable);
`observe`/`extract`/`reason`/`validate`/`act`/`verify` are the workflow's own hooks, always
called in that order. `AI-00-SMOKE` (`lib/aiRuntime/workflows/ai-00-smoke/`) is the trivial demo
workflow required by the Build Order Phase 1 gate — proves all 10 stages run, produce the exact
Part 2.9 envelope, and write a complete `AiDecisionTrace`.

The decision gate (Part 2.3) is one function, `decideAutonomy()` — not reimplemented per
workflow. NEVER_AUTONOMOUS action classes (`lib/aiRuntime/policy/constants.ts`, matching Hard
Rule 4 verbatim) are checked first and are not tenant-configurable.

**A real bug was found and fixed during this chunk's own test-writing**, not left for later:
the executor originally called `workflow.act()` unconditionally whenever deterministic
validation passed, without checking `decision.allowed` first — meaning a NEVER_AUTONOMOUS
action class would still reach `act()` (the gate would correctly mark it `allowed: false`, but
nothing structurally stopped `act()` from running anyway; only a well-behaved workflow checking
`decision.allowed` itself would have caught it). This directly violated Hard Rule 4's "the tool
call must fail closed" instruction. Fixed: the executor now skips `act()`/`verify()` entirely
when `decision.allowed` is false, going straight to escalation. Caught by
`tests/ai/aiRuntime/safety.test.ts`'s "NEVER_AUTONOMOUS action classes never reach act()" test,
which asserts a boolean flag inside a deliberately-malicious test workflow's `act()` was never
set to true — this test would have failed loudly before the fix and passes now.

### Tool registry

Generic mechanism complete (`lib/aiRuntime/tools/registry.ts`: `registerTool`/`callTool`,
autonomy-ceiling enforcement, in-memory idempotency-key cache — see `OPEN_QUESTIONS.md` #4 for
its persistence limitation). Only the five Control tools are populated in this chunk
(`check_permission`, `check_policy`, `check_materiality`, `check_period_lock`, `check_sod`) —
`check_period_lock` genuinely wraps the real `assertTransactionNotLocked` (verified by a test
that creates a real `TransactionLock` and confirms the tool blocks on it). `check_permission` is
a structural placeholder pending real per-module RBAC wiring — see `OPEN_QUESTIONS.md` #2. Every
Read/Analyse/Draft/Execute tool from the brief's Part 2.4 table is intentionally **not**
registered yet — populated incrementally by whichever future chunk's workflow first needs it,
per the brief's own Chunk 1 instruction not to fabricate empty stubs.

### Event bus

No persistent worker exists (Vercel Cron only, confirmed in `SYSTEM_INVENTORY.md`), so
`emitEvent()` persists an `AiEvent` outbox row and attempts inline, synchronous, best-effort
dispatch in the same request — never throwing back to the caller. `app/api/cron/ai/
runtime-sweep` (hourly, added to `vercel.json`, same `CRON_SECRET` bearer-check shape as every
other cron route) drains anything left pending/failed, up to a retry cap, then dead-letters it.

### Kill switch

`AiWorkflowPolicy.killSwitchEnabled`, default `false` (fail closed, matching Hard Rule 6's
explicit "default OFF in production until validated"). A missing policy row is treated
identically to an explicit `false`. This is deliberately separate from the pre-existing
`Organization.settings.ai.disabled` tenant-wide chat toggle — see `GLOSSARY.md` and
`OPEN_QUESTIONS.md` #6.

### Tests added (43 tests, 7 files, all green)

`tests/ai/aiRuntime/{autonomyGate,toolRegistry,executor,eventBus,attentionEngine,learningStore,
safety}.test.ts`. All use the local-MongoDB-override pattern documented in
`BASELINE_FAILURES.md` (`process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_
<name>"` set before any static import that reaches `connectDB()`, with app-code imports done via
`await import(...)` inside `beforeAll` to respect ESM import hoisting — the same pattern already
used by every existing route test in this repo, e.g. `tests/accounting/ai-actions.route.test.ts`).
No model calls anywhere (`AI-00-SMOKE`'s `reason()` stage is a deterministic fixture, per Hard
Rule "Model calls are mocked in tests").

Coverage against the Chunk 1 checklist: contract test (exact Part 2.9 envelope shape), full
audit-trace test, learning-loop round-trip, idempotency test (same trigger event twice → one
run), replay test, policy tests (every `NEVER_AUTONOMOUS` action class rejected; a real
`TransactionLock` genuinely blocks a tool call), a forced-failure test (a run that throws
mid-pipeline still writes a finalized, failed `AiDecisionTrace` — Hard Rule 7's "no exceptions"),
and a static source-grep test (`lib/aiRuntime/workflows/**` contains zero direct ORM write
calls).

### Test results

Full suite: **116/116 files passed, 1021/1021 tests passed** (109 pre-existing files/978
pre-existing tests + this chunk's 7 files/43 tests). See `BASELINE_FAILURES.md`'s addendum for
why this is materially better than the originally-recorded baseline (mongod availability in this
sandbox, not a code fix) — the headline fact is **zero new failures, zero regressions**.
`npx tsc --noEmit` clean across the whole project.

### API surface diff

Exactly one new route: `POST/GET /api/cron/ai/runtime-sweep`. Diffed against
`artifacts/api-surface.txt` (the Phase 0 baseline) — no existing route changed, removed, or had
its behavior touched.

### UI regression

No UI was touched in this chunk (pure backend runtime + one non-UI demo workflow). A reusable
scanner (`scripts/ui-regression-scan.ts`, Playwright-based, read-only, skips dynamic `[id]`
routes, screenshots only on failure) was built as required Phase 0 infrastructure and used to
capture the baseline snapshot at `artifacts/ui-baseline/` — see that directory's `SUMMARY.md` for
the per-route baseline results. This chunk's own diff against that baseline is trivially zero
(no UI files were modified), but the baseline now exists for every future chunk that does touch
UI to diff against.

### Kill-switch flag names

`AiWorkflowPolicy` document, keyed `{tenantId, workflowId: "AI-00-SMOKE"}` — no row seeded by
default (fail-closed via missing-row handling in `lib/aiRuntime/runtime/killSwitch.ts`).

### Known limitations / follow-ups (also in `OPEN_QUESTIONS.md`)

1. `check_permission` tool has no real RBAC behind it yet — placeholder only.
2. Tool-call idempotency cache is process-scoped (in-memory), not persistent across serverless
   instances — narrow exposure (same-run double-call only; cross-run replay safety is already
   guaranteed at the `AiWorkflowRun` level).
3. AI-11 and AI-17's business specs are still not delivered — `CAPABILITY_MAP.md` rows for them
   are necessarily incomplete.
4. `models/legacy/ApprovalRequest.ts`'s "is it real for non-CRM use" question is unresolved
   (out of scope for this chunk — nothing here needed it).

### Commit

One commit for this chunk (Foundation + Phase 0 discovery), on branch `ai/workflows`, per Hard
Rule "one workflow per branch, one workflow per PR" — Chunk 1 has no AI-XX workflow of its own
(it's the shared runtime + the non-production `AI-00-SMOKE` demo required by the Build Order
gate), so it is treated as its own atomic unit rather than folded into Chunk 2.
