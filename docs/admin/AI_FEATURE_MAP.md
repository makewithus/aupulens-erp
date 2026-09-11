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

## `lib/docIntel/` (vendor-bill extraction) → **Document Processing**

Not gated by an `AiFeature` key today (it calls GPT-4o vision directly for OCR+extraction, per
`docs/ai/SYSTEM_INVENTORY.md`'s finding) — its usage is not yet instrumented through
`lib/ai/tenantAi.ts` at all (it doesn't go through `callClaudeForTenant`), so **no Document
Processing usage is metered yet**. Recorded here as a known gap, not silently absent: the per-org
AI Usage tab shows `Document Processing: 0` honestly rather than omitting the row, and
`docs/admin/OPEN_QUESTIONS.md` should be checked before treating that `0` as "no usage occurred"
versus "not instrumented yet" — it means the latter until `lib/docIntel/` is wired through
`tenantAi.ts` or given its own metering call, which this phase does not do.

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

"Top features" and the per-org feature breakdown are real for AI Assistant and AI Reports
(complete token/cost data), partial for AI Automation (request counts only, real), and honest
zeros for Document Processing and AI Agents (not yet instrumented) — never a fabricated
distribution across all 5 buckets to make the pie chart look complete.
