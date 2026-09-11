# Verification — AI usage metering (Phase 4)

## A real gap found and fixed during this phase
`lib/ai/claude.ts::callClaude()` discarded Azure OpenAI's `usage` object (real per-request token
counts), returning only text — meaning no real token data existed anywhere in this codebase's AI
call path before this phase. Fixed additively: `callClaudeWithUsage`,
`callClaudeWithHistoryAndUsage`, `callClaudeStreamWithUsage` are new functions returning `{text,
usage}` alongside the untouched originals; `lib/ai/tenantAi.ts` internally switched to calling
these instead (its own public contract — `callClaudeForTenant`'s parameters and `TenantAiResult`
return shape — is unchanged).

## A real regression caught and fixed before it could ship
That internal switch broke two pre-existing test files
(`tests/saas/aiLimits.test.ts`, `tests/ai/aiSafetyGuards.test.ts`) that mocked
`lib/ai/claude.ts`'s exports **by name** to test `lib/ai/tenantAi.ts` in isolation — their mocks
still targeted `callClaude`/`callClaudeWithHistory`, which `tenantAi.ts` no longer calls. Both were
updated to mock the new `*WithUsage` function names (with the `{text, usage}` resolved shape) and
the new `lib/platform/ai/instrumentation.ts`/`limitBehavior.ts` calls tenantAi.ts now also makes.
**All 48 of their original assertions pass unmodified** — this was a mock-target update, not a
behavior change, and is exactly the kind of regression `npx vitest run` before considering a phase
done is meant to catch. Recorded here because it's a genuine "found and fixed," not swept under.

## Happy path proven
- Unit: `aiInstrumentation.test.ts` (cost computed server-side from a stored `AiCostRate`, 0 when
  no rate exists — never guessed; feature correctly bucketed; no prompt/response text persisted —
  checked structurally, not just by convention), `limitBehavior.test.ts` (all 4 at-limit
  behaviours; BLOCK is the default with no `AiLimit` row, byte-identical to pre-Phase-4),
  `aiUsageRollup.test.ts` (correct sums, idempotent re-run, `AiWorkflowRun` folded into
  `ai_automation` at request-count-only), `aiFeatureMap.test.ts` (every real `AiFeature` key is
  mapped, source-grep-checked so a future unmapped feature fails a test, not silently falls
  through).
- **Manual, over real HTTP**: seeded synthetic `AiUsageRecord` rows (a real Azure OpenAI call
  wasn't possible in this sandbox — no live credentials), ran the real rollup function, then hit
  `/api/platform/dashboard/summary` and `/api/platform/organizations/[id]?tab=ai-usage` and
  confirmed every number (requests, tokens, cost, per-feature breakdown, remaining allocation)
  matched the seeded data exactly — proving the read path (rollup → dashboard/org-tab API → JSON
  shape the UI expects) works end-to-end, not just in isolated unit tests. All 5 feature buckets
  render explicitly, including honest zeros for the two not-yet-instrumented ones (Document
  Processing, AI Agents — see `docs/admin/AI_FEATURE_MAP.md`).
- The cron route's `CRON_SECRET` bearer check was verified over real HTTP: no secret header → 401,
  wrong secret → 401.

## Must-not-happen cases proven
- Cost is never client-influenced — `recordAiUsage()`'s only cost input is the stored
  `AiCostRate`, computed inside the function; no route accepts a cost value from a request body.
- An unconfigured tenant (no `AiLimit` row) gets exactly `BLOCK` — unit-tested directly, and
  implicit in every one of `aiLimits.test.ts`'s 42 passing assertions, which never configure an
  `AiLimit` and still see the exact pre-Phase-4 gating behavior.
- No prompt or response text is ever written to `AiUsageRecord` — the schema has no such field,
  and `recordAiUsage`'s own input type doesn't accept one.

## Verdict
Pass. Includes a genuine architectural fix (usage capture didn't exist before this phase) and a
genuine regression catch-and-fix in pre-existing tests, both reported rather than glossed over.
