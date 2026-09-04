import connectDB from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";
import type { JournalRiskResult } from "@/lib/aiRuntime/journalReview/scoreJournalRisk";

/**
 * AI-23 — Journal review intelligence (docs/ai/BRIEF-07-BATCH-F.md). Every journal posted in the
 * period — human or AI-created — scored against this tenant's own posting history
 * (`lib/aiRuntime/journalReview/scoreJournalRisk.ts`, which reuses AI-15's pattern detectors
 * rather than rebuilding them, per A.3).
 *
 * OBSERVE/RECOMMEND — this workflow cannot post, approve, or alter `voucherStatus` at any
 * confidence: no such tool exists anywhere in its registry (asserted directly, same class of
 * proof as AI-06's payment-run precedent). Posting continues to follow the existing journal
 * policy and approval chain, entirely untouched.
 */

const MAX_JOURNALS_PER_RUN = 300;

interface Ai23Raw {
  period: string;
  periodStart: string;
  periodEnd: string;
}

interface Ai23Extracted {
  period: string;
  entryIds: string[];
}

interface Ai23ScoredJournal extends JournalRiskResult {
  entryId: string;
  entryName: string;
}

interface Ai23Proposal {
  period: string;
  scanned: number;
  scored: Ai23ScoredJournal[];
}

function currentPeriodBounds(): { period: string; periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { period, periodStart, periodEnd };
}

export const ai23JournalReview: WorkflowDefinition<Ai23Raw, Ai23Extracted, Ai23Proposal> = {
  id: "AI-23",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.RECOMMEND,

  subscriptionFilter(): boolean {
    return true; // fan-out, same as AI-13/17/18/20/21/22
  },

  async observe(event): Promise<ObservedResult<Ai23Raw>> {
    const fallback = currentPeriodBounds();
    const period = event.payload.period ? String(event.payload.period) : fallback.period;
    const periodStart = event.payload.periodStart ? String(event.payload.periodStart) : fallback.periodStart.toISOString();
    const periodEnd = event.payload.periodEnd ? String(event.payload.periodEnd) : fallback.periodEnd.toISOString();
    return { entityId: event.tenantId, raw: { period, periodStart, periodEnd } };
  },

  async extract(observed, ctx): Promise<Ai23Extracted> {
    await connectDB();
    const entries = await JournalEntry.find({
      tenantId: ctx.tenantId,
      status: DOCUMENT_STATUS.POSTED,
      "header.date": { $gte: new Date(observed.raw.periodStart), $lte: new Date(observed.raw.periodEnd) },
    })
      .select("_id")
      .limit(MAX_JOURNALS_PER_RUN)
      .lean();
    return { period: observed.raw.period, entryIds: entries.map((e) => String(e._id)) };
  },

  async reason(extracted): Promise<ReasonResult<Ai23Proposal>> {
    return {
      proposal: { period: extracted.period, scanned: extracted.entryIds.length, scored: [] },
      confidence: 1,
      findings: [],
      reasonChain: [`reviewing ${extracted.entryIds.length} posted journal(s) for ${extracted.period} against this tenant's own history`],
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const tenantId = ctx.tenantId;
    const findings: ActResult["findings"] = [];
    const scored: Ai23ScoredJournal[] = [];

    for (const entryId of extracted.entryIds) {
      const result = await rt.callTool<{ found: boolean } & Partial<Ai23ScoredJournal>>(
        "score_journal_risk",
        { tenantId, entryId },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
      );
      if (!result.found) continue;
      const journal = result as Ai23ScoredJournal;
      scored.push(journal);

      if (journal.recommendation !== "auto_ok") {
        findings.push({
          id: `ai23-journal-${journal.entryId}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: journal.recommendation === "escalate" ? AI_FINDING_SEVERITY.HIGH : AI_FINDING_SEVERITY.MEDIUM,
          title: `Journal review: ${journal.entryName} — ${journal.recommendation}`,
          detail: journal.reasons.join("; "),
          confidence: 1,
          subjectRefs: [{ model: "JournalEntry", id: journal.entryId }],
          evidence: [{ kind: "record" as const, ref: journal.entryId, label: journal.entryName }],
          reasonChain: journal.flags.map((f) => `${f.dimension}: ${f.detail}`),
        });
      }
    }

    reasoned.proposal.scored = scored;

    return { findings, actionsTaken: [], metrics: { scanned: scored.length, exceptions: findings.length } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
