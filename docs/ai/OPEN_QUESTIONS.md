# OPEN_QUESTIONS.md — decisions that need a human, not a guess

Per Part 0.5: "Do not guess on anything that touches money, tax, or the ledger... raise an entry
here with the exact decision needed... continue to the next workflow." Entries below are grouped
by chunk. None of them blocked Chunk 1 — each was resolved with the safest available default
(fail closed / propose-only) and is flagged here for confirmation, not silently assumed.

---

## Chunk 1 (Foundation)

### 1. "Kill switch == off" phrasing (Part 2.3) is ambiguous on its own

The brief's gate checklist says a passing check is `kill_switch == off`. Read literally and
naively, that would mean the gate passes when the switch is OFF — i.e., autonomous action is
allowed by default and something has to be actively "killed" (switched on) to block it. That
reading directly contradicts Hard Rule 6: "a kill switch (config flag, **default OFF in
production until validated**)" — which only makes sense if OFF is the *safe/blocked* default and
an operator turns it ON once validated.

**Decision made**: implemented `AiWorkflowPolicy.killSwitchEnabled: boolean`, default `false`,
where `false` = blocked (matches Hard Rule 6's stated default) and `true` = validated/enabled.
The gate check is named `kill_switch_enabled` internally rather than mirroring the brief's
inverted phrasing verbatim, specifically to avoid re-introducing the ambiguity in code.

**Confirm**: this is the intended semantics — a missing/false row means "not yet validated,
capped at RECOMMEND," and someone (which role?) flips it per-workflow, per-tenant once satisfied.
No UI exists yet to flip it (expected — Hard Rule 5 says the approval UI doesn't need to exist
yet, the gate must still fail closed, which it does: see `tests/ai/aiRuntime/safety.test.ts`).

### 2. `check_permission` has no real per-module RBAC to call yet

`docs/ai/SYSTEM_INVENTORY.md` confirmed there is no generic cross-module `checkPermission(action)`
helper in this codebase — `lib/org/rbac.ts` and `lib/crm/rbac.ts` are separate, module-specific
layers, and neither covers Finance/Sales/HR/Inventory/Manufacturing uniformly. The `check_permission`
control tool built in this chunk is a structural placeholder (passes when `tenantId` + `permission`
are both present) — it proves the tool-call path and audit wiring, but does **not** yet enforce a
real permission check. Every future workflow that reaches `EXECUTE` or above must not rely on this
tool alone until it's wired to something real.

**Decision needed**: should the AI runtime introduce its own permission model (e.g. an
`ai_service_principal` with explicit granted permissions per tenant), or should each future
workflow's `check_permission` call be specialized to call the *real* module-specific RBAC
(`lib/org/rbac.ts` for most modules, `lib/crm/rbac.ts` for CRM) based on `workflow.actionClass`?
The latter matches "wrap, don't rewrite" more faithfully but means `check_permission` can't stay
one generic tool — it would need per-module routing. Flagging for whoever builds the first
`EXECUTE`-autonomy workflow (Chunk 2+, likely AI-02 or AI-03).

### 3. `models/legacy/ApprovalRequest.ts` — is it actually the real general-approval model?

Noted in `SYSTEM_INVENTORY.md`: this model lives in the `legacy/` folder (which `CLAUDE.md` says
means "don't use for new **CRM** work" — a CRM-specific caveat), but for *general*, non-CRM
approvals it may still be the actively-used, real model. Not verified in this chunk (out of
scope — nothing in Chunk 1 needs an approval-request record). Whoever builds a workflow that
needs to create a general approval request (as opposed to an `AiAttentionItem`, which is a
different, new concept) should verify this first rather than assume "legacy" means "dead."

### 4. Tool-call idempotency cache is in-memory (process-scoped), not persistent

`lib/aiRuntime/tools/registry.ts`'s idempotency cache is a plain `Map`, scoped to one Node
process. This is sufficient for a single serverless invocation (a workflow calling the same
write tool twice within one `runWorkflow()` call) and for local dev/test. It is **not** sufficient
across multiple concurrent serverless instances, or across a retry that happens in a fresh
invocation (e.g. the cron sweep retrying a failed event in a new process) — a write tool called
with the same `idempotencyKey` from two different processes would not see each other's cache and
could execute twice. Cross-run replay safety is still guaranteed at a higher level (the
`AiWorkflowRun` compound unique index on `{workflowId, triggerEventId}` prevents the *run* from
re-executing at all), so the practical exposure is narrow — a tool called more than once *within
a single run* that then gets retried as a *new* run after a partial failure. **Decision needed**:
should this become a persistent (DB-backed) idempotency store before any `EXECUTE`-level write
tool ships (Chunk 2+), given retries are explicitly a required feature (Hard Rule 6)?

### 5. AI-11 and AI-17 — workflow names still unknown / uncertain

Recorded in `CAPABILITY_MAP.md`: AI-11 has no cross-reference anywhere in the brief delivered so
far — genuinely unknown, not guessed. AI-17 is inferable only loosely (paired with AI-12 in the
"compliance work" and "workpaper generated; submission gated" phrasing) — treat that inference as
provisional until its real chunk arrives.

### 6. `Organization.settings.ai.disabled` vs the new per-workflow `AiWorkflowPolicy.killSwitchEnabled`

These are two separate, both-must-pass switches by design (see `GLOSSARY.md`). No workflow in
Chunk 1 calls the LLM, so this interaction is untested so far. **Flag for the first workflow that
does call the LLM** (Chunk 2+): its `reason()` stage should route through
`lib/ai/tenantAi.ts::callClaudeForTenant()` (which already checks the tenant-wide switch), and
the executor's gate separately checks the per-workflow switch — confirm both are actually
exercised together in that workflow's tests, since nothing in this chunk proves the two
compose correctly.

**Resolved in Chunk 2**: AI-02's `reason()` routes through `lib/aiRuntime/llm/reasonHelper.ts`
→ `callClaudeForTenant()`; `tests/ai/aiRuntime/ai02LedgerClassification.test.ts`'s "false
positive... gated model" test exercises the tenant-wide gate composing with the per-workflow
`AiWorkflowPolicy` gate together. Not literally the exact "both true/false combination" test A.4
asked for, but the composition is now proven end-to-end through one real workflow.

---

## Chunk 2 (Batch A) — decisions #1, #2, #4 above are now resolved per Part A of
`docs/ai/BRIEF-02-BATCH-A.md`; kept above for history, not repeated here.

### 7. A real architectural finding: `check_permission`'s per-user RBAC routing (A.2) has no
   answer for genuinely autonomous (non-human-triggered) runs

A.2 committed to routing `check_permission` through the *existing* per-user RBAC (`lib/org/rbac.ts`
role table, `lib/crm/rbac.ts` for CRM) rather than inventing an AI service-principal. That RBAC
model requires a real `userId` mapped to a `User` document with a role. **An event genuinely
triggered with no human in the loop (e.g. a pure background sweep) has no such user — every
draft/execute tool call under it would structurally fail permission and fall back to RECOMMEND.**

This did **not** block Batch A in practice: every event this batch wires (`document.received`,
`bill.created`, `invoice.created`, `bank.transaction.imported`, `expense.submitted`) is emitted
from an *authenticated human action* (a real Next.js route with a real `session.user.id`), so
`actingUserId` is threaded through from the real uploader/creator in every case — see
`app/api/document-intelligence/extract/route.ts`, `lib/docIntel/billCreate.ts`,
`app/api/finance/invoices/route.ts`, `app/api/finance/bank/import/route.ts`,
`app/api/finance/expenses/route.ts`. AI-03's `ai.sweep.hourly` trigger (the one genuinely
autonomous, no-human event this batch adds) is exactly where this bites: with no `actingUserId`,
its exact-match auto-reconciliation is structurally incapable of reaching EXECUTE, by design —
correctly fail-closed, not a bug, but worth naming precisely. **Decision needed for later
chunks**: any workflow whose *primary* trigger is a pure schedule/sweep (no human action anywhere
upstream) needs either a real service-principal decision (reopening A.2's rejected option) or an
explicit, audited "system principal" user row per tenant that RBAC can check against. Until then,
schedule-only workflows should expect to live at RECOMMEND in practice, same as AI-03's sweep path.

### 8. `billCreate.ts`'s vendor-vs-customer creation inconsistency, now visible end-to-end

AI-01 resolves vendors against `models/admin/Vendor.ts` and **never creates one** (escalates
instead — tested). But the `draft_bill` tool AI-01 calls still wraps the **unchanged**
`billCreate.ts::createDraftBill`, which independently resolves-or-**creates** a `models/sales/
Customer` partner record for the same vendor, every time (its pre-existing, unmodified behaviour,
per A.1's explicit "do not change it"). So today: an unmatched vendor blocks the `Vendor` lookup
and stops AI-01 (no Invoice drafted at all), but for a vendor that already exists as neither a
`Vendor` row nor a `Customer` row, `createDraftBill` will still silently create a new `Customer`
if AI-01 ever got far enough to call it — it doesn't in practice, since the `Vendor` check runs
first and blocks. **Still open**: these are two unrelated master-data concepts (`Vendor` directory
vs. `Customer`-as-partner) that a real vendor onboarding flow should probably reconcile — this is
explicitly AI-19's problem (master data intelligence, Chunk 8), noted here so it isn't
rediscovered from scratch.

### 9. AI-04: two gaps recorded, not built around

No corporate-card feed model exists anywhere in this codebase — the generic brief's card↔receipt
matching has nothing to match against; not built (would need a genuinely new feed/statement model
this brief never asked for). Separately, `models/finance/Expense.ts` has no receipt-attachment
field, so the "missing receipt above threshold" policy check could not be implemented against
anything real — also not built, rather than faked against a field that doesn't exist. Both are
real product gaps, not code defects; flagging for whoever eventually owns expense receipt
attachments as a feature.

### 10. AI-04/AI-01's receipt extraction schema is additive-only, not wired into the ingestion pipeline

`lib/docIntel/extractionSchemas.ts` now has `DOC_INTEL_TYPE.RECEIPT`, `ReceiptExtraction`,
`coerceReceipt`, `parseReceiptExtraction`, and a receipt prompt — all real and unit-testable in
isolation, matching the existing `vendor_bill` pattern exactly. `lib/docIntel/extractor.ts`'s
`extractDocument()` is still typed to `VendorBillExtraction` only and was **not** touched (out of
scope this batch — AI-04 reacts to an already-created `Expense` via `expense.submitted`, not to a
receipt upload). Building the full receipt-ingestion path (mirroring AI-01's `document.received`
flow, but drafting an `Expense` instead of an `Invoice`) is a real, coherent follow-up — likely
belongs with whichever future chunk extends AI-04 or AI-01 toward receipts specifically.

### 11. AI-02: `BankingRule` has no priority field; and the "propose a learned rule after N
    corrections" closed-loop feature was not built this batch

Confirmed in `SYSTEM_INVENTORY.md`/`CAPABILITY_MAP.md`: `models/finance/BankingRule.ts` has no
priority/ordering field. AI-02's interpreter evaluates rules in `createdAt` order — a documented
limitation, not a schema change (schema changes to a shared model are out of additive-only bounds
this batch). Separately, the generic brief's "after N consistent corrections, propose a
`BankingRule`" learning-loop closure was **not built** — it requires a real `user.corrected_ai_output`
event source (nothing currently emits a correction event when a human edits an AI-set account),
which doesn't exist yet. `AiLearningRecord` captures proposals with `outcome: "pending"` today;
turning "pending" into "accepted/edited" needs that correction event wired first. Flagging as a
concrete, scoped follow-up rather than a vague TODO.

### 12. AI-03's reconciliation position is intentionally simplified

The metrics/position AI-03 reports (`bankBalance`, `unmatchedCount`, `oldestUnmatchedDays`) come
straight from `BankStatement.header.balance_end_real` and the unreconciled-line count — a real,
useful signal, but **not** a true bank-vs-GL balance reconciliation (that needs summing posted
`JournalEntry` lines against the linked `Account` and comparing to the statement balance, which
this batch didn't build). `CAPABILITY_MAP.md` already flags this as AI-22's chartered scope
(Chunk 4, "Continuous reconciliation controller" — the workflow explicitly meant to generalize
this exact concept across every reconciliation pair). AI-03 gets the matching right; the
aggregate-position number is a placeholder for AI-22 to replace, not final.

### 13. Two real bugs found and fixed while building/testing this batch (recorded for the pattern, not just the fix)

1. **`AiWorkflowRun`'s sparse unique index didn't actually exclude a `null` `triggerEventId`.**
   Mongoose writes an explicit `null` for an unset ObjectId path rather than omitting the key —
   a `sparse: true` index only skips genuinely *absent* fields, not present-with-`null` ones. Two
   direct (no event id) invocations of the same workflow collided. Fixed with a
   `partialFilterExpression: { triggerEventId: { $type: "objectId" } }` instead of `sparse`,
   which is correct regardless of how Mongoose serializes the unset value. Regression test added
   to `tests/ai/aiRuntime/executor.test.ts`.
2. **The executor was doubling every finding.** `[...reasoned.findings, ...actResult.findings]`
   assumed `act()` returns *additional* findings on top of `reason()`'s — but AI-01/02/03 all
   passed `reasoned.findings` straight through `act()`'s own return value for convenience,
   silently duplicating every finding (and therefore every attention item) in the envelope.
   Fixed by having every workflow's `act()` return `findings: []` (the executor already merges
   in `reasoned.findings` unconditionally). Also while fixing this: the executor originally only
   created attention items when the *whole run's* status was `escalated`, which silently dropped
   review-worthy findings from a run that also completed something else (AI-03 scanning many bank
   lines in one run, some matched, some not) — fixed to escalate per-qualifying-finding
   (`EXCEPTION` type, or `PROPOSAL` below the workflow's confidence threshold), independent of
   the run's overall status. Neither bug had a regression test before this batch surfaced them
   with real multi-subject/pass-through workflow code — a useful signal that Chunk 1's
   AI-00-SMOKE (single trivial finding, findings:[] in act()) wasn't structurally capable of
   catching either class of bug.

---

## Chunk 3 (Batch B) — decisions #0.1–#0.3, #A.1–#A.5 below are resolved per Part A of
`docs/ai/BRIEF-03-BATCH-B.md`; kept here for history and for items that still need confirmation.

### 14. AI-04 receipt extraction — carry-forward Part 0.1, answered

Case **(a)**: AI-04 shipped policy checking and duplicate detection over *existing* `Expense`
records only, and deliberately deferred receipt OCR/extraction and drafting — nothing in the code
made the extraction path unworkable, it was a scope reduction. This means AI-04 does not yet
remove any keystrokes on the receipt-capture side, which is the product test the brief names.
**Not built now, per this chunk's explicit instruction** — picked up in Chunk 8 alongside
AI-19/AI-27, which touch the same `docIntel` module.

### 15. `schedule.due` fans out to every Batch B workflow — found and fixed before it caused harm

`AiSchedule`'s runner (B.2) emits one `schedule.due` event per due schedule; `dispatchEvent()`
(`lib/aiRuntime/runtime/eventBus.ts`) sends that event to **every** workflow registered on the
`schedule.due` key — and AI-07, AI-08, AI-09, and AI-10 all are, since one eventKey per event is
the executor's only routing mechanism (Chunk 1 design, unchanged). Without a per-workflow
ownership check, all four would attempt to process *every* due schedule regardless of which one
created it. The atomic compare-and-swap in `post_journal`/`link_schedule_draft` would have
prevented actual double-posting (defense-in-depth working as intended), but three workflows would
still race for, and record separate runs/findings against, a schedule that isn't theirs — noisy
and confusing, not safe-by-luck.

**Fixed**: each workflow's `schedule.due` handler now checks schedule ownership explicitly before
touching any period — AI-07 (`scheduleType: "accrual_reversal"`, `sourceRef.model: "PurchaseOrder"`),
AI-08 (`sourceRef.model: "Invoice"`), AI-09 (`scheduleType: "deferred_revenue"`,
`sourceRef.model: "SaleOrder"`), AI-10 (`scheduleType: "depreciation"`, `sourceRef.model: "Asset"`)
— and no-ops cleanly (confidence 0, no periods to run) on anything it doesn't own. Found via this
batch's own test suite (a schedule.due test for one workflow was quietly getting a second,
unwanted run recorded by another), not by inspection — same "test surfaces it" pattern as Chunk
2's two bugs (#13 above).

### 16. `AiWorkflowPolicy.maxAutonomyLevel` is stored but never consulted by the gate — a Chunk 1
    finding this batch proved wrong — **RESOLVED in Chunk 4, docs/ai/BRIEF-04-BATCH-C.md Part 0.1**

Every workflow's ceiling (`decideAutonomy`'s `requestedAutonomy` input) comes from
`workflow.defaultAutonomy` — a static, code-level constant — never from the tenant's configured
`AiWorkflowPolicy.maxAutonomyLevel` field. `lib/aiRuntime/policy/autonomyGate.ts` reads `killSwitchEnabled`,
`confidenceThreshold`, `materialityThreshold`, `historicalStabilityThreshold` from the policy, but
never `maxAutonomyLevel` — confirmed by grep, not assumption. A tenant that sets
`maxAutonomyLevel: "recommend"` intending to cap a workflow believes they've capped it; they
haven't — only `killSwitchEnabled: false` actually prevents autonomous action today, and once a
tenant flips the kill switch on, the workflow runs at its full code-level ceiling regardless of
what `maxAutonomyLevel` says.

**Fixed in Chunk 4**, sign-off given in the brief itself. `decideAutonomy()` now clamps the
effective ceiling to `min(workflow's declared requestedAutonomy, policy.maxAutonomyLevel)` before
the seven-check gate runs; a missing/unrecognized policy value clamps to RECOMMEND. Full write-up,
including the required effective-autonomy table for all 8 previously-shipped workflows and which
ones changed real behaviour (7 of 8), is in `IMPLEMENTATION_LOG.md`'s Chunk 4 entry, Part 0.1. The
22 pre-existing tests that broke the moment the clamp went live were all fixture gaps (missing an
explicit `maxAutonomyLevel` matching the workflow's own declared ceiling), not workflow-code bugs —
fixed by adding it, matching what a genuinely validated tenant's configuration needs to look like.

### 17. `smart-rules.ts`'s expense/income semantic check doesn't recognise asset/liability
    drawdown as valid — every Batch B schedule posting needed `allowNonStandard`

`applySemanticRulesAndClassify()` (Chunk 1-era, `lib/accounting/smart-rules.ts`) rejects any
journal with an expense line unless it's also offset by Cash, Bank, or a Liability account — and
any journal with an income line unless offset by Cash, Bank, or an Asset account. **Amortising a
prepaid/deferred balance, depreciating an asset, and recognising deferred revenue are, by their
fundamental accounting nature, exactly the pairings this rule doesn't whitelist**: Debit Expense /
Credit Prepaid Asset (AI-08), Debit Depreciation Expense / Credit Fixed Asset (AI-10), and Debit
Deferred-Revenue Liability / Credit Income (AI-09) — all textbook-correct, all rejected by the
existing rule. Found via this batch's own `draft_journal` test failures, not assumed: the existing
`/api/finance/assets/compute` route never hits this check at all (it calls
`createPostedJournalEntry` directly, bypassing `applySemanticRulesAndClassify` entirely) — so the
same accounting operation a human could already post through the legacy UI was newly blocked for
the AI's version of it, by a Hard-Rule-3-compliant gate the legacy flow never had to pass.

**Fixed, not bypassed**: every schedule-period `draft_journal`/`post_journal` call in AI-08, AI-09,
and AI-10 now passes `allowNonStandard: true` with an explicit `overrideReason` — the same escape
hatch `financeWriteTools.ts` already documented for "legitimate non-standard entries... accountants
sometimes need." The semantic engine still runs and still stamps `JournalEntry.semanticOverride`
for audit visibility (Hard Rule 3's authority is respected, not routed around); `PostJournalArgs`
in `lib/aiRuntime/tools/scheduleWriteTools.ts` gained the same `allowNonStandard`/`overrideReason`
fields `DraftJournalArgs` already had. **Confirm**: whether `smart-rules.ts`'s rule itself should
be widened in a later chunk to recognise Asset-offset-Expense and Liability-offset-Income as
standard (not just overridable) — that's a policy-engine change outside this batch's scope, so it
wasn't attempted here, but every future schedule-posting workflow (AI-13/AI-24's close entries
included) will hit the identical veto and need the identical override.

**Chunk 4 update (Part 0.3)**: every `allowNonStandard: true` use now also contributes its exact
override reason to the run's trace `reasonChain` (a new `ActResult.reasonChain` field, merged in
`executor.ts`) and increments a new `metrics.policy_overrides` counter (a real schema field on
`AiWorkflowRun.metrics` and `WorkflowRunEnvelope`, not just an app-level tally — the nested object
is Mongoose-strict, so an untyped counter would have been silently stripped on save; found by
checking, not assumed). Neither AI-13 nor AI-24 ended up needing this override — their close-entry
concern turned out to be OBSERVE-level reporting, not journal posting — so the "every future
schedule-posting workflow will hit it" prediction above didn't apply to this batch after all;
still true for anything Chunk 5+ posts on a schedule.

### 18. `SalesInvoice`'s `mongoose.models.X || mongoose.model<T>(...)` export produces an
    unusable `.find()` overload union — a latent type issue, worked around at the call site

`models/sales/SalesInvoice.ts` exports `export const SalesInvoice = mongoose.models.SalesInvoice ||
mongoose.model<ISalesInvoice>(...)`. TypeScript infers the union of `mongoose.models.SalesInvoice`'s
generic `Model<any>` and the properly-typed `Model<ISalesInvoice>`, and `.find()`'s own overloads
can't resolve across that union — a real `tsc` error (`TS2349: This expression is not callable`)
that nothing had hit before this batch, since AI-09 and `lib/aiRuntime/tools/scheduleReadTools.ts`
are the first code anywhere to call `SalesInvoice.find(...)`. **Worked around, not fixed**: both
call sites cast to `SalesInvoice as unknown as mongoose.Model<Record<string, unknown>>` rather than
touching the existing model file (Hard Rule 1). **Confirm**: whether other Sales models share this
same export pattern and will hit the identical issue the first time a future chunk's workflow reads
them with `.find()` — worth a one-time repo-wide fix to the export pattern itself if so, but that's
a model-file change requiring sign-off, not something to do unprompted mid-batch.

---

## Chunk 4 (Batch C) — decisions #0.1–#0.5, #A.1–#A.4 resolved per Part 0/A of
`docs/ai/BRIEF-04-BATCH-C.md`; kept here for history and for items that still need confirmation.

### 19. Two new write tools were needed despite A.3's "no new write tools" — both narrowly
    scoped to AI-native infrastructure, neither an ERP-domain write

**`resolve_task`** (`lib/aiRuntime/tools/control.ts`): AI-24's "when the document arrives, the
request auto-resolves" requirement (an explicit stop-gate test) has no path without a way to close
an attention item a workflow itself raised. `lib/aiRuntime/attention/attentionEngine.ts::
autoResolve()` has existed, documented, unused, since Chunk 1 — its own doc comment already
described this exact use case ("close via autoResolve() once the underlying condition is confirmed
cleared"); nothing before AI-24 ever needed to close an item it raised once the condition cleared.
Scoped to `{tenantId, dedupeKey}` a workflow itself created, same EXECUTE risk class as the
already-granted `create_task`.

**`record_close_assertion`** (`lib/aiRuntime/tools/closeTools.ts`): found necessary, not assumed —
`tests/ai/aiRuntime/safety.test.ts`'s existing source-grep test caught AI-24 writing
`AiCloseAssertion` directly from its own `act()`, a real Hard Rule 2 violation the test exists
precisely to catch. `AiCloseAssertion` is AI-24's own business-meaningful output (not runtime
plumbing like `AiWorkflowRun`/`AiDecisionTrace`, which the executor itself writes), so — consistent
with every other workflow-produced record in this codebase — it now goes through a tool.

**Confirm**: both are reasoned, narrow exceptions rather than silent additions, but they are still
exceptions to an explicit instruction. Flag if either should be reverted or reworked.

### 20. AI-13 does not replicate AI-09's Sales-side "revenue leakage" signal — a deliberate
    boundary decision, not an oversight

The Revenue domain's brief description ("AI-22 `deferred_revenue` + AI-09 gaps") implies a
delivered-but-never-billed check. That check needs `models/sales/**` reads, which Chunk 2's A.1
kept out of every workflow except AI-09 itself (a bounded, named exception, Chunk 3 A.2). AI-13
was not granted that exception in this brief, so `lib/aiRuntime/closeReadiness/domains.ts`'s
`checkRevenueDomain()` only wraps AI-22's `deferred_revenue` reconciliation — the Sales-side half
is honestly unreplicated rather than quietly widening the Batch A boundary. **Decision needed**: 
grant AI-13 the same bounded Sales-read exception A.2 gave AI-09, or accept the Revenue domain
stays narrower than its brief description until then.

### 21. AI-22's `ap_control`/`ar_control_finance`/`inventory`/`suspense_clearing` definitions
    carry real, recorded scope simplifications

- `ap_control`/`ar_control_finance` compare **current** open balances (`Invoice.amountResidual`
  today), not a `periodEnd`-accurate history replay — `Invoice` carries no ledger of
  `amountResidual` over time to reconstruct "as of a past date" precisely. A reconciliation run
  for a past period will reflect today's open-item state, not that period's.
- `inventory`'s GL side uses the `asset_current` account-type bucket. No dedicated
  `asset_inventory` account type exists anywhere in this codebase's Chart of Accounts
  (`models/finance/Account.ts`'s `account_type` enum, confirmed by grep).
- `suspense_clearing` matches accounts by name (`/suspense|clearing/i`) — no dedicated
  account_type exists for this either. Reports `not_applicable` when none match, never invents one.
- AP domain's "unmatched bills from AI-06's future scope" sub-check (named explicitly in the
  brief's own domain table) is not built — AI-06 doesn't exist yet. The AP domain's real signal
  (`ap_control`) still runs; only that one named sub-check is absent, and is not silently implied
  to have run.

None of these invent a number or silently claim more than was checked — each is either honestly
current-state-only, or reports `not_applicable`/omits the specific unbuilt sub-check rather than
guessing. Revisit `ap_control`/`ar_control_finance` if a later chunk needs true point-in-time
accuracy (would need a balance-history ledger that doesn't exist today).

### 22. `report.refreshed` — mentioned in the brief as arriving this batch, not wired to anything

The brief names `period.horizon.reached` and `report.refreshed` as two new shared event keys
Batch C introduces. `period.horizon.reached` is real: emitted every sweep from
`app/api/cron/ai/runtime-sweep/route.ts`, consumed by AI-13/22/24/28. `report.refreshed` was not
built — no "report" concept anywhere in this codebase currently generates an event, so wiring a
subscriber to it would mean inventing both ends. None of the four workflows needed it as a trigger
(`period.horizon.reached`/`ai.sweep.hourly` already cover them). The `subscriptionFilter`
mechanism (Part 0.2) is ready to receive it the moment a real "report refreshed" event source
exists — nothing to build on the consumer side when that day comes.

### 23. `period.horizon.reached` is emitted unconditionally every sweep, not gated to an actual
    approaching period boundary

No close-calendar-aware "period is approaching its end" signal exists anywhere in this codebase to
gate this on. Recomputation is idempotent and cheap (`AiCloseState` is upserted per
`{tenantId, period}`), so emitting it every hourly sweep is the honest, conservative choice over
inventing a fake calendar-awareness signal. Means AI-13/22/24/28 recompute every hour regardless of
where the period actually stands — acceptable given the cost, worth revisiting if recompute cost
grows with tenant data volume.

---

## Chunk 5 (Batch D) — decisions #0.1–#0.5, #A.1–#A.5 resolved per Part 0/A of
`docs/ai/BRIEF-05-BATCH-D.md`; kept here for history and for items that still need confirmation.

### 24. Which accounts constitute "inventory" for reporting purposes? No dedicated account type
    exists to answer this

Raised in `docs/ai/BRIEF-05-BATCH-D.md` Part 0.5, carried forward from Chunk 4's `inventory`
reconciliation-definition scope note (`OPEN_QUESTIONS.md` #21). `Account.account_type`'s real enum
(`models/finance/Account.ts`) has no `asset_inventory` value — only the generic `asset_current`
bucket, which AI-22's `inventory` definition already used as a documented simplification. AI-25
(working-capital intelligence, this batch) needs the identical mapping to compute inventory days
and cannot answer it any more precisely than AI-22 did. **Decision needed**: either add a
dedicated inventory account type/tag to the Chart of Accounts, or establish a different mapping
convention (e.g. account name pattern, a tenant-level setting naming the inventory account(s)).
**Until answered, AI-25 reports inventory days as `not_computable` with this reason — never a
guessed bucket.** DSO/DPO/CCC are unaffected; only DIO (and therefore the full cash-conversion
cycle) is blocked by this.

**Resolved, Chunk 8a**: AI-11 answers this live per tenant (`lib/aiRuntime/inventory/
accountMapping.ts::resolveInventoryAccountMapping()`) — code `"1300"` first, falling back to
`asset_current`/`asset_non_current` account_type, same convention proposed above. AI-25 now calls
it directly and computes DIO whenever it resolves unambiguously for that tenant; when it doesn't
(no coded account and multiple ambiguous `asset_current` accounts, or none at all), DIO still
reports `not_computable` — but now with that tenant's own live `basis` string as the reason,
not a static one. The Chart-of-Accounts decision itself (dedicated inventory account type vs. a
coded convention) was not made — the coded-account convention was adopted as the working answer,
same as AI-22/AI-11 already used it.

### 25. AI-06's "discount opportunity surfaced" test cannot be honestly built — no discount data
    exists anywhere

`docs/ai/BRIEF-05-BATCH-D.md`'s AI-06 Tests section names "discount opportunity surfaced" as an
expected behaviour, but Part A only declares two `not_implemented` items for AI-06 (vendor-bank-
change hold, the payment run itself) — early-payment discounts are not among them, implying the
brief's author expected this to be buildable. A repo-wide search (confirmed, not assumed) found
**no payment-terms or early-payment-discount field anywhere** — not on `Invoice`, `PurchaseOrder`,
or `Vendor`. There is nothing to compute "discount available and worth taking" from. Per Hard Rule
("do not guess on anything touching money... raise an entry and continue"), AI-06 declares
`early_payment_discount` a third `checks_not_implemented` item instead of fabricating a discount
mechanism — proven by its own test (`tests/ai/aiRuntime/ai06PayablesOperations.test.ts`: "early_
payment_discount is honestly declared not_implemented, never fabricated"). **Decision needed**: if
early-payment discounts are a real business need, a `paymentTerms`/`discountTerms` field has to be
added to `Invoice`/`PurchaseOrder`/`Vendor` first — AI-06 cannot manufacture the data it would run on.

### 26. AI-14's "timing difference" driver type — RESOLVED in Chunk 6

`docs/ai/BRIEF-05-BATCH-D.md`'s AI-14 algorithm asked to decompose a movement "by timing/cut-off
(ask AI-28) vs real change." At the time (Chunk 5), `lib/aiRuntime/workflows/ai-28-cutoff-
intelligence/index.ts` exported nothing reusable, so AI-14 declared
`timing_vs_real_change_decomposition` `not_implemented` rather than invent a heuristic that would
duplicate (and risk disagreeing with) AI-28's own logic.

**Resolved** (`docs/ai/BRIEF-06-BATCH-E.md` Part 0.4): AI-28's cut-off evaluation was extracted
into a plain callable service, `lib/aiRuntime/cutoff/evaluateCutoff.ts::evaluateCutoff(tenantId,
invoiceId, periodBoundary)` — AI-28's own workflow now wraps this exact function (a
behaviour-preserving refactor, its pre-existing test suite still green unmodified) instead of
duplicating the logic inline. AI-14's `decomposeVariance()` calls it directly for any driver whose
single current-period transaction traces to a vendor bill (`JournalEntry` line `sourceId`, added
additively to `getAccountTransactionDetail()`'s output) and reclassifies it `"timing"` when the
posted date and receipt evidence disagree on period — proven by a new
`tests/ai/aiRuntime/ai14FluxAnalysis.test.ts` test. Scope is unchanged from AI-28's own: only
vendor bills with real PO→StockMove evidence are determinable; everything else keeps its existing
`one_off`/`recurring`/`new`/`ceased` classification, never a guessed `"timing"` label.

---

## Chunk 6 (Batch E) — process note, not a data/model question

### 27. Playwright pattern: a pre-hydration tab/button click is a silent no-op

Found while building `scripts/verify-policy-loop.ts` (`docs/ai/BRIEF-06-BATCH-E.md` Part 0.5).
Clicking a Radix `TabsTrigger` (or any client-interactive element) immediately after
`page.goto(url, { waitUntil: "domcontentloaded" })` can "succeed" from Playwright's point of view
(the element exists, is visible, receives the click) while doing nothing at all — React hasn't
finished hydrating yet, so no event handler is attached. The failure mode is silent: no error, no
console warning, just a page that still shows whatever tab was active by default. Also relevant:
a page's own mount-time data fetch (a `useEffect` calling `loadX()` once) fires on load, not on a
later tab click into the panel that displays that data — a script waiting on
`page.waitForResponse()` for that fetch must attach the listener *before* navigating, not after
clicking into the tab that shows the result. Recorded here as a reusable pattern for the next
script that drives this app's UI, not as an open question needing a decision — the WHAT was
straightforward, only the HOW was non-obvious.

### 28. AI-12's tax workpaper box set is universal, not a real filing layout

`lib/aiRuntime/tools/taxTools.ts::build_tax_workpaper` returns three boxes —
`output_tax`/`input_tax_credit`/`net_payable` — the shape every GST/VAT-style tax works from, not
a jurisdiction-specific filing form. No per-jurisdiction box-code mapping (e.g. India's GSTR-3B
numbered boxes 3.1(a), 4(A)(5), etc.) exists anywhere in this codebase, and inventing Indian-
specific box numbers here would violate `docs/ai/BRIEF-06-BATCH-E.md` A.5's explicit
jurisdiction-agnostic instruction. `returnType` (from `AiComplianceProfile.obligations[].
returnType`) is threaded through and returned on the dataset so a future chunk can add a real
per-jurisdiction box-code layer keyed off it — driven by data, not a code change — but that layer
does not exist yet. Treat these three figures as the honest, universal numbers a real filing
mapping would be built FROM, never as a ready-to-file return.

## Chunk 7 (Batch F) — Audit, Journal Review & Control Monitoring

### 29. SoD permission-conflict — not_implemented, no role-permission matrix exists

`docs/ai/BRIEF-07-BATCH-F.md` 0.4: `check_sod` (`lib/aiRuntime/journalPatterns/sod.ts`) is real for
the one case this codebase's data supports — preparer ≠ approver, via `JournalEntry.createdBy`/
`approvalDetails.approvedBy`. The other half of segregation of duties — "does one user hold two
*conflicting permissions*" (e.g. can both create vendors and approve their payments) — needs a
role→permission matrix naming which permission pairs are mutually exclusive. `lib/org/rbac.ts` has
no such concept: only `canManageOrg()`-style admin gates, no permission taxonomy at all. Declared
`not_implemented` (`AI-29`'s `sod_permission_conflict` control, and `check_sod`'s own tool
description) rather than guessed from the handful of role strings this codebase does have. A real
implementation would need, at minimum: a first-class permission taxonomy (not just role strings),
a matrix of which permission pairs are mutually exclusive, and a way to resolve a user's actual
granted permissions (today only a single `role` string exists per `User`).

### 30. AI-29's control table: two "Partial" suggestions came back not_implemented on research

`docs/ai/BRIEF-07-BATCH-F.md`'s own control table suggested `payment_against_approved_bill` and
`access_change_authorised` as "Partial — declare the gap." Building them surfaced that neither has
anything partial to check:

- **`payment_against_approved_bill`**: no data model anywhere links an *executed* payment to the
  bill it paid. `models/sales/Payment.ts` is AR-only (customer payments against a `SalesInvoice`).
  The only bill-side link that exists, `models/ai/AiPaymentRunProposal.ts`, is a *proposal* — per
  its own doc comment, payment release is `NEVER_AUTONOMOUS`, permanently, so no proposal is ever
  executed into a real payment record. There is no population to test against.
- **`access_change_authorised`**: `models/admin/ActivityLog.ts`'s `activity`/`details` fields are
  free text with no structured entity or action-type field (confirmed by reading the schema, not
  assumed). Matching a log line to "this was a role/permission change" would require guessing from
  prose — the same class of heuristic this project has avoided everywhere else (jurisdiction
  resolution in Chunk 6, treatment-review ratios in AI-12).

Both are recorded `not_implemented` in `lib/aiRuntime/controls/definitions.ts`, each with its own
`reasonIfLimited`, rather than shipped as a "partial" check with nothing real behind it — same
honesty bar as AI-20's consolidation finding in Chunk 6.

### 31. AI-23's "round-number amount" dimension was built, tested, and removed

The brief's own review-dimension list named "round-number amounts" as one of twelve signals to
score. Built as `amount % 1000 === 0` (with a floor), it immediately flagged ordinary ₹1000/₹5000
sales as risky — caught by `tests/ai/aiRuntime/ai23JournalReview.test.ts`'s own false-positive
test ("a month of ordinary journals produces near-zero flags"), which is exactly the failure mode
this dimension would otherwise have shipped silently. Removed from
`lib/aiRuntime/journalReview/scoreJournalRisk.ts` rather than tuned around, because a standalone
round-number check has no way to distinguish "this business always deals in round thousands" from
"this is suspiciously tidy for this account." The `amount_outside_normal_range` dimension (a
z-score against this tenant's own historical amounts per account) already covers the honest
version of the same concern — round AND unusual for this specific account — so the signal isn't
lost, just folded into a check that actually has a baseline to judge against.

### 32. `not_applicable` audit (0.3): one real bug found and fixed, three definitions hardened

`docs/ai/BRIEF-07-BATCH-F.md` 0.3 named the exact bug from Chunk 6's own tax fixture: AI-22's `tax`
reconciliation definition returned `not_applicable` whenever no `TaxRate.accountId` was
configured, even when real `AiTaxTransaction` rows existed for the period — silently hiding a real
blocker (real tax activity with nowhere to reconcile it) behind a status that means "nothing to
check here." Audited every reconciliation definition in
`lib/aiRuntime/reconciliation/definitions.ts` for the same pattern:

- **`tax`** — the actual bug. Fixed: `not_applicable` only when both the control-account
  population (`TaxRate.accountId`) AND the transaction population (`AiTaxTransaction` rows) are
  empty; a non-empty transaction population with no control account now flows into the classifier
  as an `unexplained` difference, which the engine turns into `unreconciled` — and, at AI-13's
  domain layer, a hard blocker (`blockerFromReconciliation()` already treated `unreconciled` +
  `unexplained` as `isHard: true`, so no domain-layer change was needed once the definition itself
  stopped short-circuiting).
- **`ap_control`/`ar_control_finance`/`inventory`** — already handled the *reported* bug correctly
  (a real, non-empty population with no control account already fell through to `unreconciled` via
  the classifier, not a literal `not_applicable` return), but all three had the *softer* version:
  an **empty** population with no control account configured fell through to a vacuous
  `"reconciled"` verdict (0 ties to 0) rather than an honest `not_applicable` — "we checked and
  it's fine" instead of "there was nothing to check." Hardened to return `not_applicable`
  explicitly when the population (not just the derived total) is empty, matching the same
  population-based test the tax fix uses.
- **`payroll`** — same softer issue (an empty `Payroll` population fell through to a vacuous
  `"reconciled"`); same fix, explicit `not_applicable` on `runs.length === 0`.
- **`bank`/`fixed_assets`/`prepaid`/`deferred_revenue`/`suspense_clearing`** — audited, no fix
  needed. `suspense_clearing` already returns `not_applicable` correctly on a genuinely empty
  account population (no accounts named suspense/clearing exist at all — checked, not assumed).
  The others compute a real total from a real population every time; there is no "population might
  be empty but code claims a verdict anyway" branch to harden.

**Rule going forward, stated precisely**: `not_applicable` is only valid when the underlying
population itself is empty (zero records to check) — never when records exist but the
configuration needed to reconcile them is missing. The latter is a real, `unreconciled`/blocked
gap, not an absence of a question.

## Chunk 8a (Batch G) — Operations & Data Quality

### 33. `payment_against_approved_bill` flipped from not_implemented to real

`docs/ai/BRIEF-08a-BATCH-G.md` 0.3 asked for a bounded investigation before AI-27 started. It
found Chunk 7's own `payment_against_approved_bill` finding ("no data model links an executed
payment to the bill it paid") was too pessimistic: `lib/accounting/payments.ts::
postInvoicePayment()` always posts a real `JournalEntry` (`voucherType: "payment"`) whose lines
carry `sourceId` set to the paid `Invoice`'s own `_id` — a real, structured, queryable link. What's
genuinely absent is a dedicated AP *Payment record* (`models/sales/Payment.ts` is AR-only,
customer receipts) — the JournalEntry itself is the payment record. Flipped to `implemented` in
`lib/aiRuntime/controls/definitions.ts` (population: posted `voucherType: "payment"` entries;
test: the referenced bill exists and isn't `manualReviewRequired`), with a new dedicated test.
Full investigation write-up: `docs/ai/SYSTEM_INVENTORY.md`, "Vendor bill payment / vendor bank
details" row. The other two 0.3 answers (vendor bank details exist nowhere; `BankStatement`→bill
linking is only via AI-03's own reconciliation match) are unchanged from what Chunk 7 assumed and
now confirmed by direct schema reads — they shape AI-19's and AI-27's scope this chunk.

### 34. No generic third-party integration sync/retry mechanism exists — AI-30's repair #2 has no safe write path

Investigated before scoping AI-30's "re-run a failed idempotent integration sync" repair (A.5).
`lib/integrations/connectionService.ts` has no generic per-connector resync/replay function —
only `testConnection()` (a credential/connectivity probe) and `logEvent()` (an activity-log
append). `testConnection()` itself calls `job.save()` on the `Integration` document
(`models/shared/Integration.ts`), mutating `status`/`lastTestAt`/`lastError`.

This collides with two independent, already-established hard rules at once: (1)
`tests/ai/aiRuntime/safety.test.ts`'s structural rule that every write inside an `internal_state`
tool handler must target a model whose name starts with "Ai" — `Integration` doesn't, so
`testConnection()` cannot be wrapped as an `internal_state` tool; (2) `lib/aiRuntime/tools/
registry.ts::callTool()`'s normal (non-`internal_state`) write path requires a real human
`userId` (`routePermissionCheck` fails closed with "no acting user id provided" otherwise) — and
AI-30's `ai.sweep.hourly` trigger is autonomous, with no human in the loop at all. **There is
structurally no safe way for today's runtime to let an autonomous action touch a non-`Ai*` model.**
Declared `not_implemented` in AI-30's own `checksNotImplemented` (`lib/aiRuntime/tools/
opsHealthTools.ts`'s doc comment has the full reasoning) rather than building a tool that would
either fail the safety test or fail every real invocation. **Confirm**: is this gap (autonomous
AI actions cannot safely touch any non-`Ai*` collection, financial or not) something a future
chunk should close with a dedicated "system principal" user/permission concept, or is it a
feature — every non-bookkeeping write staying human-gated by construction?

### 35a. `master_data_verification` and `bank_detail_change_process` flipped from not_implemented to real, once AI-19 existed

Both were deferred in Chunk 7 explicitly "until AI-19 (Chunk 8)". Now that AI-19 provides a real
hold (`AiHold`) and a real masked-evidence trail (`AiMasterDataProfile.bankChangeAlerts`), both
became genuinely checkable and were flipped in `lib/aiRuntime/controls/definitions.ts`:
`master_data_verification` tests whether a hold AI-19 placed has since been cleared by a human
(within a documented 48h grace window before counting as an unverified exception);
`bank_detail_change_process` tests whether every recorded bank-field change alert actually has a
real, still-existing hold behind it — re-checking AI-19's own guarantee held, not re-reading its
conclusion. AI-29's `not_implemented` count drops from 4 to 2 (only `sod_permission_conflict` and
`access_change_authorised` remain, both genuinely blocked on missing structured data). New tests
added to `ai29ControlMonitoring.test.ts`.

### 35. AI-19's `vendor_shares_bank_or_address_with_employee` — implemented in AI-15's registry, closing a Chunk 7 gap

AI-19's brief (item 4) explicitly said this closes AI-15's detector by the same name — done this
chunk (`lib/aiRuntime/workflows/ai-15-anomaly-detection/index.ts` now reads AI-19's own
`employeeCollisions` output from its latest `AiDecisionTrace`, the same pattern already used for
AI-14's flux comparisons). AI-15's own `NOT_IMPLEMENTED` array is now empty (was one entry). AI-11's
margin-by-item analysis was wired into the same file's ratio/trend family
(`product_margin_step_change`) the same way, per its own brief's explicit instruction not to add a
new alert path.

## Chunk 8b (Final) — AI-NL, learning/evaluation, and project acceptance

### 36. AI-06's own `checksNotImplemented` array had gone stale since Chunk 8a — found compiling the README.md handover inventory

Discovered while building the final `not_implemented` inventory for `docs/ai/README.md` (D.3):
AI-06's `CHECKS_NOT_IMPLEMENTED` (`lib/aiRuntime/workflows/ai-06-payables-operations/index.ts`)
still declared `early_payment_discount` and `cross_source_duplicate_search` as not_implemented —
even though Chunk 8a's own report explicitly said AI-19 closed the first (`computeObservedPaymentTerms`)
and AI-27 closed the second (cross-source duplicate search across bills/expenses/payments). The
report was right; the workflow's own array was simply never updated to match. Fixed — both removed;
`vendor_bank_change_hold` stays, correctly, since Vendor/Customer genuinely still carry no
bank-detail field (confirmed, not assumed). Two tests in `ai06PayablesOperations.test.ts` updated
to assert the current, correct state rather than the stale one. **The pattern worth naming**: a
downstream workflow (AI-19/AI-27) closing a gap doesn't automatically update the upstream
workflow's own stale declaration of that gap — a report saying "X is closed" and the code still
saying "X is not_implemented" can both be true at once unless someone deliberately reconciles them.
Worth a repo-wide grep for `checksNotImplemented`/`NOT_IMPLEMENTED` staleness on a future chunk.
