# COVERAGE_GAPS.md

Chunk 10a, Addendum A Part 2/1.1 (`docs/ai/BRIEF-10a-ADDENDUM.md`) — every test in this codebase
that claims broad coverage (walks a registry, a directory, or "every workflow/definition/tool"
rather than a single named case), what it actually walks, what could hide from it, and how each
real gap found was closed. The defect class this document exists to catch: **a coverage guarantee
that looks like it covers every case, but is actually blind to a case that never registered itself
the way the test expects** — the exact shape that let `approverAuthorityDefinition` (a hand-built
`ControlDefinition`, never routed through the `notImplemented()` helper the original drift test's
coverage depended on) evade detection for multiple chunks, and the same shape, one layer up, that
let an interrupted agent's commit message ("all four AI-11 detectors fixed") stand unchallenged
when only two were touched — nothing structurally compared the claim to the diff.

## Tests reviewed, with a real gap found and closed this pass

### 1. `periodHorizonValidationSweep.test.ts` — "every workflow using `period.horizon.reached`
either validates its payload or is on a source-verified inert allowlist"

- **What it actually walked**: `/\bPERIOD_PATTERN\b/.test(source)` — a substring search across the
  **entire file's text**, not scoped to `observe()`.
- **What could hide from it**: a workflow whose `observe()` no longer validates the payload (the
  exact AI-12 pre-fix shape: `String(event.payload.periodEnd)`, unvalidated) while the
  `PERIOD_PATTERN` constant remains declared elsewhere in the same file, unused — a dangling
  declaration, not evidence of validation. Confirmed by literally reverting AI-12's `observe()`
  body while leaving its `PERIOD_PATTERN` declaration in place: the old check still said "validated."
- **How it was closed**: scoped the check to `observe()`'s own brace-matched function body and
  required an actual call (`PERIOD_PATTERN.test(` / `isValidIsoInstant(`), not just the bare
  identifier appearing anywhere in the file. Verified via revert (fails on the reverted shape,
  passes restored) — `docs/ai/IMPLEMENTATION_LOG.md`, Chunk 10a Part 1.1 entry.

### 2. `aiMetrics.test.ts` — "`computeAndPersistTenantMetrics` writes one `AiMetricSnapshot` per
registered workflow"

- **What it actually walked**: `results.length` (the function's own return value) compared against
  `AiMetricSnapshot.countDocuments(...)` — a **count-only** comparison.
- **What could hide from it**: a bug that wrote a snapshot under the *wrong* `workflowId` (a typo, a
  stale id, or — as literally injected during verification — accidentally overwriting AI-01's row
  instead of AI-30's) while silently skipping a real workflow. The count stays exactly `30` either
  way, so the old assertion stays green.
- **How it was closed**: now compares the actual **set** of stored `workflowId`s against
  `listWorkflows()`'s ids, plus a no-duplicate-id check. Verified by temporarily redirecting AI-30's
  write to AI-01's id: the old count-based assertion stayed green; the new set-based one failed
  correctly. Restored and re-verified clean.

## Tests reviewed, found already robust against this class (no gap)

### 3. `safety.test.ts` — "no ORM write-method imports in `lib/aiRuntime/workflows/**`"

Walks a **directory-wide `grep`** over every file under that path, not an enumerated/registered
list — a new workflow file added tomorrow is swept automatically, since the check is "does this
byte pattern appear anywhere in this directory tree," not "does this registered thing look clean."
Nothing can silently opt out of a directory grep the way `approverAuthorityDefinition` opted out of
a helper-function-driven registry walk. No gap.

### 4. `safety.test.ts` — "every `internal_state`-category tool writes only to `Ai*`-prefixed models"

Walks `listTools().filter(t => t.category === "internal_state")` — the **live tool registry**
itself, not a hardcoded array duplicating it — then requires a `handlerLocations` entry for each
one found, with `expect(loc, ...).toBeDefined()` failing loudly if a new `internal_state` tool is
added without one. A tool that changes category away from `internal_state` is correctly no longer
checked (correct removal, not a silent gap). The one residual risk — a `handlerLocations` entry
pointing at a stale/dead function while the tool's real registered handler moved elsewhere — is
mitigated by the same `expect(anchorMatch, ...).not.toBeNull()` failing loudly if that function no
longer exists under that name. Reviewed and accepted; no gap closed here because none was found.

### 5. `capabilityRegistryDrift.test.ts` — the registry's own internal-consistency checks

This file only ever walks `CAPABILITY_REGISTRY` and `getWorkflowGaps()` — by its own doc comment,
it explicitly cannot notice a declaration that was never added to the registry at all (exactly
`approver_authority`'s gap). That gap is closed by a **different, complementary** file —
`capabilityRegistryCoverage.test.ts` (built Chunk 10 P0.4) — which walks the *other* direction:
every `CONTROL_DEFINITIONS`/`RECONCILIATION_DEFINITIONS` entry with a non-`"implemented"`/non-null
status must have a matching, same-status `CAPABILITY_REGISTRY` entry. Together the two directions
close the loop; reviewed this pass for any *further* gap beyond `approver_authority` and found none
in either direction as currently written.

### 6. `aiLearningLoop.test.ts` — "every registered workflow is registered in the runtime"

Walks `listWorkflows()` against a hardcoded `AI-01`...`AI-30` loop — registry-driven in the correct
direction (a workflow that failed to register itself would fail this test), not blind to
non-registration. Named limitation, not a gap in this class: it proves the id exists in the
registry, not that the workflow does anything correct when actually triggered — that assurance
comes from each workflow's own test suite, not this smoke check, and was never claimed to.

### 7. Autonomy-clamp test (`safety.test.ts`, "`RECOMMEND` caps a workflow that declared `EXECUTE`")

A synthetic, single freshly-`registerWorkflow()`-ed test workflow exercising the executor's clamp
mechanism directly — it makes no "every workflow" coverage claim to begin with, so there is no
registry-walk to be blind about. Not in scope for this class.

## Real gaps named, not closed this pass (honest, not silently retried into a clean log)

### 8. "Every workflow produces exactly one `AiLearningRecord` when it proposes something" —
no such sweep exists

The closest thing on record is `aiLearningLoop.test.ts`'s two individual case tests (`AI-00-SMOKE`
and `AI-07`, chosen because AI-07 resolves its own record inline via `ActResult.learningOutcome`) —
neither is a registry-driven walk across all 30 workflows. A workflow that silently stopped calling
into the executor's learning-record path (or a future 31st workflow that never wires it up) would
not be caught by any existing test. **Not closed this pass** — building a genuine registry-driven
sweep (one synthetic proposal per workflow, asserting exactly one `AiLearningRecord` per run) is
real, scoped work belonging to a future chunk, not a same-day fix alongside the six items above.

### 9. `annotateStatement()` (`lib/aiRuntime/statements/annotateStatement.ts`) has no test calling
it for a period distinct from "now"

This is the single most consequential gap this whole addendum surfaced, and it is named plainly:
both real bugs found in the Part 1.2 wall-clock sweep (`checkAccrualsDomain`/`checkPrepaidsDomain`'s
wall-clock staleness check, and `lib/accounting/reports.ts`'s `toDateEnd()` timezone bug) were
reachable **specifically** through `annotateStatement()` computing readiness/reports for a
historical `period` — yet every existing test for AI-18 and AI-21 (the two callers) only ever
exercises the *current* period, because that is what their own fixtures happen to construct
`event.payload.period` from. Nothing in the existing suite ever asked "what does this look like for
last quarter, computed today?" **Partially closed**: the two underlying functions now have direct,
targeted regression tests (`closeReadinessAccrualsPeriodScoping.test.ts`,
`reportsToDateEnd.test.ts`) that exercise exactly the historical-vs-current divergence. **Not
closed**: no test yet calls `annotateStatement()` itself end-to-end for a genuinely historical
period and asserts on its real output — the integration path that made both bugs live in production
remains untested at that level. Left for a future chunk rather than expanded scope under this pass.

### 10. Golden datasets' "100% pass rate" is bounded by construction, not exhaustive — already
honestly caveated, re-confirmed here

Reviewed for this document's own class of gap: a golden dataset's pass-rate claim only ever covers
the cases someone thought to author. `docs/ai/GOLDEN_DATASETS.md` already states this per-workflow
rather than implying exhaustiveness — re-confirmed accurate this pass, nothing to close.

### 11. `capabilityRegistryCoverage.test.ts` and `capabilityRegistryDrift.test.ts` together cannot
verify that a `status: "implemented"` declaration is actually true

Both tests check **internal consistency** between two hand-maintained sources (the definition
object's own `status` field and the registry's mirrored entry) — neither has any way to verify that
a control genuinely marked `"implemented"` in its own source file is honestly so. That assurance
can only come from a workflow's golden dataset or verification record actually exercising the
behavior and finding it correct (as AI-22's golden dataset did, catching a real sign error during
construction — the single best evidence this class of check has limits that only real test data can
close). Named as an accepted structural limit of registry-consistency checking in general, not a
bug — no fix is possible at the registry-check layer itself.

## Summary

- **2 coverage tests found genuinely blind to non-use and fixed**, each verified via a real revert:
  `periodHorizonValidationSweep.test.ts` and `aiMetrics.test.ts`'s snapshot-per-workflow test.
- **5 coverage-claiming tests reviewed and found already robust** against this specific class (the
  five named in `docs/ai/BRIEF-10a-ADDENDUM.md` Part 1.1): the no-ORM-writes grep, the
  `internal_state` tool test, the capability-registry drift test (closed in a prior chunk via its
  complementary coverage test), the workflow-registration smoke test, and the autonomy-clamp test.
- **2 real gaps named and left open**, honestly, rather than papered over: no registry-driven sweep
  proves every workflow writes its own learning record, and `annotateStatement()` has no direct
  test for a historical period despite being the exact path that made this pass's two real bugs
  reachable in production.
- **1 structural limit named**: registry-consistency checks can never verify that a definition's own
  `"implemented"` claim is true — only real test data (golden datasets, verification records) can.
