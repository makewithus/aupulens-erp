# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 8b of 8 — THE FINAL CHUNK
# Natural-language control layer, learning & evaluation, and project acceptance

> **All 30 workflows are built.** 1297/1297 green, 150 test files, tsc clean, eslint baseline
> unchanged. That is the whole catalogue from the CTO's specification, plus a runtime the original
> document only sketched.
>
> Your Part 0.3 investigation produced the best finding of the batch and it deserves calling out:
> **a bill payment does create a traceable link** — `postInvoicePayment()` posts a `JournalEntry`
> with `voucherType: "payment"` whose lines carry `sourceId` = the paid bill's `_id`. Three
> chunks of `not_implemented` declarations rested on the assumption that no such link existed.
> One person actually opening the file overturned it. That has a consequence you may not have
> followed all the way through — see Part 0.1.
>
> Save this file to `docs/ai/BRIEF-08b-FINAL.md`.
>
> This chunk builds **no new financial capability**. AI-NL adds nothing the 30 workflows don't
> already do — which is the entire reason it was built last.

---

# PART 0 — THREE THINGS TO RECONCILE BEFORE STARTING

## 0.1 The `sourceId` link may unblock AI-27's biggest declaration

In Chunk 8a, AI-27 declared `payment_duplicate_detection: not_implemented` on the stated grounds
that no data model links an executed payment to a bill. **Your own 0.3 finding contradicts that.**
The link exists: a payment `JournalEntry`'s lines carry `sourceId` pointing at the bill.

So: can AI-27 now detect *the same bill paid twice* — two payment journals whose lines carry the
same bill `sourceId`? If yes, that is the single highest-value detection in the entire project
(the retrospective sweep on your fixture already found ₹15,000 recoverable from documents alone),
and it should be built here rather than shipped as a permanent gap.

**Do this first.** Either implement it and flip the declaration, or explain in one paragraph why
the link is insufficient despite existing. Do not leave the two statements contradicting each
other in the codebase's own documentation.

## 0.2 Was `AiAccountMapping` actually built?

Chunk 8a's Task 0 asked for `models/ai/AiAccountMapping.ts` to close three gaps at once. Your
report describes AI-11 resolving inventory accounts live — `"1300"` first, then
`asset_current`/`asset_non_current` fallback, reusing `lib/accounting/inventory.ts`'s posting
logic. Reusing the real posting logic is good instinct. But a hard-coded account code is a magic
number, and the report doesn't mention the mapping model at all.

State plainly which happened:
- **(a)** `AiAccountMapping` was built and AI-11 falls back to the `"1300"` heuristic only when
  unmapped → then confirm AI-12's tax control lookup and AI-22's suspense regex also read it.
- **(b)** It wasn't built → then build it now, as Task 0 of this chunk. The tax control account
  and the suspense-account name regex are still latent false-completion paths, and they were the
  reason the model was specified.

## 0.3 One line on the bank-detail contradiction

Your report says `bank_detail_change_process` **flipped to real**, and two lines later that
`vendor_bank_change_detection` **remains `not_implemented`** because no such fields exist on
`Vendor`/`Customer` (while being real on `Employee`/`BankAccount`).

Both may be true — the control tests the *process* over the fields that exist, while vendor-side
detection has no fields to watch. But as written, a reader concludes the system watches vendor
bank changes when it cannot. Write one clarifying line in `CAPABILITY_MAP.md` and in AI-29's
control description stating exactly which records the control covers.

## 0.4 UI scan skip — accepted

Zero UI files touched, empty branch-diff import graph, `UI_REGRESSION.md`'s own coverage rule
satisfied. Correct call. **This chunk touches UI**, so the targeted scan runs again.

---

# PART A — DECISIONS FOR THIS CHUNK

## A.1 Chat is not an autonomy bypass — this is the load-bearing rule

Every ceiling in this system is enforced at the autonomy gate. A chat interface that calls
workflow internals directly, or that runs with the requesting user's permissions instead of the
workflow's policy, would route around four chunks of control work in a single afternoon.

**A chat-triggered run is identical to an event-triggered run**: same executor, same 10 stages,
same `decideAutonomy()` clamp, same `AiWorkflowPolicy`, same kill switch, same decision trace.
The only difference is the trigger source recorded on the run.

Assert it: a test where a chat request asks a workflow to do something its policy forbids, and the
workflow refuses exactly as it would from an event. Then assert the inverse — the same request
succeeds when policy allows — so you know the test proves the gate rather than a broken path.

## A.2 Extend the existing chat; do not build a second one

`SYSTEM_INVENTORY.md` records a real propose→confirm→execute pattern already shipped:
`AiCommandProposal` and `AiActionProposal`, executed through `lib/accounting/aiActions.ts`'s
fixed seven-action switch, with intent matching in `lib/accounting/aiIntent.ts` (regex-based,
explicitly propose-only), plus TTL expiry and a Command Center surface.

**That is the chassis.** AI-NL widens the action set from seven hard-coded actions to the 30
registered workflows, and upgrades intent matching from regex to model-assisted resolution. The
proposal record, the confirm step, the TTL and the existing UI stay.

Part 9 item 1 applies here as much as anywhere: the failure mode is building a parallel chat
because the new thing feels different.

## A.3 The parser resolves to a registered workflow plus parameters — never to code

The output of intent resolution is `{workflow_id, parameters{}, confidence, alternatives[]}`
against the workflow registry. It is not a plan, not generated code, not a tool sequence the model
invents. If no registered workflow matches, the answer is "I can't do that yet" plus the closest
capabilities — not an improvisation.

Ambiguous intent asks **one** clarifying question. A destructive intent confirms with the specific
effect stated in numbers: *"this will draft 3 journals totalling ₹12,400 — confirm"*, never
*"proceed?"*.

## A.4 Learned mappings get promoted through configuration, never silently

AI-02 has been proposing `BankingRule`s since Chunk 2 through the existing `create_banking_rule`
proposal path. This chunk builds the machinery that decides *when* a pattern is stable enough to
propose — and it stays a proposal a human approves. Nothing in the learning loop mutates a rule, a
tax code, an accounting policy, or an account mapping. Chunk 1's Hard Rules haven't moved.

---

# PART B — AI-NL: THE NATURAL-LANGUAGE CONTROL LAYER

**Business meaning.** Users command and investigate the operating layer in words. It is a control
surface over the engine, not the engine. **If this layer were deleted, all 30 workflows would keep
running on their triggers and schedules** — build it so that statement stays true, and assert it
with a test that disables AI-NL and confirms an event-triggered run still completes.

## B.1 Architecture

```
utterance
  → intent resolution        → {workflow_id, parameters, confidence, alternatives[]}
  → parameter validation      (entity, period, account, vendor resolved to real records)
  → policy preview            what will this do, at what autonomy, reversible?
  → confirmation              only for anything above OBSERVE
  → executor.runWorkflow()    the same path an event takes
  → explanation               from the envelope's summary + reason_chain, with citations
```

Resolution is layered, cheapest first — the same discipline that made AI-02's `BankingRule` engine
work: try the existing `aiIntent.ts` regex patterns; then registry matching against workflow names,
descriptions and trigger vocabulary; then the model, constrained to choose from the registry.
Record which layer resolved it. A system that answers "show me what blocks close" without an LLM
call is faster, cheaper and more predictable, and you already have the pattern for it.

## B.2 The intent map (minimum — every one of these must work)

| User says | Resolves to |
|---|---|
| "Reconcile this bank account." | AI-22, `bank` definition; return exceptions |
| "Why is gross margin down?" | AI-14 flux + drivers, drill to transactions |
| "Prepare March accruals." | AI-07; create drafts |
| "Show me what blocks close." | AI-13 readiness; ranked blockers |
| "Fix the obvious bank matches." | AI-03; **only** matches passing the autonomy gate; ambiguous ones left |
| "Prepare the GST workpaper." | AI-12 reconciliation + workpaper |
| "Find duplicate vendor payments." | AI-27 across bills, expenses, bank transactions |
| "Why doesn't AP tie to GL?" | AI-22, `ap_control`; explain the exact differences |
| "Show me the support for this number." | AI-18 evidence pack with citations |
| "Which customers should I chase first?" | AI-05 collection worklist |
| "Are we going to be short on cash next month?" | AI-16 forecast + risks |
| "Why did the system code this bill to that account?" | AI-18 decision-trace retrieval |

The last one matters more than it looks. It is the question that makes an autonomous system
acceptable to a finance team, and you already store everything needed to answer it.

## B.3 Rules

- **Read-only intents execute immediately.** Anything above `OBSERVE` produces a preview and
  requires confirmation, through the existing `AiCommandProposal` flow with its TTL.
- **The preview states the concrete effect** — counts, amounts, records affected, reversibility —
  derived from the workflow's proposed actions, not from the model's description of them.
- **Scope every query to the user's tenant and permissions** at the context service, as every
  workflow already does. A chat question cannot widen access.
- **Never answer a factual question from the model's own knowledge.** If it is about this
  tenant's data, it comes from a workflow's output with citations, or the answer is "I don't have
  that." This is AI-18's citation rule extended to the whole conversational surface.
- **Every chat action writes the same decision trace** as an event-triggered run.
- **Voice, if added, is a transcription front-end to the same parser.** No separate path.

## B.4 Tests

- Each of the twelve utterances above resolves to the correct workflow with correct parameters.
- A request a workflow's policy forbids is refused identically to the event path (A.1), and the
  same request succeeds when policy allows.
- "Fix the obvious bank matches" acts only on gate-passing matches and reports what it left.
- An ambiguous utterance asks exactly one clarifying question, not three.
- A destructive intent's preview states counts and amounts before confirmation.
- An unmatched intent returns "I can't do that yet" plus nearest capabilities — never an
  improvised action.
- A factual question with no supporting data returns "I don't have that", citing the query.
- **AI-NL disabled → an event-triggered workflow run still completes** (the control-surface test).
- The existing seven `aiActions.ts` actions and the Command Center behave identically (assert).

---

# PART C — LEARNING LOOP EVALUATION & GOLDEN DATASETS

The learning store has been capturing proposal-versus-outcome since Chunk 1. Nothing has ever read
it back. This is where it becomes useful.

## C.1 The metrics — instrument all twelve

Build `models/ai/AiMetricSnapshot.ts` and a nightly computation, sliced by tenant, workflow, and
where meaningful by vendor, account, document type and country.

| Metric | Definition |
|---|---|
| Extraction accuracy | Field-level correctness vs. the human's final value, by document type |
| Classification accuracy | Account / dimension correctness (AI-02) |
| Match precision | Correct auto-matches ÷ all auto-matches (AI-03, AI-22) |
| **False-match rate** | Incorrect matches — weight this heavily; a wrong match costs more than a missed one |
| Auto-action error rate | Incorrect actions that nevertheless passed the gate |
| Override rate | How often a human changed AI output, by workflow |
| Exception resolution time | Detection → resolution, from the attention engine |
| Automation coverage | Eligible volume processed with no manual entry |
| Downstream reconciliation | Did automated output survive reconciliation and close? |
| Close readiness trend | Blocker count and unresolved value over time (AI-13 already stores this) |
| Hours saved | Manual effort removed — state the estimation basis explicitly |
| Model drift | Any of the above, by time and by segment |

Two you already have partial machinery for: AI-15's `detector_health` precision, and Chunk 4's
`metrics.policy_overrides`. Fold both in rather than recomputing.

**Surface them** on a fifth tab of `/finance/ai-operations` — **Performance**. Per workflow: its
metrics, its trend, its current autonomy, and — the important column — **whether it currently
meets the evidence bar for the next autonomy level** (Part D.2).

## C.2 Golden datasets

Each workflow gets a fixture set with known-correct answers, run in CI. Normal tests prove the
code does what it did yesterday; golden datasets prove the *behaviour* hasn't drifted — which
normal tests structurally cannot catch when a model or a prompt changes.

Requirements: realistic, tenant-anonymised, versioned in the repo, one file per workflow, with an
expected-output file alongside. A run reports pass rate per workflow and a diff of what changed.
A drop below a configured threshold fails CI.

**Start with the workflows where a wrong answer costs most**: AI-01 extraction, AI-02
classification, AI-03 matching, AI-27 duplicates, AI-15 detectors. The false-positive fixtures you
have built throughout — the twelve identical subscriptions, the year of normal vendor activity,
the month of ordinary journals — are already golden datasets. Formalise them into the harness
rather than rewriting them.

## C.3 Governed promotion of learned mappings

1. Aggregate outcomes by (tenant, vendor/customer, account, document type).
2. When a pattern reaches the stability threshold — N consistent accepted proposals, override rate
   below a floor, and the resulting entries survived reconciliation and close — generate a
   **proposal**, through AI-02's existing `create_banking_rule` path.
3. A human approves. The rule is versioned with its evidence: how many observations, over what
   period, with what override rate.
4. **Never** promote a tax treatment, an accounting policy, or an account mapping this way.
   Only classification mappings, only through configuration, only with approval.
5. Track promoted rules: if a rule starts being overridden after promotion, flag it for review.

## C.4 Drift

Compare each metric against its trailing baseline, sliced by segment. A significant degradation
raises an attention item naming the segment — "extraction accuracy on scanned PDFs from provider X
fell from 0.94 to 0.71 over three weeks" is actionable; "accuracy declined" is not. Model or
prompt version changes are recorded on every run already; correlate against them.

---

# PART D — ACCEPTANCE: DOES THIS ACTUALLY WORK?

Everything so far has been measured by tests passing. This part measures the thing the CTO
actually asked for.

## D.1 The product test, executed

> *If AI is turned off, Aupulens should become materially more labor-intensive.*

Build `docs/ai/PRODUCT_TEST.md` from a real end-to-end scenario run on a seeded tenant, with
every workflow enabled at its intended autonomy:

1. A vendor bill arrives → AI-01 extracts, AI-02 codes, AI-27 checks duplicates, a draft appears
   with evidence linked.
2. A bank statement imports → AI-03 matches, AI-22 updates the position.
3. Period end approaches → AI-07 proposes accruals, AI-08 runs schedules, AI-10 runs depreciation,
   AI-28 checks cut-off.
4. AI-13 computes readiness; AI-24 verifies evidence; blockers are ranked with owners.
5. AI-14 explains the margin movement; AI-15 raises one real anomaly; AI-16 flags a cash date.
6. AI-18 answers "show me the support for this number" with citations.
7. A user asks AI-NL "what blocks close?" and gets the ranked list.

For each step record: **what a human would have done manually, and what they do now.** Then run
the same scenario with every kill switch off and record the delta. That document is the answer to
the product test, and it is what a CTO reads instead of a test count.

## D.2 The autonomy enablement runbook — the most important document you will write

Right now, an unconfigured tenant runs everything at `RECOMMEND`. That is correct and safe, and it
also means the system notices everything and does nothing. The gap between "built" and "removes
labour" is a **safe path to raising autonomy**, and nobody has written it.

`docs/ai/AUTONOMY_RUNBOOK.md` — per workflow:
- Its intended target autonomy and what that unlocks in practice.
- **The evidence bar**: the specific metric thresholds from C.1 that must hold, over a minimum
  sample and a minimum window, before raising it. For AI-02: override rate below X over N
  classifications. For AI-03: false-match rate below Y over N matches.
- The rollback trigger: which metric moving which way means turn it back down, automatically
  where you can build it.
- What is permanently gated regardless of evidence: payments, bank-detail changes, statutory
  submission, tax and policy rule changes, period close and lock. That list has not changed since
  Chunk 1 and never will.

Wire the Performance tab to show, per workflow, whether the bar is currently met. A finance owner
should be able to look at one screen and see "AI-02 has met its bar for three weeks — raise it?"

## D.3 Handover

`docs/ai/README.md` — the map for whoever inherits this: the runtime architecture in one diagram,
the 30 workflows and what each owns, how to add a 31st, how the autonomy gate works, where the
kill switches are, what the `internal_state` category means, the honest list of everything still
`not_implemented` with its reason, and pointers to `DECISIONS.md`, `OPEN_QUESTIONS.md`,
`AUTONOMY_RUNBOOK.md`, `UI_REGRESSION.md` and `BASELINE_FAILURES.md`.

The `not_implemented` list is the part to get right. It is the honest inventory of what this
system does not do — vendor bank-change detection, permission-conflict SoD, statutory submission,
group consolidation, and the rest — each with the specific missing data or model. That list is
worth more to the next engineer than any amount of prose about what does work.

---

# PART E — FINAL STOP GATE

```
[ ] 0.1 AI-27 payment-duplicate detection: implemented, or a written explanation of why the
    sourceId link is insufficient. No contradicting statements left in the docs.
[ ] 0.2 AiAccountMapping status stated; built if it wasn't; tax control and suspense read it
[ ] 0.3 Bank-detail control coverage clarified in one line
[ ] AI-NL extends AiCommandProposal / aiIntent.ts / Command Center — no second chat
[ ] A chat-triggered run goes through the same executor, gate and trace as an event
[ ] A policy-forbidden request is refused identically from chat; the allowed case succeeds
[ ] All twelve intents resolve correctly; resolution layer recorded per utterance
[ ] Destructive previews state counts and amounts before confirmation
[ ] Unmatched intent returns "can't do that yet" + nearest capabilities, never improvises
[ ] Factual questions answered only from workflow output with citations
[ ] **AI-NL disabled → event-triggered runs still complete** (the control-surface test)
[ ] Existing seven aiActions and Command Center behave identically
[ ] All twelve metrics computed nightly and stored; detector_health and policy_overrides folded in
[ ] Performance tab live; shows autonomy bar status per workflow
[ ] Golden datasets in CI for at least AI-01, AI-02, AI-03, AI-27, AI-15; existing false-positive
    fixtures formalised into the harness
[ ] Promotion is proposal-only, evidence-versioned, and cannot touch tax/policy/mapping
[ ] Drift alerts name the segment, not just the metric
[ ] PRODUCT_TEST.md written from a real scenario run, with the AI-off delta
[ ] AUTONOMY_RUNBOOK.md written: evidence bar and rollback trigger per workflow; permanent
    gates restated
[ ] README.md handover written, including the full honest not_implemented inventory
[ ] Full suite green; tsc clean; eslint baseline unchanged; API surface diffed
[ ] Targeted UI scan run (this chunk touches UI)
[ ] All docs updated; 30/30 BUILT and the catalogue closed
```

**Final report — what I want to see:**

1. The AI-27 payment-duplicate answer and, if implemented, what the retrospective sweep found.
2. The intent-resolution table: which of the twelve resolved without an LLM call.
3. Current metric values per workflow on your seeded tenant, and how many currently meet their
   autonomy bar.
4. The golden-dataset pass rates.
5. The `PRODUCT_TEST.md` delta in one paragraph: what a human does now versus with AI off.
6. The final `not_implemented` inventory — every item, with its reason, in one list.
7. Anything you would do differently if this project started again.

That last one is not ceremonial. You have found nine real defects across eight chunks — a
fail-open `act()`, a dead `maxAutonomyLevel`, a sparse-index bug, a findings-doubling executor, a
`not_applicable` hiding real tax activity, a `payment_against_approved_bill` assumption that was
never checked — and the pattern in how those were found is worth writing down for whoever builds
the next thirty workflows.
