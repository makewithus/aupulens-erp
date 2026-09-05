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
  truncated: boolean;
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

// Same defect class fixed in AI-14/AI-25 (docs/ai/BRIEF-09-VERIFICATION.md cross-workflow check):
// `observe()` used to trust caller-supplied `periodStart`/`periodEnd` strings verbatim, which
// reached extract()'s `new Date(...)` as Invalid Date whenever malformed — JournalEntry.find()'s
// Mongoose date cast then throws an uncaught CastError (reproduced directly in this pass, see this
// workflow's own verification record §9). Fixed by validating `periodStart`/`periodEnd` directly
// (they — not `period`, which is only ever a display/id label here, never Date-cast — are the
// fields that actually reach a Mongoose query): missing or unparseable values degrade to "this
// period's" bounds, never an Invalid Date. `periodStart`/`periodEnd` are deliberately NOT
// re-derived from `period`: a caller may legitimately label a run with an arbitrary period string
// while supplying explicit boundaries (tests/golden/ai23.golden.test.ts does exactly this with a
// "golden" sentinel label) — collapsing the two would silently discard real caller-supplied
// boundaries whenever the label isn't literally "YYYY-MM".
function isValidIsoInstant(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length > 0 && !Number.isNaN(new Date(raw).getTime());
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
    const periodStart = isValidIsoInstant(event.payload.periodStart) ? event.payload.periodStart : fallback.periodStart.toISOString();
    const periodEnd = isValidIsoInstant(event.payload.periodEnd) ? event.payload.periodEnd : fallback.periodEnd.toISOString();
    return { entityId: event.tenantId, raw: { period, periodStart, periodEnd } };
  },

  async extract(observed, ctx): Promise<Ai23Extracted> {
    await connectDB();
    // Chunk 9 bug fix (verification record §9): fetch one extra row over the cap so a truncated
    // period is DETECTABLE, not just silently capped. A busy tenant posting >300 journals in a
    // period used to have the excess dropped with no signal anywhere in the run — reasonChain
    // only ever reported entryIds.length (<= 300), so "reviewing 300 journal(s)" read as the
    // whole period even when e.g. 5,000 were actually posted. Violates the same "never silently
    // omit a domain" rule this codebase already enforces elsewhere (docs/ai/BRIEF-07-BATCH-F.md
    // 0.3, the tax/suspense not_applicable-vs-unreconciled distinction). One extra `.limit()` row
    // costs nothing extra in index usage and avoids a second `countDocuments()` round trip.
    const entries = await JournalEntry.find({
      tenantId: ctx.tenantId,
      status: DOCUMENT_STATUS.POSTED,
      "header.date": { $gte: new Date(observed.raw.periodStart), $lte: new Date(observed.raw.periodEnd) },
    })
      .select("_id")
      .limit(MAX_JOURNALS_PER_RUN + 1)
      .lean();
    const truncated = entries.length > MAX_JOURNALS_PER_RUN;
    const entryIds = entries.slice(0, MAX_JOURNALS_PER_RUN).map((e) => String(e._id));
    return { period: observed.raw.period, entryIds, truncated };
  },

  async reason(extracted): Promise<ReasonResult<Ai23Proposal>> {
    const reasonChain = [`reviewing ${extracted.entryIds.length} posted journal(s) for ${extracted.period} against this tenant's own history`];
    const findings: ReasonResult<Ai23Proposal>["findings"] = [];
    if (extracted.truncated) {
      reasonChain.push(`more than ${MAX_JOURNALS_PER_RUN} posted journals exist for ${extracted.period} — only the first ${MAX_JOURNALS_PER_RUN} were reviewed this run, the remainder is not yet scanned`);
      findings.push({
        id: `ai23-truncated-${extracted.period}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: `Journal review: more than ${MAX_JOURNALS_PER_RUN} journals posted in ${extracted.period}`,
        detail: `Per-run cap of ${MAX_JOURNALS_PER_RUN} reached — the remaining journals posted this period were not scanned by this run and need a follow-up pass.`,
        confidence: 1,
        subjectRefs: [],
        evidence: [],
        reasonChain: [],
      });
    }
    return {
      proposal: { period: extracted.period, scanned: extracted.entryIds.length, scored: [] },
      confidence: 1,
      findings,
      reasonChain,
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
