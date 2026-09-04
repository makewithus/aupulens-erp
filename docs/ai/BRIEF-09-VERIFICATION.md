# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 9 — VERIFICATION, EDGE-CASE HARDENING & CONVERSATIONAL MEMORY

> **The catalogue is closed: 30/30 built, 1325/1325 green.** That means the code exists. It does
> not yet mean every workflow *works* — and your own final report says so more honestly than any
> audit would have.
>
> Three admissions in it define this chunk:
> - **Only AI-05 and AI-07 populate `AiLearningRecord`.** Every metric, evidence bar and promotion
>   mechanism built in 8b is wired to a data source that 28 workflows never write to.
> - **AI-06's code still declared gaps that AI-19 and AI-27 had already closed**, until the
>   handover audit caught it. You called this "a report being right and the code still being
>   wrong" — it is a real class of bug and it has hit twice.
> - **Golden datasets cover one workflow.** AI-01, AI-02, AI-03 and AI-15 — the ones where a wrong
>   answer costs most — were scoped out.
>
> Plus: no live model call was available, so the LLM fallback layer is untested; no long-lived
> tenant exists, so no metric has ever computed on real history; and `PRODUCT_TEST.md` is
> backend-verified rather than actually run.
>
> **This chunk builds almost no new features.** It proves the thirty work, hardens them against
> the failure modes that would otherwise reach a customer first, and gives the chat layer real
> memory. Save it to `docs/ai/BRIEF-09-VERIFICATION.md`.

---

# PART 0 — THREE STRUCTURAL FIXES, BEFORE ANY VERIFICATION

## 0.1 Instrument the learning loop at every workflow's decision point

This is your own "what I'd do differently" item, and it is now the highest-value fix in the
project. Everything downstream — override rate, precision, the autonomy evidence bar, governed
promotion, drift — is dead machinery without it.

**Do it in the executor, not per workflow.** A per-workflow instrumentation pass will be
incomplete within two workflows and will drift the way the `not_implemented` declarations did.

- The executor writes an `AiLearningRecord` in the `learn` stage for **every** run that produced a
  proposal, with `status: pending_outcome`, capturing the proposal, the context reference, the
  confidence components and the gate decision.
- Resolution happens on three signals, all of which already exist: a `user.corrected_ai_output`
  event, an approval or rejection of a draft/proposal, and downstream survival (the resulting
  record still stands after the period's reconciliation and close).
- A record that never resolves within its window ages to `outcome_unknown` — **not** to
  `accepted`. Silence is not agreement, and treating it as agreement would inflate every metric
  in the system and could push a workflow past its evidence bar on nothing.

Then assert: for each of the 30 workflows, a run that produces a proposal produces exactly one
learning record. One test, parameterised over the registry, so a 31st workflow cannot be added
without it.

## 0.2 A single source of truth for `not_implemented` declarations

AI-06's code contradicted its own report because each workflow carries its declarations locally,
and nothing tells a workflow when a sibling closes the gap it cites.

Build `lib/aiRuntime/capabilities/registry.ts`: every declaration is a record
`{capability_id, declared_by[], reason, blocking_dependency, status: implemented|not_implemented|
partial, resolved_by, resolved_at}`. Workflows **read** their declarations from this registry
rather than hard-coding strings, and a workflow that implements a capability marks it resolved.

Then:
- One test asserts no declaration is `not_implemented` while its `resolved_by` workflow exists and
  implements it. That test would have caught both occurrences of this bug.
- `README.md`'s honest inventory is **generated from the registry**, not maintained by hand, so
  the document cannot drift from the code again.
- Migrate every existing declaration — AI-22's two, AI-29's two, AI-06/AI-19's vendor bank field,
  AI-19's two, AI-27's credit-note case, AI-30's two, plus the permanent ones (group
  consolidation, statutory submission) — into it.

## 0.3 Finish the golden datasets

AI-01, AI-02, AI-03 and AI-15 were deferred; they are the four where a wrong answer costs most.
Build them now, to the same standard as AI-27's 4/4. Then extend coverage to every workflow that
makes a *judgement* — AI-07, AI-09, AI-10, AI-14, AI-16, AI-19, AI-23, AI-26, AI-28 — with at
least one correct-answer case and one must-stay-silent case each.

Reuse what exists: the twelve identical subscriptions, the year of normal vendor activity, the
month of ordinary journals, the fully-settled order. Those are already golden datasets in
everything but name.

---

# PART A — DECISIONS FOR THIS CHUNK

## A.1 "Verified" means evidence, not a passing test

A test proving a function returns the right shape is not proof a workflow works. For this chunk,
a workflow is **verified** when all six hold:

1. It fires from its real trigger on a realistic tenant, unprompted.
2. It produces the correct output on a golden dataset.
3. It stays silent on its must-not-fire fixture.
4. It survives the full edge-case matrix in Part C.
5. It escalates correctly instead of failing, on every failure path.
6. Its declarations in the capability registry match what its code actually does.

Anything less is "built", not "verified". Track both states separately in `CAPABILITY_MAP.md`.

## A.2 Find the bugs before a customer does — this is the whole point

Your report lists nine real defects found across eight chunks, every one found by writing a test
that tried to break something rather than by a user complaining. That is the method; this chunk
applies it systematically instead of opportunistically.

**For every bug found in this chunk: fix the root cause, add the test that would have caught it,
and check whether the same shape exists in the other 29 workflows.** The `not_applicable` bug in
Chunk 7 was found in tax and existed in four other definitions. The pattern generalises: a defect
found in one workflow is a defect class, not an incident.

## A.3 Conversational memory extends what exists

`models/ai/ChatHistory.ts` and `models/ai/AiMemory.ts` already exist and are cross-module.
**Extend them.** Building a third memory store is the exact failure mode Part 9 item 1 names, and
it would fragment conversation state across two systems.

## A.4 Memory never widens scope

Reference resolution resolves to record IDs already retrieved in this session under this user's
permissions. It never re-reads with wider scope, never carries state across tenants, never
resurrects a record the user has since lost access to. Re-check permission at resolution time, not
only at retrieval time. Assert it.

---

# PART B — THE VERIFICATION PROGRAMME (all 30 workflows)

Work through all thirty. For each, produce a **Workflow Verification Record** at
`docs/ai/verification/AI-XX.md`:

```
# AI-XX — Verification Record

## 1. Trigger proof
Which real event fires it, emitted from which real call site. Evidence: a test that performs
the ordinary business action (create the bill, import the statement) and asserts the run
happened — NOT a test that calls the workflow directly.

## 2. Golden dataset result
Cases, pass rate, and the diff on any failure.

## 3. Silence proof
The must-not-fire fixture and its result. Zero findings expected.

## 4. Edge-case matrix (Part C)
Each class: covered / not applicable / FAILED-and-fixed. No blanks.

## 5. Failure paths
What happens on: missing config, locked period, kill switch off, permission denied, tool
failure mid-pipeline, model unavailable, malformed source data. Each must escalate or
no-action cleanly — never throw into a business route, never partially write.

## 6. Output contract
Envelope conformance test result; every field populated or explicitly null with a reason.

## 7. Declarations
Its capability-registry entries, and proof each matches current behaviour.

## 8. Performance
Observed p95 for a realistic population (Part E.3).

## 9. Bugs found and fixed
Each with root cause, the test added, and whether the same class was checked across other
workflows.

## VERDICT: VERIFIED | VERIFIED-WITH-LIMITS (list) | NOT VERIFIED (why)
```

Do them in dependency order — foundation consumers last: AI-01, AI-02, AI-03, AI-04, AI-07,
AI-08, AI-09, AI-10, AI-11, AI-12, AI-19, AI-27, AI-26, AI-30, AI-05, AI-06, AI-15, AI-14, AI-16,
AI-25, AI-28, AI-22, AI-23, AI-29, AI-17, AI-18, AI-24, AI-13, AI-21, AI-20.

**Report progress in batches of ten**, not at the end. If ten records take too long to produce,
that is information about the verification standard being right, not a reason to lower it.

---

# PART C — THE EDGE-CASE MATRIX

Every workflow is tested against every class below. Where a class doesn't apply, write *why* —
"not applicable" with no reason is how gaps hide.

## C.1 Data shape

| Class | What to test |
|---|---|
| Empty | Zero records in the population. Must return a clean `no_action`, never an error, never a vacuous "reconciled"/"ready" (Chunk 7's rule) |
| Single | Exactly one record — off-by-one in any grouping or averaging |
| Large | 10k+ records. Correct **and** within the performance budget; no unbounded query, no N+1 |
| Null / missing fields | Every optional field absent. No workflow may assume a field exists because it usually does |
| Malformed | Negative amounts where positive is assumed, zero amounts, absurd dates (1900, 2099), unicode and RTL in names, 500-character descriptions, HTML/script in text fields |
| Precision | Amounts with more decimals than the currency allows; sums that must round to the cent; the classic 0.1 + 0.2 case in every schedule and reconciliation |

## C.2 Boundaries

| Class | What to test |
|---|---|
| Period boundary | A transaction at 23:59:59 on the last day; the first second of the next period |
| Timezone | Tenant timezone vs. UTC. A bill dated "today" in IST near midnight must not land in the wrong period. **Check every date comparison in every workflow for this** — it is the most common silent bug in accounting software |
| Month lengths | 28/29/30/31-day months in every schedule; a schedule starting on the 31st; February in a leap year |
| Materiality edge | Exactly at the threshold, one unit under, one unit over |
| Confidence edge | Exactly at the autonomy threshold |
| Fiscal year end | A schedule, accrual or cut-off spanning it |

## C.3 State and concurrency

| Class | What to test |
|---|---|
| Duplicate event | Same event twice, and twice **simultaneously**. Exactly one effect. You have single-fire tests; add the concurrent case |
| Concurrent runs | Two runs on the same subject at once — the executor's per-(entity, subject) concurrency key must actually hold |
| Mid-pipeline failure | Kill the run between `act` and `verify`. No partial write survives; the next run recovers cleanly |
| Retry after partial | A retried run after a partial write does not duplicate it (the persistent idempotency store, exercised across processes, not just in-memory) |
| Locked period | Mid-run lock acquisition — the period locks *between* `validate` and `act` |
| Superseded subject | The subject record is deleted or voided mid-run |
| Stale read | The population changes between the left and right read of a reconciliation (Chunk 4's pinned-timestamp rule, actually tested) |

## C.4 Configuration and permission

| Class | What to test |
|---|---|
| Nothing configured | No materiality, no account mapping, no compliance profile, no policy. Every workflow degrades to `RECOMMEND` and says which setting is missing |
| Partially configured | Materiality set, mapping absent — and each other combination that matters |
| Kill switch off | Clean `no_action`, reason stated, no side effect |
| Permission denied | Refuses cleanly; never falls back to a lower-privilege partial action |
| Tenant AI disabled | `no_action` naming the tenant switch; **no heuristic fallback** (AI-01's Chunk 2 rule, applied to all 30) |
| Cross-tenant | A workflow cannot read or write another tenant's data under any input. Test with a deliberately hostile parameter, not just a clean one |

## C.5 Dependency failure

| Class | What to test |
|---|---|
| Model unavailable | Timeout, error, rate limit, malformed response, refusal. Never a guessed accounting answer — escalate |
| Model returns nonsense | An account ID that doesn't exist, a negative confidence, a wrong-shaped object. Deterministic validation catches all of it |
| Tool failure | A tool throws mid-run. The run escalates; nothing partial survives |
| Sibling workflow unavailable | AI-01 when AI-02 is killed; AI-13 when AI-22 fails. Degrade with a stated reason, never silently omit a domain |
| Integration down | Stale feed handled as stale, not as "no transactions" |

## C.6 The adversarial pass

For each workflow, spend real effort on one question: **what input would make this produce a
confidently wrong answer that a human would accept?** Then test it.

Examples of the shape: a vendor whose name matches two real vendors; a bank line matching three
invoices equally well; a credit note that looks like a duplicate bill; a schedule whose source is
amended after approval; a journal that is unusual but legitimate every year-end; a duplicate that
is actually a legitimate re-bill.

**A confidently wrong answer is worse than an error**, because an error gets investigated and a
wrong answer gets posted. This is the class of failure that reaches customers, and it is precisely
what "don't wait for the client to report it" means.

---

# PART D — CONVERSATIONAL MEMORY FOR AI-NL

Today AI-NL resolves each utterance in isolation. Users don't speak that way. They say "continue",
"remove that one", "same for April", "why did you exclude it?" — and every one of those is
unanswerable without memory of both what they said and what the system replied.

## D.1 What must be remembered — extend `ChatHistory` / `AiMemory` (A.3)

Per session, a `ConversationState`:

| Element | Why |
|---|---|
| Turn history | Both sides: user utterances and assistant responses, in order |
| Resolved intents | Which workflow each turn ran, with parameters |
| **Result sets with stable IDs** | Every list the assistant showed, with each item's real record ref and its display position |
| Current focus | The entity, period, account or record the conversation is "about" |
| Pending clarification | The question asked and the options offered |
| Pending proposal | Any `AiCommandProposal` awaiting confirmation, with its TTL |
| Applied modifiers | Filters, exclusions and scope changes accumulated across turns |
| Corrections | What the user said the assistant got wrong |

**Result sets with stable IDs are the critical one.** "Remove the third one" is only answerable if
the assistant recorded what it displayed, in order, with real record references. Never re-derive a
list to resolve a reference — the underlying data may have changed between turns, and resolving
against a fresh list would act on a different record than the one the user saw.

## D.2 Reference resolution

A resolver runs before intent resolution and rewrites the utterance into a fully-specified request.

| Reference type | Example | Resolves to |
|---|---|---|
| Pronoun | "reconcile it" | Current focus entity |
| Ordinal | "the third one" | Result set position 3's record ref |
| Descriptive | "the Acme one", "the ₹40,000 one" | Match within the last result set |
| Continuation | "continue", "keep going", "and the rest" | Resume the last workflow with the next page or the deferred items |
| Modification | "remove that", "exclude Acme", "without the disputed ones" | Re-run the last intent with an added filter |
| Scope change | "same for April", "now do Q2", "and for the other entity" | Same intent, changed parameter |
| Correction | "no, I meant payables" | Re-resolve the previous intent with the correction applied |
| Meta | "why did you exclude it?", "where did that number come from?" | AI-18 against the prior run's decision trace and evidence |
| Undo | "undo that", "cancel it" | Reverse the last reversible action, or explain why it can't be |

**Rules:**
- Resolution produces a **fully-specified request** which then goes through the normal path.
  Memory changes what the user meant; it never changes what the system is allowed to do.
- **Ambiguous reference → one clarifying question**, showing the candidates. Never guess between
  two records.
- **Never resolve a reference from the model's recollection of the conversation.** Resolve from
  the stored state, by ID. The model may propose which stored item is meant; the ID comes from
  storage.
- A reference to something the assistant never showed → say so plainly.
- Every resolution is recorded on the run: the raw utterance, the resolved request, and what each
  reference bound to. When a user disputes what happened, that record is the answer.
- Permission re-checked at resolution (A.4). Session TTL applies; expired state means asking
  again, not acting on stale references.
- **A resolved destructive intent still previews and confirms**, with the concrete effect stated.
  "Do it for all of them" after a list of forty must state forty and the total amount.

## D.3 Dialogues that must work (implement each as a test)

```
1. U: "Show me what blocks close."          → AI-13, ranked list stored with IDs
   U: "Why is the third one blocking?"      → AI-18 on item 3's evidence
   U: "Who owns it?"                        → owner of the same item, no re-run

2. U: "Find duplicate vendor payments."     → AI-27, 5 candidates
   U: "Ignore the subscriptions."           → same intent + exclusion filter
   U: "Hold the rest."                      → holds the 3 remaining, previews "3 bills, ₹X"

3. U: "Prepare March accruals."             → AI-07 drafts
   U: "Same for April."                     → AI-07, period changed
   U: "Actually remove the Acme one."       → removes that specific draft, by ID

4. U: "Why is gross margin down?"           → AI-14 with drivers
   U: "Drill into the second driver."       → AI-14/AI-18 on driver 2's transactions
   U: "Where did that number come from?"    → decision trace + citations

5. U: "Reconcile the bank."                 → AI-22 bank, 12 exceptions
   U: "continue"                            → next page of the same result set
   U: "no I meant payables"                 → re-resolves to ap_control, states the correction

6. U: "Delete that."                        (nothing shown yet)
                                            → "I'm not sure what you're referring to" — no guess

7. U: "Post them all."                      (after 40 drafts, policy caps at DRAFT)
                                            → refuses per policy, identically to the event path
```

## D.4 What memory must not do

- Never carry state across tenants or users. Assert with a hostile test.
- Never let a remembered permission substitute for a current one.
- Never accumulate silently forever — bound the state and expire it.
- Never let memory raise autonomy. "You approved one like this earlier" is not approval for this
  one. Test it: an approved action followed by a similar request still previews and confirms.
- Never store secrets, bank details or full document contents in conversation state. IDs and
  labels only, masked per AI-19's rule.

---

# PART E — PROVING IT ON REAL DATA

## E.1 A seeded demo tenant with real history

Every metric in 8b is unproven because no tenant has history. Build `scripts/seed-demo-tenant.ts`:
12–18 months of realistic activity for one tenant — vendors with recurring patterns, customers
with distinct payment behaviours, bank statements, stock movement, payroll runs, a few genuine
anomalies, a few genuine duplicates, some messy data, and a handful of deliberate errors for the
workflows to find.

Deterministic and seeded, so it reproduces exactly. This is the fixture the whole verification
programme runs against, and it is what makes "does this actually work" answerable.

## E.2 Metrics computed on real history

With E.1 seeded and 0.1's instrumentation live, run the nightly metric computation and report
**actual numbers** per workflow. Then answer the question 8b could not: on this tenant, which
workflows would meet their evidence bar?

If none do, say so and say what is missing. If some do, that is the first real evidence that
raising autonomy is safe — which is the entire point of the runbook.

## E.3 Performance budgets

"Functioning instantly" needs numbers. Measure p95 on the E.1 tenant and record per workflow:

| Operation | Budget |
|---|---|
| `AiCloseState` read (AI-13) | < 1s — it is a stored state, per the original spec |
| Attention queue load | < 1s |
| Any single event-triggered run | < 10s, or it must be explicitly asynchronous with a visible pending state |
| NL response, read-only intent | < 3s |
| NL reference resolution | < 500ms |
| Nightly sweeps | Within their window, with headroom |
| Statement annotation (AI-21) | < 5s |

Anything over budget: profile it, fix it, or document why it is inherently slow and make it
async with visible progress. A workflow that silently takes ninety seconds is one a user assumes
is broken.

## E.4 The product test, actually run

Re-do `PRODUCT_TEST.md` against the E.1 tenant through the real UI — not backend assertions.
Capture what the user sees at each step, time each step, and run the same sequence with every kill
switch off. That is the artefact that answers the CTO's question.

---

# PART F — STOP GATE

```
[ ] Learning records written by the executor for all 30; unresolved ages to outcome_unknown,
    never to accepted; parameterised test over the registry
[ ] Capability registry live; README's inventory generated from it; the drift test passes
[ ] Golden datasets for AI-01, AI-02, AI-03, AI-15 plus every judgement workflow
[ ] 30 Workflow Verification Records, each with a VERDICT
[ ] Every workflow proven to fire from its real trigger via an ordinary business action
[ ] Full edge-case matrix per workflow; no blank cells; every "not applicable" has a reason
[ ] Timezone/period-boundary audit across every date comparison in every workflow
[ ] Concurrent duplicate-event test (simultaneous, not just sequential)
[ ] Mid-pipeline failure leaves no partial write, on every workflow that writes
[ ] Cross-tenant isolation tested with hostile input on all 30
[ ] Model-unavailable and model-nonsense paths escalate, never guess
[ ] Adversarial pass documented per workflow: the confidently-wrong-answer case and its test
[ ] Every bug found: root cause fixed, regression test added, class checked across all 30
[ ] Conversational memory extends ChatHistory/AiMemory; no third store
[ ] Result sets stored with stable record IDs; references never re-derive a list
[ ] All seven D.3 dialogues pass
[ ] Ambiguous reference asks one question and never guesses between records
[ ] Memory cannot widen scope, cross tenants, or raise autonomy (assert each)
[ ] Demo tenant seeded, deterministic, 12–18 months
[ ] Real metric values reported per workflow; evidence-bar status stated
[ ] Performance budgets measured; every breach fixed or documented as async
[ ] PRODUCT_TEST.md re-run through the real UI with the AI-off comparison
[ ] Full suite green; tsc clean; eslint baseline unchanged; targeted UI scan
```

**Report in three parts, not one:**

1. **After the first ten verification records** — verdicts, bugs found so far, and any defect class
   you have already had to check across all thirty.
2. **After all thirty** — the verdict table, the complete bug list with root causes, the edge-case
   matrix coverage, and which workflows are `VERIFIED-WITH-LIMITS` and why.
3. **Final** — memory dialogues, real metrics with evidence-bar status, performance table, and the
   product-test delta from the real UI.

I expect this chunk to find bugs. A verification pass over thirty workflows that finds none has
not been rigorous — it has confirmed that the tests you already wrote still pass. The nine defects
found so far all came from someone trying to break something specific. Keep doing that.
