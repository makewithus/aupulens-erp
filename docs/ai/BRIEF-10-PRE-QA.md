# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 10 — PRE-QA HARDENING, PART E COMPLETION & THE TEST-TEAM DOCUMENT

> **Answer to your question: yes, continue straight into Part E — but not first.**
>
> Part B found and fixed 20+ real defects across two genuine defect classes, and the work is
> strong. But your own report leaves **one live, unfixed crash in the codebase**, and this build
> is about to go to a human test team who were explicit that it must be checked properly first.
> Shipping a known `RangeError` to QA burns their trust in the whole build — every subsequent
> report they file gets read as "is this real or is it that thing again?"
>
> So: Part 0 closes the known-open list, then Part E, then the test document.
>
> Save this to `docs/ai/BRIEF-10-PRE-QA.md`.

---

# PART 0 — THE KNOWN-OPEN LIST. FIX THESE FIRST.

Everything here is already documented by you. Nothing new is being discovered — it is being
closed.

## P0.1 — AI-12 crashes. Fix it now.

Your consolidated `period.horizon.reached` audit found it: `observe()` does
`String(event.payload.periodEnd)` with **no fallback and not even a truthy check**, producing
`new Date("undefined")`, and `act()` unconditionally calls `.toISOString()` on it. You confirmed
with a standalone repro that this throws `RangeError: Invalid time value`, uncaught, on **every
affected tenant's AI-12 run**.

Fix it exactly as the other 11 were fixed — `PERIOD_PATTERN` / `isValidIsoInstant` validation,
degrade cleanly with a stated reason, never throw. Add the regression test.

**Then fix the second half of the problem:** AI-12's own verification record says this defect
class is "not applicable." That is now false. You identified it yourself as "the same
'report right, code wrong' pattern the brief opened with" — and it is the third occurrence.

Two occurrences was a bug. Three is a process failure. **Add a test that fails if any verification
record claims `not applicable` for a defect class the capability registry or the code says applies
to that workflow.** Documentation that can silently contradict the code is documentation the test
team will be misled by.

## P0.2 — AI-23's cold-start blind spot

Your adversarial finding: a tenant with fewer than 10 historical postings bypasses both
`unusual_account_combination` and `rare_poster`, so a first-time ₹250,000 entry through a
brand-new account pair, by a brand-new poster, scores `auto_ok`.

That is a new tenant's **first month** — precisely when a mistake is most likely and least likely
to be caught by anyone. Documented-and-unfixed is not good enough for a journal-review control.

Fix with a **cold-start rule**: below the history threshold, the tenant-baseline detectors are
unavailable, so the workflow must not return `auto_ok` on amount alone. Fall back to
absolute signals that need no history — amount versus `approvalThresholdAmount`, weekend or
after-hours, missing description, touching cash/revenue/equity, preparer = approver — and default
to `review` rather than `auto_ok` when the baseline is unavailable. State
`baseline_available: false` in the output so a reviewer knows why.

## P0.3 — The three N+1s

| Where | Status | Action |
|---|---|---|
| `evaluateCutoff.ts` (shared; AI-28 and AI-14) | 10k still 45–60s after AI-28's batching, against a <10s budget | Fix the shared function — 3 sequential DB round trips per call is the root cause. Batch or pre-join the lookups |
| `no_posting_into_locked_period` (AI-29) | 12.3–21.3s at 10k, dominated by this control | Fix |
| AI-11 inventory detectors | Named limit at invoice-heavy 10k+ | Fix or make explicitly async with visible progress |

For each: measure before, fix, measure after, record both. If one is genuinely irreducible, make
it async with a pending state rather than leaving a user staring at a spinner — that was E.3's
rule and it still applies.

## P0.4 — Registry and scope loose ends

- `approver_authority` is `partial` in code and not mirrored in the capability registry. Fix, and
  re-run 0.2's drift test — it should have caught this, so understand why it didn't.
- The internal-only unscoped `AiHold.findById()`. Not exploitable today because no
  attacker-controlled id reaches it, but the cross-tenant defect class you found in 8 workflows
  had exactly this shape before it was reachable. Scope it by `tenantId`. One line, permanent.
- `computeBankPosition()`'s internal unscoped `findById` — same treatment, same reasoning.

## P0.5 — AI-22's point-in-time gap: decide, don't just document

`ap_control` and `ar_control_finance` reconcile against the **current** balance, not the balance
as at the period end. For a *closed* period that is wrong — reconciling August against today's
subledger will drift every day after August closes, and AI-13 consumes these definitions to decide
whether a period is closeable.

Either implement point-in-time reconstruction, or — if that is genuinely large — **explicitly
scope the definitions to the current open period only**, return `not_supported_for_closed_periods`
for anything else, and register it in the capability registry. What must not happen is a number
that looks authoritative and drifts silently.

## P0.6 — Clear the golden-dataset limits

18 of 30 are `VERIFIED-WITH-LIMITS`, "almost all the same shape: no golden dataset exists yet."
Chunk 9's 0.3 asked for every *judgement* workflow to have one. Finish it. A workflow with a
golden dataset and a silence fixture can be re-verified in seconds by anyone forever; one without
has to be re-reasoned by hand every time.

Target: **zero `VERIFIED-WITH-LIMITS` verdicts caused by a missing golden dataset.** Limits that
remain should be real product limits, named and understood.

---

# PART A — CONSOLIDATE PART C'S CROSS-CUTTING AUDITS

You noted these are "largely covered incidentally through the 30 records' own matrices, but not
consolidated." Incidental coverage is unprovable coverage. Produce two standalone audits:

**`docs/ai/audits/TIMEZONE_AUDIT.md`** — every date comparison, period assignment and boundary
check across all 30 workflows and the shared services, in one table: file, line, comparison,
whether it is timezone-correct for the tenant's configured zone, and the test that proves it.
This is the most common silent bug in accounting software and the one a test team is least
equipped to find — a bill posted at 23:50 IST on the 31st landing in the wrong month produces
correct-looking numbers in the wrong period.

**`docs/ai/audits/FAILURE_MODES.md`** — for every workflow that writes: what happens when the run
dies between `act` and `verify`. One row per workflow: what has been written at that point,
whether it is recoverable, and the test that proves no partial state survives.

---

# PART B — COMPLETE PART E

## B.1 Demo tenant

`scripts/seed-demo-tenant.ts` — deterministic, seeded, 12–18 months. Vendors with recurring
patterns, customers with distinct payment behaviours, bank statements, stock movement, payroll,
schedules, plus **deliberately planted findings** the workflows should catch: a real duplicate
bill, a real duplicate payment, a genuine anomaly, a cut-off error, an unreconciled difference, a
stale accrual, a related-party pair, a policy inconsistency.

**Document what was planted, in a file the test team does not get.** Their document says what to
look for; this one says what is definitely there, so you can verify the workflows actually find
it. If a planted finding isn't found, that is a bug — and this is the cheapest way you will ever
find those bugs.

Add `scripts/reset-demo-tenant.ts` so a tester can return to a clean state after breaking
something. They will break something; that is their job.

## B.2 Real metrics

Run the nightly computation on B.1's tenant with 0.1's instrumentation live. Report **actual
numbers** per workflow, and answer: which workflows meet their evidence bar? If none, say what is
missing. This is the first real evidence about whether raising autonomy is safe.

## B.3 Performance table

p95 per workflow on B.1's tenant against E.3's budgets. Every breach fixed or documented as async
with a visible pending state.

## B.4 The product test, through the actual UI

Re-run `PRODUCT_TEST.md` in a browser against B.1's tenant — what the user sees at each step,
timed — then the same sequence with every kill switch off. Screenshots or a recording. This is the
artefact for the CTO, and it is also your own last check that the thing works when a human drives
it rather than when a test calls it.

---

# PART C — `AI_Workflow_Test.md` — THE TEST TEAM'S DOCUMENT

This is the deliverable the user hands to QA. Write it at `docs/ai/AI_Workflow_Test.md`.

## C.1 Who it is for, and what that means

**A finance-literate tester who does not read code, does not run `npm test`, and will not open a
terminal.** Every instruction must be performable through the UI or by a stated action (upload
this file, create this bill, wait for the nightly job / press this button).

If a workflow can only be observed by reading a database record, **add the surface that shows it**
— on the `/finance/ai-operations` tabs — or state plainly that it is backend-only and give the
tester a supported way to see the result. A workflow QA cannot observe is a workflow QA cannot
sign off.

## C.2 Structure

**Front matter, before the workflows:**
1. What this system is, in one page, in plain English. What "the AI runs continuously" means.
2. **Test environment setup** — the demo tenant, the login, how to reset it, and which policy
   settings must be on for testing (every kill switch on, autonomy at each workflow's intended
   level). Written as steps, not as prose.
3. **How to read a result** — what the Attention queue is, what a finding is, what "escalated"
   versus "no action" means, what the Close tab's `ready` / `blocked` / `not_applicable` /
   `not_checked` states mean and why they are different.
4. **How to file a bug** — what to capture: the run ID (make it visible in the UI), the tenant,
   the exact input, what they expected, what happened, and a screenshot. A bug report without a
   run ID costs an hour to reproduce.
5. **Known limits — read this before filing anything.** The full generated `not_implemented`
   inventory in plain language. If a tester files "the system doesn't detect vendor bank-detail
   changes," that is expected behaviour and the doc must have told them so.
6. **Glossary** — every term a tester will see in the UI.

**Then one section per workflow, all 30, in this exact shape:**

```
## AI-XX — <Workflow name>

### What it does
Two or three sentences, plain English, no jargon. What a person would otherwise do by hand.

### Why it matters
One sentence: what goes wrong if this is broken.

### Before you start
- Tenant/data state required
- Policy settings required (autonomy level, kill switch on)
- Anything that must have run first

### Test cases

| # | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|
| 1 | Happy path | ... | ... | ... | ... | |
| 2 | Boundary | ... | ... | ... | ... | |
| 3 | Bad input | ... | ... | ... | ... | |
| 4 | Must stay silent | ... | ... | Nothing appears | ... | |
| 5 | Config missing | ... | ... | ... | ... | |
| 6 | Kill switch off | ... | ... | ... | ... | |

### It must NOT do these
Bullet list of things that would be serious bugs if observed.

### Known limits — do not file these as bugs
Bullet list, in plain English, with why.

### If it fails
What to capture, and which log/ID to include.
```

## C.3 Rules for writing the test cases

- **"What you do" must be literally performable.** "Upload the file `demo/bills/acme-invoice-01.pdf`
  from the test pack via Document Intelligence → Upload" — not "ingest a vendor bill."
- **"Expected result" must be specific enough to be wrong.** "A draft bill appears for Acme
  Traders, ₹47,200, coded to Professional Fees, with the PDF attached, and no duplicate warning" —
  not "the bill is processed correctly."
- **Ship the test pack.** Sample PDFs, receipts, CSVs, statements — real files, in
  `docs/ai/test-pack/`, referenced by name. A tester should never have to invent input data;
  invented data produces unreproducible bug reports.
- **Every workflow gets at least one silence case.** The most valuable QA finding is a
  false positive, and testers only look for those if you tell them to.
- **Cover the planted findings from B.1.** At least one case per workflow should be "the demo
  tenant contains X — confirm the system found it."
- **Order the sections so a tester can work top to bottom.** Ingestion before classification
  before reconciliation before close. Not numerical order — dependency order, same as verification.
- **Mark each case P1 / P2 / P3.** If QA has two days rather than two weeks, P1s alone must cover
  every workflow's core path.

## C.4 The rule that matters most

**Every case in this document must have been executed by you, on the demo tenant, and observed to
pass, before the document ships.**

Not "the unit test passes." Executed end to end, the way the tester will do it, and the actual
result observed. Where you cannot drive the UI, drive the real route the UI calls and say in the
verification log that this is what you did.

Any case that fails: **fix the product, then re-run it.** Do not soften the expected result to
match what the code does — that is the one thing that would make this document worse than useless,
because QA would sign off on a broken build using your own words.

Keep `docs/ai/AI_Workflow_Test_SELFRUN.md` — every case ID, when you ran it, what you observed,
pass or fail, and for failures the fix and the re-run. That log is what lets the user tell the
test team, truthfully, that it was checked properly before it reached them.

---

# PART D — PRE-QA RELEASE CHECK

Before the document goes out, one final pass. Report each with a yes and evidence, or a no and a
reason:

```
[ ] Zero known-unfixed crashes anywhere in the AI runtime (P0.1 closed)
[ ] Zero VERIFIED-WITH-LIMITS caused by a missing golden dataset (P0.6)
[ ] Every remaining limit is a real product limit, in the capability registry, and in the
    test document's "known limits" section — in plain English
[ ] Full suite green; tsc clean; eslint baseline unchanged; production build clean
[ ] Targeted UI scan clean; the four pre-existing failures unchanged in count
[ ] No workflow throws into a business route under any input tested
[ ] No cross-tenant read or write is reachable, including from the chat surface
[ ] No workflow exceeds its declared autonomy; the clamp holds from chat and from events
[ ] The permanent gates hold: no payment release, no bank-detail change, no statutory
    submission, no tax/policy rule change, no period close or lock — from any surface,
    at any confidence, with any policy setting
[ ] Every planted finding in the demo tenant is actually found by the workflow that owns it
[ ] Every case in AI_Workflow_Test.md executed and observed to pass (SELFRUN log)
[ ] Run IDs visible in the UI so a bug report can carry one
[ ] Demo tenant reset script works from a broken state
```

The third-to-last one is the one I would most expect to surface a bug. Planted findings are the
only test in this entire project where you know the right answer independently of the code that
produces it.

---

# PART E — WHAT TO REPORT

Three reports, in order — do not batch them:

**1. After Part 0.** Every P0 item: what was wrong, the fix, the regression test, and the
before/after numbers for the three N+1s. Plus why 0.2's drift test missed `approver_authority`.

**2. After Part B.** The demo tenant contents (including the planted-findings list), real metric
values per workflow, evidence-bar status, the performance table, and the product-test delta from
the real UI.

**3. After Part C.** The test document itself, the SELFRUN log summary — cases run, passed, failed
and fixed — and the Part D checklist with evidence.

---

One last thing, and it is the point of this whole chunk. The test team asked for this to be
checked properly before it reaches them. The honest version of "checked properly" is not "all
tests pass" — it is: *every documented behaviour has been executed and observed, every known
defect is closed or written down in plain language, and the one live crash we knew about is
fixed.* Get to that, and the document you hand over is worth trusting.
