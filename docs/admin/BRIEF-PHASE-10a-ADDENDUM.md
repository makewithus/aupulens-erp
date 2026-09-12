# AUPULENS — PHASE 10, ADDENDUM A
# Read alongside `docs/admin/BRIEF-PHASE-10-FINAL.md`. Parts 2–9 of that brief still stand.

> Report A accepted. The scheduler is the right shape — opportunistic execution scoped strictly to
> `/api/platform/**` traffic was the correct boundary, and finding one genuinely-incorrect job
> (stale rollup silently shown as current) is exactly what the read-time-correctness audit was for.
>
> **But one of the AI-29 root causes is not a bug in AI-29. It is a bug in the runtime that affects
> an unknown number of the thirty workflows, and it defeats a Hard Rule.** Part 0 before Part 2.
>
> Save this to `docs/admin/BRIEF-PHASE-10a-ADDENDUM.md`.

---

# PART 0 — THE KILL-SWITCH BYPASS IS A CLASS, NOT AN INCIDENT

## 0.1 What you found

> *"a kill-switch bypass — OBSERVE-level workflows are exempted from the kill switch by
> `eventBus.ts`'s dispatch gate on the assumption they never have side effects, but AI-29 does
> write."*

That assumption is baked into the runtime's dispatch gate, and it is wrong for at least one
workflow. The AI project's Hard Rule 6 requires **every autonomous workflow** to have a working
kill switch. If an `OBSERVE`-declared workflow writes anything and is exempt from that gate, then
turning its kill switch off does not stop it — and an operator who flips it believes it has.

This is the same shape as two defects that project already found and fixed: `act()` running for a
`NEVER_AUTONOMOUS` action, and `maxAutonomyLevel` being stored but never consulted. In both cases
a control existed, looked enforced, and wasn't. **A control that silently doesn't hold is worse
than an absent one**, because nobody compensates for it.

## 0.2 The sweep — do this before anything else in Phase 10

Enumerate **all thirty AI workflows** from the registry — not a hand-written list — and for each
record in `docs/ai/audits/KILLSWITCH_AUDIT.md`:

| Workflow | Declared autonomy | Does it write anything? | What does it write? | Exempt from the dispatch gate? | Verdict |
|---|---|---|---|---|---|

"Writes anything" includes `internal_state` writes — `AiAttentionItem`, `AiCloseAssertion`,
`AiControlResult`, `AiEvidencePack`, `AiSchedule`, `AiLearningRecord`, `AiPaymentHold`, and the rest.
AI-29 was caught because it writes control results; the same is plausibly true of AI-13 and AI-24
(close state and assertions), AI-15 (anomaly records), AI-18 (evidence packs) and AI-27 (holds) —
every one of which is `OBSERVE` or `RECOMMEND`.

**Then fix it structurally, not workflow by workflow.** The exemption should not be based on the
*declared autonomy level* — it should be based on whether the workflow can write at all. Two
changes:

1. Change the dispatch gate so the kill switch applies to **any workflow that registers a write
   tool of any kind**, regardless of declared level. Read-only workflows may keep the exemption.
2. Add a structural test, in the style of the source-grep tests that have already caught real
   problems in this codebase: **a workflow that can reach a write tool cannot be exempt from the
   kill-switch gate.** Assert it over the registry, so a thirty-first workflow cannot reintroduce
   this.

## 0.3 Check whether the same exemption defeats the autonomy clamp

The clamp (`decideAutonomy()`'s `min(declared, policy, hard ceiling)`) was a foundation fix in that
project's Chunk 4. If `eventBus.ts` short-circuits dispatch for `OBSERVE` workflows *before* the
clamp runs, then a policy-forced clamp on one of those workflows may also never be evaluated.

You already found and fixed a closely related bug — the OBSERVE/RECOMMEND short-circuit being
applied to the clamped level instead of the declared level, suppressing escalation. **Check whether
the dispatch-level exemption has the same problem at a different layer.** Report either way; a
clean answer here is worth having on record.

## 0.4 Report this separately and immediately

This is AI-runtime, not Global Admin. Put it in its own `[AI-runtime]` commit, cherry-pickable like
your other three, and report it on its own rather than folding it into Report B. Your user needs to
know that a Hard Rule was not holding across an unknown number of workflows and now is.

---

# PART 1 — TWO OF THREE WERE TEST BUGS. THAT HAS AN IMPLICATION.

AI-21's failure was a test constructing a contradictory scenario. AI-07's was a stale query path
(`proposal.basis` instead of `proposal.accrualAccuracy.basis`). Both were asserting things the
product does not and should not do.

That is worth a moment, because those tests were part of a suite used to sign off thirty workflows.
A test asserting the wrong behaviour is invisible while it passes and only surfaces when something
adjacent changes — as happened here.

**The golden datasets are the independent check, and they exist for exactly this.** They assert
known-correct answers rather than implementation behaviour, so a test with a wrong expectation
will disagree with them. Run the full golden-dataset suite across every workflow that has one, and
report the pass rate. If any dataset disagrees with a passing unit test, the unit test is the
suspect.

This is one command and a report, not an investigation. If it comes back clean, that is a genuinely
useful thing to be able to say in the handover.

---

# PART 2 — THE CRM SLA-BREACH ITEM: DO NOT FIX IT

You flagged CRM's SLA-breach display as a second genuinely-stale-not-merely-stale case, identified
but not fixed. **Correct call — leave it.**

It is tenant-facing CRM code, outside this brief's additive-only scope, and it has been in this
state since 5 September regardless. Fixing it would mean changing an existing feature nobody has
asked you to touch, in a module you have no test coverage over, in the final phase before handover.

What to do instead:
- Record it in `SCHEDULED_WORK.md` with the precise behaviour: what a user sees, and how wrong it
  can be.
- Make sure the **Scheduled Jobs panel surfaces `crm/sla-check` staleness clearly**, so an operator
  looking at the platform can see the SLA data is not current. That is the honest mitigation and it
  costs nothing.
- Add it to the final report's open list as a recommended follow-up for whoever owns CRM, with the
  fix shape described.

---

# PART 3 — THE FOURTH CLAIM FAILURE

> *"my best evidence says it most likely did not hold at the time — this is the fourth documented
> case in this project of a stated completion claim not surviving a check."*

Four is a pattern worth writing down properly, because it is the most transferable lesson either of
these projects produced. Add a short section to `docs/ai/README.md` or `DECISIONS.md`:

**The four cases**, one line each: the AI-11 detectors reported fixed when two were untouched; the
`docIntel` gap documented with the wrong reason; the unstaged file that made the suite pass against
uncommitted code; and the 2026-09-04 "1325/1325 passing" claim that did not hold.

**The two checks that now prevent them**: a fix counts as done only when reverting it breaks a
test, and a phase counts as done only when a fresh worktree of the committed HEAD builds and
passes. Both already in place — say so, so whoever inherits this knows why the checks exist rather
than quietly dropping them as ceremony.

That section is worth more to the next engineer than another paragraph of architecture.

---

# PART 4 — THEN PROCEED, UNCHANGED

With Part 0's sweep done and reported, continue exactly as `BRIEF-PHASE-10-FINAL.md` specifies:

- **Part 2** — Groups C and D: §3 list columns, §7's four tabs, §24's eighteen KPIs and six panels,
  §18 filters, §25 IP/device and privileged confirmation, §31 security log view, §28 mass-data-export
  alert, capability-denial volume check.
- **Part 3** — the verification sweep. Every coverage-matrix row against the five-point standard,
  the nine cross-phase integration checks, the edge cases, and the adversarial question per area.
  **This is still the most important part of the phase.** Fix every failure it finds.
- **Part 4** — release gates: the UI regression scan (still never run), the route-by-route API
  diff, `INTEGRATION.md`, clean tree plus fresh worktree, full suite and production build.
- **Part 5** — QA handover: extend the test document to every new surface, re-run every case in a
  real browser, known limits in plain English including the scheduling situation.

Part 9's to-do list stands. Add Part 0's sweep, the golden-dataset run, and the Part 3 README
section to it now, at the top.

---

One observation, since the finish is in sight.

The kill-switch finding came out of fixing a test failure in a workflow nobody suspected of having
a runtime-level problem. That is the third time in this programme that the real defect was one
layer beneath the reported symptom — the `act()` fail-open, the dead `maxAutonomyLevel`, and now
this. **When a specific workflow misbehaves, it is worth one question about whether the runtime
let it.** That instinct has now found three controls that looked enforced and weren't, and it is
the single most valuable habit either of these projects has built.
