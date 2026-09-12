# AI_FEATURE_MAP.md — real AI entry points → source-doc §14 usage buckets

> Required by the brief: "map each existing AI entry point to one of these feature buckets and
> record the mapping, because the breakdown is meaningless if the buckets are guessed." The single
> source of truth for this mapping is code, not this document — `lib/platform/ai/featureMap.ts` —
> this file explains the reasoning behind each row and is checked against the code by
> `tests/platform/aiFeatureMap.test.ts` (fails if a real `AiFeature` key has no mapping).

## `lib/ai/featureLimits.ts`'s `AiFeature` keys → bucket

| `AiFeature` key | Real call sites (per `lib/ai/featureLimits.ts`'s own comments) | Bucket | Why |
|---|---|---|---|
| `chat` | Full conversational module assistant chat | **AI Assistant** | The canonical "talk to the assistant" surface. |
| `rag` | RAG / copilot answer grounded in retrieved context | **AI Assistant** | Still a direct user-facing Q&A interaction, just grounded. |
| `intent` | Command Center intent classification | **AI Assistant** | Backs the Command Center's natural-language input — part of the assistant interaction, not a separate report. |
| `draft` | Draft follow-up messages / correspondence | **AI Assistant** | User-initiated, interactive content generation. |
| `summary` | Call-note / conversation summaries | **AI Reports** | A generated artifact reviewed after the fact, not a live conversation turn. |
| `suggestion` | Lead scoring, deal risk, churn, win-probability, next-best-action | **AI Reports** | Analytical scoring/insight output, consumed as a report/badge, not a chat turn. |
| `anomaly` | Anomaly detection explanations | **AI Reports** | Same reasoning as `suggestion` — an analytical finding, not an interaction. |

## `lib/docIntel/` (vendor-bill extraction) → **Document Processing** — ✅ FIXED (Phase 9, Group B)

**Correction to this document's own earlier claim.** This row previously said `lib/docIntel/`
"doesn't go through `callClaudeForTenant`" and was therefore unmetered — that was checked directly
against the code during Phase 9 and found **incorrect**: `lib/docIntel/extractor.ts` has always
called `callClaudeForTenant` (confirmed by its own top-of-file comment, "Goes through
callClaudeForTenant so it respects the tenant AI kill-switch..."). The real gap was narrower and
genuinely small: no `feature` option was passed on that call, so every extraction defaulted to the
`"chat"` `AiFeature` key and was silently recorded under **AI Assistant**, indistinguishable from
an actual chat message.

Fixed by two small, additive changes: `lib/platform/ai/featureMap.ts::mapFeatureToBucket()` now
accepts a literal bucket name directly (not only a 7-key `AiFeature`), and
`lib/docIntel/extractor.ts` passes `feature: AI_USAGE_FEATURE_BUCKET.DOCUMENT_PROCESSING`
explicitly. Document Processing usage is metered from this point forward — historical extractions
made before this fix are permanently miscounted under AI Assistant (no backfill was attempted; the
underlying `AiUsageRecord` rows don't carry enough information to distinguish which ones were
really document extractions after the fact, and guessing would be worse than leaving history as it
genuinely was recorded).

## `models/ai/AiWorkflowRun.ts` (the AI runtime's 10-stage workflow executor) → **AI Automation** / **AI Agents**

The AI-workflows project's runtime (`lib/aiRuntime/`) is a separate system from `tenantAi.ts` —
its workflow runs never call `callClaudeForTenant()` directly for the metering-relevant path (they
have their own LLM call patterns inside `lib/aiRuntime/`). Rather than leave this bucket at a
permanent honest zero, the rollup job (`lib/platform/ai/rollup.ts`) additionally aggregates
`AiWorkflowRun` documents per tenant per period into the same `AiUsageDaily`/`AiUsageMonthly`
rollup under `feature: "ai_automation"`, contributing to **`requestCount` only** — one run counted
as one request. **Token and cost figures for this bucket are not available** (per-workflow-run
token/cost isn't tracked anywhere in the AI runtime today, confirmed by
`docs/ai/SYSTEM_INVENTORY.md`'s own model-field inventory) and are reported as `0`, not estimated
or backfilled from a different bucket's average — an honest partial figure, not a fabricated one.
`AI Agents` has no distinct real signal from `AI Automation` in this codebase yet (both are the
same `AiWorkflowRun` mechanism) — the per-org UI shows `AI Agents: 0` with the same "not yet
distinguished from AI Automation" note, rather than guessing a split.

## What this means for the platform dashboard (§13)

"Top features" and the per-org feature breakdown are real for AI Assistant, AI Reports, and (as of
Phase 9) Document Processing (complete token/cost data for all three), partial for AI Automation
(request counts only, real — no token/cost tracked in the AI runtime), and an honest zero for AI
Agents (no distinct signal from AI Automation in this codebase) — never a fabricated distribution
across all 5 buckets to make the pie chart look complete.
