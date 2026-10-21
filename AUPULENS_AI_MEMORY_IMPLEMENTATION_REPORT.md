# Aupulens AI conversation context and memory implementation report

## Architecture audit and root cause

The AI pages already had `ChatHistory` persistence and the provider wrapper accepted a history argument. The active chat was not consistently authoritative: clients sent their own history snapshots, several pages replaced stored transcripts after a response, and the first-turn server conversation ID was not consistently reused by module chat pages. This made follow-up requests vulnerable to missing or duplicated turns. Cross-chat history was separately available in limited paths, but there was no user memory preference or explicit, inspectable personal-memory lifecycle. No embeddings-based chat memory service was found or added.

## Implemented behavior

`lib/ai/conversationContext.ts` is the shared context loader used by the assistant routes. It resolves history using authenticated tenant/user identity, module permissions, and the conversation ID (or a validated server chat ID). It ignores client-authored transcript history, orders the saved messages, and appends the latest user message once through the provider request. Long active transcripts are bounded by `AI_CHAT_CONTEXT_MAX_CHARS` (default 80,000 characters, capped at 240,000) and retain opening turns, relevant older excerpts, and recent turns. Relevant cross-chat summaries/excerpts and approved saved facts are retrieved by keyword; cross-chat recall is limited to authorized modules, tenant, and owner/workspace scopes.

Completed messages are stored as paired user/assistant turns with a request ID. A retry with the same request ID can return the prior completed response and does not append another exchange. Summary refreshes begin after eight exchanges and recur as new exchanges accumulate. Summaries use the configured tenant provider through `callClaudeForTenant` with the `chat_summary` feature and an idempotency key; the raw transcript remains available if summarization fails. A message-count compare-and-set prevents an older summary from overwriting a newer one.

The `AiMemory` model supports owner-scoped personal facts and admin-visible workspace/module facts, provenance fields, approval state, corrections, and soft deletion. `AiMemoryPreference` stores the per-tenant/per-user cross-chat memory setting. The memory endpoint requires authentication and enforces owner, tenant, and admin scope. The AI sidebar adds controls to inspect, save, correct, delete, and disable cross-chat memory. Disabling memory suppresses prior-chat recall and saved facts but leaves the active chat usable. Explicit memory requests are supported; arbitrary secrets/credentials are rejected from the save endpoint.

The assistant pages and routes now reuse server-issued conversation IDs, persist successful exchanges from server handlers, and refresh chat history without sending client snapshots back as authoritative transcript data. Workspace/user changes clear stale assistant history and memory state in the browser. The manufacturing assistant was included in the same server-side persistence and retry path. Memory context is labeled as untrusted reference material so historical text is not treated as instructions.

## Data, rollout, and safeguards

Changes to `ChatHistory` and `AiMemory` are additive. Existing history is retained; there is no destructive backfill or migration command. Existing provider usage instrumentation is reused for summaries. No production database was modified and no deployment was performed. New model indexes are declared in the schemas and will be managed under the application's existing Mongoose index policy.

Tenant/user filters are derived from the authenticated request and are included in reads and writes. Cross-chat retrieval only sees modules authorized for the caller; personal facts are restricted to their owner, while workspace facts are restricted to admins. The saved transcript remains the source of truth; arbitrary client history is ignored.

## Files changed

- `app/admin/ai-assistant/page.tsx`
- `app/api/admin/ai-assistant/route.ts`
- `app/api/ai/memory/route.ts`
- `app/api/crm/ai-assistant/route.ts`
- `app/api/crm/chat-history/route.ts`
- `app/api/finance/ai-assistant/route.ts`
- `app/api/finance/chat-history/route.ts`
- `app/api/hr/ai-assistant/route.ts`
- `app/api/hr/chat-history/route.ts`
- `app/api/inventory/ai-assistant/route.ts`
- `app/api/inventory/chat-history/route.ts`
- `app/api/manufacturing/ai-assistant/route.ts`
- `app/api/manufacturing/chat-history/route.ts`
- `app/api/sales/ai-assistant/route.ts`
- `app/api/sales/chat-history/route.ts`
- `app/crm/ai-assistant/page.tsx`
- `app/finance/ai-assistant/page.tsx`
- `app/hr/ai-assistant/page.tsx`
- `app/inventory/ai-assistant/page.tsx`
- `app/manufacturing/ai-assistant/page.tsx`
- `app/sales/ai-assistant/page.tsx`
- `components/dashboard/AiSidebar.tsx`
- `lib/ai/assistantGuidance.ts`
- `lib/ai/chatHistoryUtils.ts` (new)
- `lib/ai/conversationContext.ts`
- `models/ai/AiMemory.ts`
- `models/ai/AiMemoryPreference.ts` (new)
- `models/ai/ChatHistory.ts`
- `tests/ai/aiMemory.test.ts`
- `tests/ai/conversationContext.integration.test.ts`
- `tests/ai/conversationContext.test.ts`
- `tests/ai/financeAiRoute.test.ts`

## Verification

- `npx vitest run tests/ai/conversationContext.test.ts tests/ai/aiMemory.test.ts tests/ai/financeAiRoute.test.ts tests/ai/adminAiRouteGating.test.ts tests/ai/manufacturingChatHistory.test.ts --reporter=dot` — passed, 5 files and 45 tests.
- `./node_modules/.bin/tsc --noEmit` — passed after the final TypeScript changes.
- `git diff --name-only -- '*.ts' '*.tsx' | xargs npx eslint && npx eslint lib/ai/chatHistoryUtils.ts models/ai/AiMemoryPreference.ts` — passed.
- `npm run build` — passed; Next.js production build compiled and generated all 549 static pages.
- `git diff --check` — passed.
- `npm test -- --reporter=dot` — completed with 246 test files passed and 21 failed; 2,625 tests passed, 78 failed, and 93 skipped. Failures include database setup timeouts (including migration and AI runtime integration hooks), an existing duplicate-key failure in platform admin sessions, and unrelated regional-command/usage tests affected by unavailable backing services. Focused assistant tests passed separately. Because the entire suite is not green, this remains a repository-level verification failure and the full failure list should be reviewed before release.
- Browser/manual verification — not performed. No browser test environment was available in this session.

## Known limitations and remaining work

- Cross-chat retrieval is keyword-based over titles, summaries, and bounded transcript excerpts; it is not semantic/vector retrieval. Old messages outside the query's retrieved window may not be recalled unless a summary or matching indexed text surfaces them.
- Durable personal facts are explicitly user-saved. Automatic summarization captures conversation-level facts, but there is no automatic candidate-fact extraction/approval workflow or source-grounded fact correction engine.
- Summary refresh currently runs in the successful-response lifecycle rather than a background queue, so a refresh may add latency. If it fails, raw history remains intact, but there is no scheduled retry queue.
- The stored message schema includes status fields, but this change persists completed exchanges; it does not create durable pending/failed/interrupted assistant-turn records for an interrupted stream. Tool calls/results and attachments are not yet stored in a provider-neutral structured transcript by this pipeline.
- The full test suite is not green, and real-browser lifecycle checks have not been performed. Production rollout should first be exercised in a non-production tenant, including reload, retry, deletion, memory-off, and cross-tenant checks.
