# PHASE-4-plan.md — AI metering

## Existing code this phase calls (from `CAPABILITY_MAP.md`)
- `lib/ai/tenantAi.ts::callClaudeForTenant()` / `callClaudeForTenantStream()` — the one real
  chokepoint every tenant-facing AI call already goes through. New instrumentation is added calls
  at the exact point `incrementAiUsage`/`incrementGlobalAiUsage` already fire (after a successful
  response) — additive, never replacing the existing coarse counter (`models/admin/AiUsage.ts`
  keeps working exactly as before; nothing currently reading it breaks).
- `models/ai/AiWorkflowRun.ts` (`metrics{scanned,matched,exceptions,autoActioned,policy_overrides}`)
  — read (never written) by the rollup job as the "AI Automation"/"AI Agents" feature-bucket
  source, per the brief's own instruction.
- `lib/ai/featureLimits.ts`'s `AiFeature` keys — the vocabulary for the feature-bucket mapping
  (`docs/admin/AI_FEATURE_MAP.md`, required by the brief).
- The existing Vercel-cron pattern (`app/api/cron/<domain>/<name>/route.ts` + `CRON_SECRET`) — the
  rollup job follows it exactly, added as `app/api/cron/platform/ai-usage-rollup/route.ts`.

## New models
- `models/platform/AiUsageRecord.ts`: one row per AI request — `{tenantId, feature, model,
  inputTokens, outputTokens, estimatedCostUsd, latencyMs, status: "success"|"error", requestId,
  createdAt}`. **Never stores prompt/response bodies** (Hard Rule 9) — token counts and a request
  ID only.
- `models/platform/AiUsageDaily.ts` / `AiUsageMonthly.ts`: rollups — `{tenantId, period, feature,
  requestCount, inputTokens, outputTokens, estimatedCostUsd, errorCount}`, one document per
  `{tenantId, period, feature}`, computed by the cron job, never written per-request (dashboards
  read these, never `AiUsageRecord` directly at read time, per the brief's own load-time warning).
- `models/platform/AiCostRate.ts`: `{model (unique), inputCostPerMillionTokens,
  outputCostPerMillionTokens, effectiveFrom}`. Cost is computed **server-side from these stored
  rates only** (Hard Rule/§33) — never a client-sent value, never hardcoded per call site.
- `models/platform/AiLimit.ts`: `{tenantId (unique), monthlyCreditsUsd?, dailyCreditsUsd?,
  maxRequestsPerMonth?, maxTokensPerMonth?, maxCostUsdPerMonth?, atLimitBehavior: "BLOCK" |
  "THROTTLE" | "ALLOW_WITH_OVERAGE" | "ALLOW_AND_LOG"}`. Absent row = `BLOCK` at the pre-existing
  tier cap, i.e. **exactly today's behaviour** — a tenant with no `AiLimit` row sees zero change
  (Hard Rule: "keeping BLOCK as the default so nothing changes for existing tenants until an admin
  changes it").
- `models/platform/AiOverageConfig.ts`: `{tenantId (unique), enabled, ratePerCreditUsd, softLimitUsd,
  hardLimitUsd, alertThresholds: number[]}`.

## `lib/platform/ai/`
- `instrumentation.ts`: `recordAiUsage(params)` — called from `tenantAi.ts` right after a
  successful response, wrapped so a metering failure **never** throws back into the AI call itself
  (matching `emitPlatformAuditEvent`'s own defensive shape). Computes cost server-side via
  `AiCostRate`.
- `limitBehavior.ts`: `resolveAtLimitDecision(tenantId, currentUsage, cap)` returning one of the 4
  behaviors' effects — extends `tenantAi.ts`'s existing `AI_LIMIT_REACHED` branch to call this
  instead of always blocking. `BLOCK` (today's only real behavior) stays the literal default when
  no `AiLimit` row exists — proven by a test that an unconfigured tenant's behavior is
  byte-identical to pre-Phase-4.
- `rollup.ts`: aggregates `AiUsageRecord` into `AiUsageDaily`/`AiUsageMonthly` for a given period —
  idempotent (safe to re-run for the same period, upserts not appends).
- `featureMap.ts`: maps each real AI entry point to one of the 5 source-doc §14 buckets (AI
  Assistant, Document Processing, AI Automation, AI Reports, AI Agents) — documented in
  `docs/admin/AI_FEATURE_MAP.md` per the brief's own instruction, not guessed at read time.

## `app/api/cron/platform/ai-usage-rollup/route.ts`
Follows the existing cron pattern exactly (`CRON_SECRET` bearer check), added to `vercel.json`.

## Platform UI
`/platform/ai-usage`: platform-wide dashboard (§13 — total requests, tokens, cost, top
orgs/features/models, all from rollups) and a per-organisation AI tab (§14) replacing Phase 2's
honest "not yet available" placeholder now that real data exists.

## Tests
`instrumentation.test.ts` (cost computed server-side from stored rates, never a client value;
never stores prompt/response text), `limitBehavior.test.ts` (all 4 behaviors; unconfigured tenant
byte-identical to pre-Phase-4 BLOCK), `rollup.test.ts` (idempotent re-run produces the same
totals, not doubled), `featureMap` is a static mapping table checked by a source-grep test that
every `AiFeature` key in `lib/ai/featureLimits.ts` has an entry.

## Exit gate
Real usage from a real `callClaudeForTenant()` call appears in a rollup within one cron cycle; cost
is computed server-side; all four at-limit behaviors are tested; BLOCK remains the default for
every tenant with no `AiLimit` row (byte-identical to today).
