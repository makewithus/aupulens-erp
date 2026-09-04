import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * `internal_state`-category tools (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) whose home is this file
 * specifically, rather than a per-batch tools file — a dedicated, growing home for tools whose
 * writes target `models/ai/**` only, so `tests/ai/aiRuntime/safety.test.ts`'s
 * `handler.toString()` source-grep has one place to check as this category grows. Existing
 * `internal_state` tools registered elsewhere (`create_task`/`resolve_task`/
 * `record_close_assertion`/`draft_prepaid_schedule`/`draft_depreciation_schedule`/
 * `link_schedule_draft`) stay where their sibling tools already live — moving working, tested
 * code for the sake of file tidiness isn't worth the risk; only the category tag matters to the
 * gate in `registry.ts::callTool()` and to the safety test.
 *
 * **`record_learning_outcome` removed, Chunk 9 (0.1)**: it called `recordProposal()` a second
 * time for a run the executor's own `learn` stage had already recorded — a real, confirmed
 * duplicate-`AiLearningRecord`-per-run bug (AI-07 was the only caller). The executor now creates
 * exactly one `AiLearningRecord` per run and resolves it immediately when a workflow's `act()`
 * returns `ActResult.learningOutcome` (`lib/aiRuntime/runtime/executor.ts`) — never a workflow
 * write, never a tool call, never a second record. `AiLearningRecord.runId` also carries a unique
 * index now, so a genuine reintroduction of this bug fails at the database layer, not silently.
 */

export function registerInternalStateTools(): void {
  // No tools registered here today — kept as the designated home for future internal_state
  // tools (see the file doc comment) rather than deleted, so a future addition has somewhere
  // established to land instead of scattering a new file per tool.
}
