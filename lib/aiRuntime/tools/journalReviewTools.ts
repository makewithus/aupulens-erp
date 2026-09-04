import { buildAndScoreJournalRisk } from "@/lib/aiRuntime/journalReview/buildRiskInput";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-23's tool (docs/ai/BRIEF-07-BATCH-F.md A.1) — read/analyse only. No write tool exists for
 * journal review at all: this workflow cannot post, approve, or alter `voucherStatus` at any
 * confidence (asserted directly in tests, same pattern as AI-06's payment-run precedent).
 */

export interface ScoreJournalRiskArgs {
  tenantId: string;
  entryId: string;
}

async function scoreJournalRiskHandler(args: ScoreJournalRiskArgs) {
  const result = await buildAndScoreJournalRisk(args.tenantId, args.entryId);
  if (!result) return { found: false };
  return { found: true, ...result };
}

export function registerJournalReviewTools(): void {
  registerTool<ScoreJournalRiskArgs>({
    name: "score_journal_risk",
    description: "Scores one JournalEntry's risk against this tenant's own posting history — lib/aiRuntime/journalReview/scoreJournalRisk.ts. Reuses AI-15's pattern detectors, never a second detector list.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: scoreJournalRiskHandler,
  });
}
