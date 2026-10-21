# Aupulens AI memory response fix

**Implementation status: UPDATED; live UI verification outstanding.** The shared conversational-assistant instructions now describe the implemented memory behavior and prohibit the obsolete categorical denial. Regression tests pass. I could not verify the deployed UI, and the latest production build compiled but did not complete its final checks in this environment, so the response should not yet be considered verified end to end.

## Root cause and evidence

Repository-wide source search found no obsolete denial or “after the session ends” answer in production code, fallback responses, or UI transformations. The displayed wording is therefore not a hardcoded response in the current source. The evidence points to a model-generated generic answer: the shared guidance said not to claim complete recall, but did not positively state that completed active-chat turns are stored server-side, that cross-chat recall is separate and limited, or how opt-out and deletion work. Without those product facts, the model could conflate “no permanent fact memory” with “no conversation history is retained.”

All seven conversational routes already attach `AI_ASSISTANT_GUIDANCE`; `tenantAi` passes each caller's system prompt through unchanged. The sidebar's factual-record lookup flow does not intercept generic questions about conversation retention. The current deployed version could not be inspected, so an outdated deployment cannot be ruled out.

## Changes

Updated [assistantGuidance.ts](./lib/ai/assistantGuidance.ts) with shared, factual instructions covering:

- Server persistence and reload of completed active-chat turns for the same authorized user, tenant, and module.
- Limited cross-chat recall from relevant summaries/excerpts and explicitly approved facts, subject to user preference and access permissions.
- The distinction between active-chat history and cross-chat memory; pausing cross-chat recall leaves the active chat history mechanism intact.
- No guarantee of unlimited or indefinite recall, and no claim that every detail becomes a saved fact.
- Deleting a saved fact does not delete its source conversation or summary.
- Mention memory controls only when available; the shared AI sidebar provides them.

Added [assistantMemoryTransparency.test.ts](./tests/ai/assistantMemoryTransparency.test.ts) to check those behavioral rules, reject categorical denial language, and verify that every user-facing conversational route uses the shared guidance. The tests check semantic policy rather than a fixed sample answer. Existing authentication, ownership, tenant, role, module, and opt-out enforcement in `conversationContext.ts` was not changed.

## Verification

| Check | Result |
|---|---|
| `npx vitest run tests/ai/assistantMemoryTransparency.test.ts tests/ai/conversationContext.test.ts tests/ai/aiMemory.test.ts tests/ai/conversationMemoryPreference.test.ts --reporter=dot` | Exit 0; 4 files passed, 19 tests passed. These are unit/prompt tests and do not require MongoDB or a provider call. |
| `npx eslint lib/ai/assistantGuidance.ts tests/ai/assistantMemoryTransparency.test.ts` | Exit 0; no diagnostics. |
| `git diff --check` | Exit 0. |
| `npm run build` after the prompt change | Next.js compiled successfully in 70 seconds and entered lint/type validation. The build process disappeared without a final result; the stale session was stopped (exit 130). Treat the production build as incomplete. |
| Production-source search for obsolete wording | No match in application source. The exact old phrases are present only as negative regression-test patterns. |
| Live UI / deployed commit verification | Not performed. No browser or connected deployment inspector was available, and the repository has no `.vercel` project config. |
| MongoDB integration | Not needed for these prompt-only rules; no database was accessed or changed. Existing database-backed memory isolation tests remain subject to the separate test-environment blocker in `AUPULENS_COMPLETE_TEST_AND_RELEASE_AUDIT.md`. |

## Before/after behavior

Before, the app's shared prompt warned against claiming complete recall but omitted the storage facts. The model could respond as if it had no retained conversation history. After the change, all conversational routes receive explicit instructions to distinguish persisted active-chat history, limited cross-chat recall, and saved personal facts, with the actual opt-out, deletion, and retention limits. No answer for one particular question was hardcoded.

## Deployment and manual verification

No deployment was performed. The working tree is on branch `main` at commit `14d96d29`, but the live site's deployed commit could not be checked. To verify after deploying this branch, open the Aupulens AI sidebar and ask:

1. “Do you store memory from conversations?”
2. “Will you remember this in a different chat?”
3. “Do you automatically remember every previous conversation?”
4. Pause cross-chat memory, then ask a follow-up in the same active chat.
5. Delete an explicitly saved fact and ask whether its source chat was deleted.

Confirm the replies distinguish the three mechanisms, describe limits accurately, and never claim that no conversation history is retained. Reload the active conversation and confirm its earlier turns remain available. Check a second user/workspace to confirm none of the first user's prior-chat details are exposed. The live response and access isolation must be checked after deployment before calling this issue fully resolved.

## Remaining limitations

Cross-chat retrieval is bounded keyword matching over permitted summaries/excerpts and approved facts, not complete or semantic retrieval of every past message. A transient database preference-read failure intentionally disables cross-chat recall for that request. A failed server write may prevent a completed turn from being retained. Saved-fact deletion does not erase the source transcript or summary. These limitations are now stated in the shared prompt so the assistant does not overpromise.
