# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 7 of 8 — BATCH F: AUDIT, JOURNAL REVIEW & CONTROL MONITORING
# (AI-18, AI-23, AI-29)

> **Prerequisite met.** Chunk 6 accepted: 1229/1229 green, 22/30 built, and **AI-13's permanent
> `not_checked` domains are now zero** — which was the point of the whole tax projection exercise.
> The route you took there was right: flipping AI-22's `tax` definition closed AI-13's gap without
> touching AI-13 at all, because `checkTaxDomain()` was already wrapping whatever the definition
> returned. That is the composition working as designed.
>
> Your AI-20 recommendation — parent/child entity inside one tenant, built only when a real tenant
> asks — is **accepted as the product decision**. Record it in `docs/ai/DECISIONS.md` (create the
> file) so it is not re-litigated in six months.
>
> Save this file to `docs/ai/BRIEF-07-BATCH-F.md`.
>
> This is the second-to-last batch. After it, 25 of 30 are built.

---

# PART 0 — CARRY-FORWARD AND TASK 0

## 0.1 Stop running the UI scan against a dev server

239 routes × 5–80s of first-time Next.js compilation is not a regression harness, it is an
endurance test, and a check that takes an hour will eventually get skipped. Your independent
evidence for Chunk 6 (clean project-wide `tsc`, 1229 passing, additive-only dependency audit
showing no consumer outside the AI-operations surface) is accepted for that chunk. Report the
literal scan result when it lands, then change the harness.

**Fix:** run the scan against a **production build** — `npm run build:local` then `npm run start`
— not `next dev`. Compilation happens once, at build time; every route then serves pre-compiled.
Keep the warm-up pass as a safety net. Expect the whole scan to drop to a few minutes.

If the production build itself is too slow to run per chunk, fall back to a **targeted scan**: the
routes whose modules appear in the branch diff's import graph, plus a fixed sample of twenty
unrelated routes as a canary. Document whichever you choose in `docs/ai/UI_REGRESSION.md` so the
next person knows what "zero diffs" actually covered.

## 0.2 Record the eslint baseline once, formally

~18.8k pre-existing repo-wide errors, concentrated in a generated data file's repeated
`@ts-ignore` and one legitimate pre-existing `require()` in `safety.test.ts`. That is a
`BASELINE_FAILURES.md`-shaped fact and it should live in the same place, not be re-derived and
re-explained every chunk. Add an **eslint baseline** section there: the count, the two known
sources, and the standing rule — *clean on every file this work touches; repo-wide count must not
increase.*

## 0.3 A real gap your tax fixture exposed: `not_applicable` is hiding a blocker

Your clean-period fixture returned `ledger: not_applicable` because no `TaxRate.accountId` was
configured, while the projection carried ₹180 of real tax. **That combination is not
`not_applicable` — it is a blocker.** Tax transactions exist and there is no control account to
reconcile them against, which means nobody can ever prove the tax ledger is right.

Chunk 4's A.1 rule was that `not_applicable` and `not_checked` must be distinguishable from
`ready`. Extend it: **`not_applicable` is only valid when the underlying population is empty.**
A non-empty population with missing configuration is `blocked`, with the reason
`configuration_missing` and the specific setting named.

Audit every domain and every reconciliation definition for this pattern and fix each one. I would
expect the same latent bug in inventory (Chunk 5's `asset_current` bucket question) and possibly
payroll. This is exactly the false-completion vector Part 9 item 6 forbids, and it is worth doing
before AI-29 starts testing controls against domain states.

## 0.4 `check_sod` is still the Chunk 1 stub — AI-29 makes it partly real

`OPEN_QUESTIONS.md` has carried this since Chunk 1: `check_sod` returns "no conflict" with nothing
behind it. AI-29 is the workflow that owns segregation of duties, so it fixes what the data
supports and honestly declares the rest.

- **Buildable now:** preparer ≠ approver on a `JournalEntry`, using `approvalDetails`. Make
  `check_sod` real for this case.
- **Not buildable:** conflicting *permission combinations* held by one user. That needs a
  role-conflict matrix which does not exist anywhere. Declare `not_implemented` with that reason,
  and note what a matrix would need to contain.

A tool that silently returns "no conflict" is worse than one that says "I cannot check this."

## 0.5 Deliver the finding Chunk 4 deferred to you

Chunk 4's A.2 said: `PeriodClosing` and `TransactionLock` are not cross-wired — no code path ties
a close-status change to setting a lock — *report it as a control finding in AI-29 territory, do
not wire them.* AI-29 is now here. Ship it as a **control-design finding**: a period can be marked
`closed` while remaining postable. Evidence, severity by materiality of what could still post,
recommended remediation. **Still do not wire them** — that is a behaviour change requiring its own
decision.

---

# PART A — DECISIONS FOR THIS BATCH

## A.1 Autonomy: `OBSERVE` throughout. No exceptions, no new financial write tools.

This batch reads, scores, traces and reports. The only writes are `internal_state`: remediation
tasks, control results, evidence-pack records, and assertion outcomes.

New tools: `get_activity_log`, `get_decision_trace`, `build_evidence_pack`, `run_control_tests`,
`score_journal_risk`, plus `record_control_result` and `record_evidence_pack`
(`internal_state`). `check_sod` becomes real per 0.4.

## A.2 The citation rule is absolute, and it is a test

AI-18's single hardest constraint, from Part 3 of the original brief: **every factual claim in an
output must carry at least one `{model, id}` reference. A sentence with no citation must not be
emitted.**

Implement this structurally, not by prompting. The output type for an audit answer is a list of
`{claim_text, citations[]}` where `citations` is non-empty — make an uncited claim
*unrepresentable*, then assert it. If evidence does not exist, the correct answer is "no
supporting evidence found for X", which is itself a claim citing the *absence* — a search
performed, a population checked, nothing returned. That is still a citation to a query, not a
narrative.

**Never invent evidence** is not a tone instruction. An audit tool that produces one plausible
fabricated reference is permanently untrustworthy, and every real finding it ever produces
becomes suspect.

## A.3 AI-23 consumes AI-15's detectors; it does not rebuild them

Chunk 5 built nine detectors including a journal-pattern family, deliberately generic and reusable
"so AI-23 consumes them rather than duplicating." Hold to that. AI-23 adds the per-journal
**risk score and approval recommendation**; the pattern signals come from AI-15.

If a signal AI-23 needs isn't in AI-15's set, add it **to AI-15's detector registry** and consume
it — don't grow a second detector list inside AI-23.

## A.4 Controls follow AI-22's architecture: one engine, many definitions

AI-29 uses the same shape that worked for reconciliation: a `ControlDefinition` registry with
`{id, description, population(tenantId, period), test(item), severity, remediation_owner,
frequency}`. The engine is generic; each control is data plus two functions. Same
`not_implemented` honesty pattern, same reasons-in-output discipline.

This matters because controls are the thing a customer's auditor will ask to see the list of, and
a registry is inspectable while scattered if-statements are not.

## A.5 AI-18 must be able to audit the AI itself

Part 2.8 of the original brief: the decision trace store "is what AI-18 reads from." You built
`AiDecisionTrace` richly — inputs, context snapshot ref, model and prompt version, raw proposal,
confidence components, policy evaluations, tool calls with args and results, reason chains.

So AI-18 answers two classes of question, and the second is the one no traditional ERP can answer:
1. "Show me the support for this number" → source-to-report, via AI-21's `drillIntoAccount`.
2. **"Why did the system do this, who authorised it, and what did it consider?"** → the decision
   trace for any AI-touched record: which workflow, which version, what autonomy applied, what the
   gate decided and why, which tools ran, what a human changed afterwards.

Build the second properly. It is the thing that makes autonomous accounting auditable, and it is
the reason the audit trace requirement has been non-negotiable since Chunk 1.

---

# PART B — THE THREE WORKFLOWS

Order: **AI-18 → AI-23 → AI-29.** AI-29 consumes both.

---

## AI-18 — Audit / evidence intelligence

**Business meaning.** "Show me the support for this number." Trace any reported figure to its
sources and answer with citations to actual records. It never invents evidence.

**What you have.** `ActivityLog` (global), `CrmAuditLog`, `chatter[]` arrays,
`Invoice.sourceDocument`/`sourceId`, `ExtractedDocument` (with the file hash AI-01 added),
Cloudinary URLs, `AiDecisionTrace`, and AI-21's `drillIntoAccount` — which you deliberately left
callable. **Compose these. Build no new trace infrastructure.**

**Algorithm.**
1. **Source-to-report trace.** Given a report line, balance, or transaction: walk report → GL
   account → journal entries → source transactions → source documents → approvals → activity
   history. Reuse `drillIntoAccount`; extend it downward to documents and approvals rather than
   forking it.
2. **Evidence pack assembly.** For a balance or a period: the figures, the supporting records, the
   attached documents, the approvals, and the reconciliation results from AI-22 that support it.
   Persist as an `AiEvidencePack` (`internal_state`) so it is reproducible and citable later.
3. **Missing evidence detection.** A material balance with no supporting document; a journal above
   the approval threshold with no approval record; a bill with no attached source; a
   reconciliation with unexplained items. Each is a finding, and each feeds AI-24's assertions and
   AI-13's evidence domain — which you just brought to `checked`.
4. **AI decision trace retrieval** per A.5. For any record an AI workflow touched: which workflow
   and version, the trigger event, the context snapshot, the proposal, confidence components, the
   gate decision with which bound bound it, every tool call, the final outcome, and any subsequent
   human correction from the learning store.
5. **Natural-language audit answers** under A.2's citation rule. If the evidence does not exist,
   say so, citing the search performed.
6. **Sampling.** Select a risk-weighted or statistical sample from a population and assemble
   support for each item. Record the selection method and seed so the sample is **reproducible** —
   an auditor will ask you to re-run it.

**Autonomy.** `OBSERVE`. Read-only. Source-grep test proving no write path outside
`internal_state`.

**Expected output.** `{query, claims[{claim_text, citations[{model, id, label, url}]}],
evidence_pack{pack_id, figures[], documents[], approvals[], reconciliations[], decision_traces[]},
missing_evidence[], completeness_score, sample{method, seed, items[]} }`.

**Tests that must pass.**
- **Every claim carries at least one citation** — assert structurally, and assert an uncited claim
  cannot be constructed.
- A balance with a missing source document reports the gap rather than a plausible substitute.
- A question with no data in the system returns "not found" **citing the query**, never a
  narrative.
- The trace from a P&L line reaches actual document records, not just journal IDs.
- The decision trace for an AI-drafted bill returns workflow, version, autonomy applied, gate
  reasoning, tool calls, and the human's later edit.
- The same sample parameters and seed produce an identical sample twice.
- **False positive:** a fully evidenced, fully approved, fully reconciled balance produces zero
  `missing_evidence` entries.

---

## AI-23 — Journal review intelligence

**Business meaning.** Manual journals are where errors and fraud live. Every journal — human or
AI-created — is reviewed against how this tenant normally posts.

**What you have.** `JournalEntry.approvalRequired` and `approvalDetails` (real approval-chain
fields), the `voucherStatus` state machine, `AccountingSettings.journals.approvalThresholdAmount`
(real), AI-15's journal-pattern detectors, and `AiDecisionTrace` for AI-created journals.

**Review dimensions** — score each, using **this tenant's own history** as the baseline. A journal
that is unremarkable at one company is bizarre at another, and a global heuristic will be wrong
for most tenants.

- Unusual account combination for this tenant
- Amount outside the normal range for that account; round-number amounts
- Amount just under `approvalThresholdAmount` (the split-to-avoid-approval pattern)
- Posting date versus entry date gap; back-dating; weekend or after-hours entry
- Clustering in the final days of a period
- Thin or missing description; missing dimensions
- Missing supporting attachment proportionate to the amount
- Touching cash, revenue, reserves or equity
- **Preparer is also the approver** (via `check_sod`, now real per 0.4)
- Reverses a prior entry; reverses a reversal
- Posted by a user who rarely posts
- Repeated identical journals

**Algorithm.**
1. Pull pattern signals from AI-15 (A.3). Add tenant-baseline scoring on top.
2. Check evidence proportionality: is there support appropriate to the amount?
3. For AI-created journals, include the decision trace — an AI journal with a low-confidence
   proposal that a policy override let through should score higher, not lower.
4. Produce a recommendation: `auto_ok | review | escalate`, **with the specific reasons listed**.
   Never a bare score. "Risk 0.82" tells a reviewer nothing; "weekend entry, no description,
   credits revenue, preparer approved own entry" tells them everything.
5. Feed high-risk journals into the Attention tab and into AI-13's controls domain.

**Autonomy.** `OBSERVE` / `RECOMMEND`. **The workflow cannot post, approve, or alter
`voucherStatus`** — assert the raise. Posting continues to follow the existing journal policy and
approval chain untouched.

**Expected output.** `{journal_ref, risk_score, score_components{}, flags[{dimension, detail,
severity, baseline_comparison}], evidence_status, sod_verdict, ai_origin{workflow, run_id,
confidence, policy_overrides}|null, recommendation, reasons[]}`.

**Tests that must pass.**
- A routine recurring journal scores low and recommends `auto_ok`.
- A weekend manual journal to revenue with no description scores high and recommends `escalate`,
  with all three reasons named.
- Preparer = approver triggers an SoD flag through the now-real `check_sod`.
- An amount just under `approvalThresholdAmount` is flagged; the same amount well under it is not.
- An AI-created journal returns its decision trace in `ai_origin`.
- The workflow cannot post or approve at any confidence or policy setting.
- **False positive:** a normal, well-described, in-range, properly-approved journal produces zero
  flags. Run this against a fixture of a month of ordinary postings and assert near-zero output —
  the same discipline AI-15's year-of-normal-activity test enforces.

---

## AI-29 — Audit / control monitoring

**Business meaning.** Internal controls tested continuously instead of once a year. Detect
failures, collect evidence, assign remediation, and notice when the same control keeps failing —
because a control failing repeatedly is a *design* problem, not an incident.

**What you have.** `TransactionLock` (real, enforced), `JournalEntry.approvalRequired`/
`approvalDetails`, `ActivityLog`, `AccountingSettings` thresholds, AI-23's risk scores, AI-18's
evidence packs, AI-22's reconciliation statuses, AI-13's close state.

**Control definitions to register** (A.4's registry). Mark each `implemented` or `not_implemented`
with a reason — same discipline as AI-22's nine definitions.

| Control | Test | Data |
|---|---|---|
| `approval_present` | Every transaction above its threshold has an approval record | Real |
| `approver_authority` | The approver held sufficient authority | Partial — `lib/org/rbac.ts` roles; declare what it can't check |
| `sod_preparer_approver` | Preparer ≠ approver | Real, via 0.4 |
| `sod_permission_conflict` | No user holds a conflicting permission combination | `not_implemented` — no role-conflict matrix exists |
| `no_posting_into_locked_period` | No entry posted with a date inside a `TransactionLock` | Real |
| `closed_period_still_postable` | A `PeriodClosing` marked closed has a corresponding lock | **Real — this is 0.5's design finding** |
| `journal_documentation` | Journals above threshold have supporting evidence | Real, via AI-18 |
| `master_data_verification` | Sensitive master-data changes were verified | `not_implemented` — AI-19, Chunk 8 |
| `payment_against_approved_bill` | Payments trace to an approved, matched bill | Partial — declare the gap |
| `bank_detail_change_process` | Bank-detail changes followed the verified process | `not_implemented` — no change tracking; AI-19 |
| `override_logged` | Every `allowNonStandard` use is logged and reviewed | Real — Chunk 4's 0.3 made these visible |
| `access_change_authorised` | Role/permission changes were authorised | Partial via `ActivityLog`; declare the gap |

**Algorithm.**
1. Test every implemented control continuously. Record pass/fail **per instance**, not just per
   control — "approval control: 94% pass, 7 failures" is actionable; "approval control: fail" is
   not.
2. On failure: collect evidence via AI-18, classify severity by materiality, assign a remediation
   owner, set a due date, create the task (`internal_state`).
3. **Trend.** Failure rate over time, repeat failures of the same control, failures clustered by
   user or department. **A control failing above a configured rate over a minimum sample raises a
   `design_concern`** — worded as a process problem, not as an accusation about the people
   tripping it.
4. Produce a **control-testing evidence pack** an auditor can use directly: the definition, the
   population, the sample or full test, the results, the exceptions with evidence, and the
   remediation status.
5. Feed control health into AI-13's controls domain.

**Autonomy.** `OBSERVE`. Detection and task creation only. **Remediation cannot be self-closed by
the AI** — a control exception closes when the underlying condition clears or a human resolves it,
never because a workflow ran. Same rule as AI-13's blockers, and test it the same way.

**Expected output.** `{controls[{control_id, description, status: "implemented"|"not_implemented"|
"partial", reason_if_limited, population_size, tested, passed, failed, failure_rate,
exceptions[{ref, detail, severity, evidence[], owner, due, status}], trend[], design_concern,
design_concern_detail}], overall_control_health, evidence_pack_ref}`.

**Tests that must pass.**
- A transaction above threshold with no approval → exception.
- Preparer = approver → SoD exception.
- A posting dated inside a `TransactionLock` → exception (seed one directly).
- **A `PeriodClosing` marked closed with no corresponding lock → `design_concern`, and the periods
  are not wired together** (0.5).
- The same control failing across five consecutive runs → `design_concern` raised once, not five
  times.
- An `allowNonStandard` use appears in the override control's population.
- Remediation cannot be closed by the AI; re-running with unchanged data leaves it open.
- `not_implemented` controls appear in output with reasons and **do not count toward
  `overall_control_health`** — assert this, it is the false-completion vector again.
- **False positive:** a period with all approvals present, no lock violations and no SoD conflicts
  produces zero exceptions.

---

# PART C — CHUNK 7 STOP GATE

```
[ ] Chunk 6's UI scan literal result reported
[ ] UI harness switched to production build (or documented targeted scan) in UI_REGRESSION.md
[ ] eslint baseline recorded in BASELINE_FAILURES.md with the standing rule
[ ] DECISIONS.md created; AI-20 Option A recorded as the product decision
[ ] not_applicable audited everywhere: only valid on an empty population; non-empty + missing
    config = blocked/configuration_missing with the setting named
[ ] The tax-ledger case from your own fixture now returns blocked, not not_applicable
[ ] check_sod real for preparer≠approver; permission-conflict SoD declared not_implemented
[ ] AI-18: uncited claims are structurally unrepresentable (assert)
[ ] AI-18: "no evidence found" cites the query performed
[ ] AI-18: decision-trace retrieval answers "why did the system do this" for an AI-touched record
[ ] AI-18: sampling reproducible from method + seed
[ ] AI-18 reuses drillIntoAccount; no second trace implementation
[ ] AI-23 consumes AI-15's detectors; no second detector list
[ ] AI-23 recommendations always carry named reasons, never a bare score
[ ] AI-23 cannot post, approve, or alter voucherStatus (assert the raise)
[ ] AI-23 false-positive: a month of ordinary journals produces near-zero flags
[ ] AI-29 uses a ControlDefinition registry mirroring AI-22's architecture
[ ] AI-29 ships the closed_period_still_postable design finding without wiring the two models
[ ] AI-29: not_implemented controls excluded from overall_control_health (assert)
[ ] AI-29: remediation cannot be self-closed
[ ] design_concern raised once per persistent failure, not once per run
[ ] All three OBSERVE; no new financial write tools; internal_state only
[ ] False-positive test for each of the three
[ ] Full suite green; tsc clean; eslint clean on touched files; API surface diffed
[ ] All docs updated; 25/30 workflows BUILT
```

**Report back with:** the Chunk 6 UI scan result and the new harness timing; how many domains and
reconciliation definitions were reclassified by the 0.3 `not_applicable` audit and which ones; the
control registry with each control's status and, for the limited ones, exactly what it cannot
check; AI-23's flag count on a month of ordinary journals; AI-18's completeness score on a
realistic fixture; and whether the `closed_period_still_postable` control fired on your test data.

---

## A note on Chunk 8

The final chunk carries five workflows — **AI-11** (Inventory/COGS, whose spec you're still owed),
**AI-19** (master data, which unblocks four `not_implemented` checks accumulated across Chunks 5–7),
**AI-26** (accounting policy, which inherits the `smart-rules.ts` asset/liability gap and the
`asset_bank` landmine), **AI-27** (duplicates, extending AI-01's work), **AI-30** (ERP operations)
— plus the natural-language layer, the learning loop's evaluation machinery, and golden datasets.

That is too much for one message. **Chunk 8 will arrive in two parts:** 8a for the five workflows,
8b for AI-NL, learning and evaluation. Nothing for you to do about it now — but when you plan
Batch F, keep AI-18's evidence-pack builder and AI-29's control registry in shapes that 8b's
evaluation machinery can query, because measuring precision, override rate and automation coverage
across 30 workflows is going to lean on both.
