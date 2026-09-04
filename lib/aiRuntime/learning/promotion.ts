import connectDB from "@/lib/db";
import AiLearningRecord from "@/models/ai/AiLearningRecord";
import AiActionProposal from "@/models/ai/AiActionProposal";
import { AI_ACTION_TYPE, AI_LEARNING_OUTCOME } from "@/lib/constants/statuses";

/**
 * Governed promotion of a learned classification pattern into a proposed `BankingRule`
 * (docs/ai/BRIEF-08b-FINAL.md C.3) — reuses the EXISTING `create_banking_rule` proposal path
 * (`lib/accounting/aiActions.ts`, `AiActionProposal`) rather than a second promotion mechanism.
 * **Never writes `BankingRule` directly** — this creates a `proposed` `AiActionProposal`; a human
 * confirms it through the existing Finance AI-actions confirm gate
 * (`app/api/finance/accounting/ai-actions/[id]/confirm`), exactly like every other Finance action.
 *
 * **Honest limit, found building this**: `AiLearningRecord.outcome` only ever leaves `"pending"`
 * for workflows that call `record_learning_outcome` — today only AI-05 and AI-07. AI-02 (ledger
 * classification, the workflow a `BankingRule` promotion is actually about) does NOT call it yet,
 * so this aggregator has real, tested logic but nothing real to promote from until AI-02's own
 * classification decision point is wired the same way AI-05/AI-07 already are — a real, scoped,
 * not-yet-done next step, not a gap papered over (`docs/ai/AUTONOMY_RUNBOOK.md`).
 *
 * Criteria authoring stays a human step: this proposes the target account and the evidence (how
 * many observations, what override rate, over what window) — it does not guess match criteria
 * from free text, the same discipline `lib/accounting/aiIntent.ts` and every jurisdiction-resolution
 * decision elsewhere in this project already follows.
 */

const STABILITY_MIN_OBSERVATIONS = 10;
const STABILITY_MAX_OVERRIDE_RATE = 0.1;
const WINDOW_DAYS = 60;

export interface StablePattern {
  workflowId: string;
  accountId: string;
  observations: number;
  overrideRate: number;
  windowDays: number;
}

/** Aggregates AI-02's own AiLearningRecord rows by proposed account and finds patterns stable
 *  enough to propose. Pure aggregation — never mutates AiLearningRecord or BankingRule. */
export async function findStableClassificationPatterns(tenantId: string, now = new Date()): Promise<StablePattern[]> {
  await connectDB();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // OUTCOME_UNKNOWN excluded alongside PENDING — same reasoning as computeMetrics.ts (Chunk 9 0.1).
  const records = await AiLearningRecord.find({ tenantId, workflowId: "AI-02", createdAt: { $gte: windowStart }, outcome: { $nin: [AI_LEARNING_OUTCOME.PENDING, AI_LEARNING_OUTCOME.OUTCOME_UNKNOWN] } })
    .select("proposal outcome")
    .lean();

  const byAccount = new Map<string, { total: number; overridden: number }>();
  for (const r of records) {
    const accountId = (r.proposal as { accountId?: string } | undefined)?.accountId;
    if (!accountId) continue;
    const bucket = byAccount.get(accountId) ?? { total: 0, overridden: 0 };
    bucket.total++;
    if (r.outcome === AI_LEARNING_OUTCOME.EDITED || r.outcome === AI_LEARNING_OUTCOME.REJECTED) bucket.overridden++;
    byAccount.set(accountId, bucket);
  }

  const stable: StablePattern[] = [];
  for (const [accountId, bucket] of byAccount.entries()) {
    const overrideRate = bucket.overridden / bucket.total;
    if (bucket.total >= STABILITY_MIN_OBSERVATIONS && overrideRate <= STABILITY_MAX_OVERRIDE_RATE) {
      stable.push({ workflowId: "AI-02", accountId, observations: bucket.total, overrideRate: Math.round(overrideRate * 1000) / 1000, windowDays: WINDOW_DAYS });
    }
  }
  return stable;
}

/** Creates ONE proposed AiActionProposal (create_banking_rule) per stable pattern not already
 *  proposed — idempotent per {tenantId, accountId} within the pattern's own window via a dedupe
 *  check against existing pending proposals, so a nightly run doesn't spam duplicates. */
export async function proposeStableRules(tenantId: string, userId: string, now = new Date()): Promise<{ proposed: number; patterns: StablePattern[] }> {
  await connectDB();
  const patterns = await findStableClassificationPatterns(tenantId, now);
  let proposed = 0;

  for (const pattern of patterns) {
    const existing = await AiActionProposal.findOne({
      tenantId,
      actionType: AI_ACTION_TYPE.CREATE_BANKING_RULE,
      "params.accountId": pattern.accountId,
      "params.promotedFrom": "learning_loop",
      status: "proposed",
    }).lean();
    if (existing) continue;

    await AiActionProposal.create({
      tenantId,
      userId,
      module: "finance",
      actionType: AI_ACTION_TYPE.CREATE_BANKING_RULE,
      params: {
        ruleName: `Learned pattern — account ${pattern.accountId} (auto-suggested)`,
        applyTo: "deposits",
        recordAs: "income",
        accountId: pattern.accountId,
        criteria: [],
        promotedFrom: "learning_loop",
        evidence: { observations: pattern.observations, overrideRate: pattern.overrideRate, windowDays: pattern.windowDays },
      },
      preview: {
        summary: `Propose a BankingRule for account ${pattern.accountId} — ${pattern.observations} consistent classifications over ${pattern.windowDays} days, ${Math.round(pattern.overrideRate * 100)}% override rate. Match criteria still need a human to author.`,
      },
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // longer TTL than a normal chat proposal — this needs a human to review evidence, not a quick yes/no
    });
    proposed++;
  }

  return { proposed, patterns };
}
