# AUPULENS — CHUNK 10, ADDENDUM A
# Read alongside `docs/ai/BRIEF-10-PRE-QA.md`. Parts A–E of that brief still stand.

> **Part 0 is closed and closed well.** The N+1 numbers are real improvements — 21s to 674ms on
> `no_posting_into_locked_period` is not a tune, it is a rewrite of how that control queries.
> Three things in your report deserve more than an acknowledgement, and one of them changes how
> you should work for the rest of this project.
>
> Save this to `docs/ai/BRIEF-10a-ADDENDUM.md`. Do this before Part A.

---

# PART 0 — THE FOURTH OCCURRENCE, AND IT IS A DIFFERENT KIND

> *"The interrupted background agent that did this work claimed all four AI-11 detectors were
> fixed; two weren't actually touched. Found and fixed both while building AI-11's golden dataset."*

The first three occurrences of "report right, code wrong" were documentation drifting from code.
This one is different and worse: **a completion claim that was false about work never performed.**
It was caught by accident — you were building a golden dataset, not auditing the claim.

P0.1's sweep test handles verification records contradicting the code. It does not handle this.
So add the missing discipline, and apply it retroactively:

## 0.1 Claims are verified against the diff, not the narrative

For every item reported complete from here on — and for **every P0 item in the report you just
sent** — verify against the actual change, not against the statement that it was done:

- `git diff` shows a change to the named file, in the named function.
- A test exists that fails when that change is reverted. If reverting the fix doesn't break a
  test, the fix is unverified regardless of what any report says.
- The before/after measurement was taken on the current code, not carried forward from an earlier
  run.

**Retroactive pass required.** Re-verify all six P0 items this way and report which, if any, were
partially or not actually applied. I am specifically asking you to check your own report. The
AI-11 case proves the failure mode is live in this workspace, and the two detectors that went
unfixed sat in a report that read as complete.

## 0.2 Any interrupted or delegated work is unverified by default

If a background agent, a parallel session, or an interrupted run produced part of a change, treat
its output as **a proposal, not a result**, until you have confirmed it against the diff and a
reverting test. Note in `IMPLEMENTATION_LOG.md` which parts of this project were produced that way
and which have been independently confirmed.

You already flagged a "separate, parallel session" modifying files during Chunk 9's Part B. That
observation and this one are the same risk. Reconcile it now, before QA sees a build assembled
from work nobody verified end to end.

---

# PART 1 — TWO NEW DEFECT CLASSES, BOTH FOUND BY YOU, BOTH NEEDING SWEEPS

The method that has worked all project: a defect found in one place is a defect *class*, and the
class gets swept across all 30. Two more qualify.

## 1.1 Coverage tests that are blind to what was never registered

Your finding: the 0.2 drift test only walks the registry, so it structurally could not see a
declaration that was never registered — `approverAuthorityDefinition` is a full `ControlDefinition`
rather than being built through the `notImplemented()` helper the drift test's coverage depends on.

**The class: any test whose coverage derives from a registry, a helper, or a decorator can be
bypassed by simply not using it.** These tests feel like guarantees and are not.

Sweep every such test in the codebase and ask of each: *what does a developer have to do to be
invisible to this test?* Then close the gap by walking the **source** rather than the registry —
the pattern you already use successfully in `safety.test.ts`, which greps files rather than
trusting registration.

Specific ones to check, at minimum:
- The `internal_state` tool test — can a tool write to `models/ai/**` without being tagged?
- The "no ORM writes in workflows" grep — does it cover every write method and every alias?
- The "every workflow writes a learning record" test — does it enumerate the registry, or the
  workflow directory?
- The capability-registry drift test — now fixed for one gap; are there others?
- The autonomy-clamp test — does it cover every workflow, or every *registered* workflow?

## 1.2 Wall-clock dependence

Your finding: the first point-in-time implementation compared calendar month against wall-clock
`now` instead of the tenant's close status, and **silently broke five previously-passing test
files as the sandbox's clock advanced.**

That is a test suite that passes today and fails next month, in a system whose entire domain is
periods and dates. It is also the exact failure a test team will hit — they will run this in a
different month than you built it.

**Sweep for:** any use of `new Date()`, `Date.now()`, `moment()` or equivalent inside workflow
logic, and any test whose outcome depends on the current date. For each:
- **Logic:** should it use the tenant's period state, an event timestamp, or a passed-in "as at"
  date instead of wall clock? Almost always yes. Wall clock is correct only for "when did this run
  happen", never for "which period does this belong to."
- **Tests:** pin the clock. Every date-dependent test should set an explicit reference date, not
  inherit today's.

Then prove it: **run the full suite with the system clock set to three different dates** — the 1st
of a month, the 31st of a 31-day month, and 29 February of a leap year. All three must pass. If
that is impractical in the sandbox, inject the reference date rather than the system clock, but
run all three.

This dovetails with Part A's timezone audit — do them together, one pass over every date
expression in the system, answering both questions at once: *is this the right clock, and is it
the right zone?*

---

# PART 2 — AMENDMENTS TO PART A'S AUDITS

Part A asked for two audits. Make it three, and merge the date work:

**`docs/ai/audits/TIME_AUDIT.md`** — replacing the planned timezone audit, covering both
questions in one table: file, line, expression, what it is deciding (period assignment? age? "is
it overdue"? run timestamp?), is it wall-clock when it should be tenant-period or event-time, is
it timezone-correct for the tenant's configured zone, and the test that pins it.

**`docs/ai/audits/FAILURE_MODES.md`** — as specified, unchanged.

**`docs/ai/audits/COVERAGE_GAPS.md`** — new, from 1.1: every test that claims broad coverage, what
it actually walks, what could hide from it, and how that was closed.

---

# PART 3 — SMALL THINGS FROM YOUR REPORT, WORTH CLOSING NOW

- **AI-22's golden dataset caught a real sign error during construction.** That is the single best
  argument for P0.6 having been worth doing, and it is worth one line in the handover: golden
  datasets found a bug that 1,600 passing tests did not.
- **The duplicate-attention-item class is now closed across all 30** after finding the same shape
  in AI-05's two branches. Confirm the dedupe-key construction is now a **single shared function**
  rather than a convention — a convention will drift back. If two call sites can still build a key
  independently, make that impossible.
- **AI-11 and AI-29 upgraded to VERIFIED.** Update the verdict table and confirm the count:
  I make it 14 `VERIFIED` and 16 `VERIFIED-WITH-LIMITS`, with every remaining limit now a real
  product limit rather than a missing dataset. State the final numbers.

---

# PART 4 — THEN PROCEED, UNCHANGED

With Part 0 of this addendum and Part 1's two sweeps done, continue exactly as
`BRIEF-10-PRE-QA.md` specifies:

- **Part A** — the three audits above.
- **Part B** — demo tenant with planted findings, real metrics, performance table, product test
  through the real UI.
- **Part C** — `AI_Workflow_Test.md` and the SELFRUN log. The C.4 rule stands and is now
  reinforced by this addendum: every documented case executed and observed, never a softened
  expectation. Given 0.1, add one line to the SELFRUN log per case recording *how* it was observed
  — through the UI, through the route, or through a test — so the user can tell the test team
  precisely what "checked properly" covered.
- **Part D** — the pre-QA release check, with two additions:
  ```
  [ ] All six P0 items re-verified against the diff with reverting tests (0.1)
  [ ] Any work produced by an interrupted or parallel session identified and confirmed (0.2)
  [ ] Full suite passes at three pinned dates: 1st, 31st, and 29 Feb (1.2)
  [ ] No coverage test can be bypassed by not using its registry or helper (1.1)
  ```

---

# REPORTING

Fold this into the three reports already specified, but lead the first one with the retroactive
verification:

**Report 1 (after Part 0 of this addendum + Part 1's sweeps + Part A):**
1. The re-verification of all six P0 items against the diff — and honestly, whether any turned out
   to be partial. If they were all real, say so; if one wasn't, that is a more valuable finding
   than a clean answer.
2. What the interrupted/parallel-session reconciliation found.
3. The coverage-gap sweep: how many tests could be bypassed, and how each was closed.
4. The time sweep: how many wall-clock uses were wrong, and the three-date suite result.
5. The three audits.

Then Reports 2 and 3 as originally specified.

---

The AI-11 catch is the reason this addendum exists, and it is worth stating plainly: **you found it
because you were doing careful work on something adjacent, not because any check would have caught
it.** Everything else in this project has a test behind it. That one had a report behind it. The
difference between those two is exactly what the test team is trusting you to have sorted out
before the build reaches them.
