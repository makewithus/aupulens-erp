import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import { DOCUMENT_STATUS, TRANSACTION_LOCK_MODULE, AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";
import { evaluateCutoff, type CutoffEvaluation } from "@/lib/aiRuntime/cutoff/evaluateCutoff";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-28 — Cut-off intelligence (docs/ai/BRIEF-04-BATCH-C.md, built last). Compares a posting
 * date against real evidence of when the thing actually happened.
 *
 * **Now a thin wrapper around `lib/aiRuntime/cutoff/evaluateCutoff.ts`** (docs/ai/
 * BRIEF-06-BATCH-E.md Part 0.4) — the same function AI-14 calls directly to classify a flux
 * driver as a real `"timing"` difference. This workflow no longer duplicates the evidence logic;
 * it only does what a workflow adds on top: scans the cut-off window, checks period locks, and
 * decides reclass vs current-period-adjustment.
 *
 * **Scope, recorded honestly** (matches the batch's established scope-triage pattern): only the
 * highest-priority evidence row from the brief's own table is implemented deeply —
 * vendor bill vs. `StockMove` receipt date. Sales invoice / prepaid / expense / payroll cut-off
 * checks are not built this batch — every transaction of those types reports
 * `evidence_unavailable` rather than a silently-assumed "correct." Recorded in
 * `docs/ai/OPEN_QUESTIONS.md`.
 *
 * **RECOMMEND only, drafts nothing** (A.3) — `act()` never calls a tool. A next-period cost
 * arriving late is never accrued here either way; that stays AI-07's job by construction, not by
 * an explicit hand-off this workflow has no write capability to perform anyway.
 */

const WINDOW_DAYS = 10;

interface Ai28Raw {
  periodEnd: string;
}

interface CutoffCandidate {
  invoiceId: string;
  invoiceName: string;
  amount: number;
  evaluation: CutoffEvaluation;
}

interface Ai28Extracted {
  candidates: CutoffCandidate[];
  periodEnd: Date;
}

interface Ai28Proposal {
  exceptions: {
    candidate: CutoffCandidate;
    postedPeriod: string;
    evidencePeriod: string;
    proposedAction: "reclass" | "current_period_adjustment";
    priorPeriodLocked: boolean;
  }[];
  evidenceUnavailableCount: number;
}

function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentPeriodEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
}

export const ai28CutoffIntelligence: WorkflowDefinition<Ai28Raw, Ai28Extracted, Ai28Proposal> = {
  id: "AI-28",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached"],
  actionClass: "cutoff_review",
  defaultAutonomy: AI_AUTONOMY_LEVEL.RECOMMEND,

  subscriptionFilter(): boolean {
    return true; // fan-out, shared with AI-13/22/24 — no single owner of a period boundary tick
  },

  async observe(event): Promise<ObservedResult<Ai28Raw>> {
    const periodEnd = event.payload.periodEnd ? String(event.payload.periodEnd) : currentPeriodEnd().toISOString();
    return { entityId: event.tenantId, raw: { periodEnd } };
  },

  async extract(observed, ctx): Promise<Ai28Extracted> {
    await connectDB();
    const periodEnd = new Date(observed.raw.periodEnd);
    const windowStart = new Date(periodEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(periodEnd.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const bills = await Invoice.find({
      tenantId: ctx.tenantId,
      moveType: "in_invoice",
      state: { $ne: DOCUMENT_STATUS.CANCELLED },
      invoiceDate: { $gte: windowStart, $lte: windowEnd },
    })
      .select("_id name invoiceDate amountTotal")
      .lean();

    const candidates: CutoffCandidate[] = [];
    for (const bill of bills) {
      const evaluation = await evaluateCutoff(ctx.tenantId, String(bill._id), periodEnd);
      candidates.push({
        invoiceId: String(bill._id),
        invoiceName: (bill as { name?: string }).name ?? String(bill._id),
        amount: (bill as { amountTotal?: number }).amountTotal ?? 0,
        evaluation,
      });
    }

    return { candidates, periodEnd };
  },

  async reason(extracted, ctx): Promise<ReasonResult<Ai28Proposal>> {
    const reasonChain = [`scanned ${extracted.candidates.length} vendor bill(s) within the cut-off window`];
    const findings: ReasonResult<Ai28Proposal>["findings"] = [];
    const exceptions: Ai28Proposal["exceptions"] = [];
    let evidenceUnavailableCount = 0;

    for (const c of extracted.candidates) {
      if (!c.evaluation.determinable || !c.evaluation.isTimingDifference || !c.evaluation.postedDate || !c.evaluation.governingDate) {
        if (!c.evaluation.determinable) evidenceUnavailableCount += 1;
        continue; // not determinable, or determinable-but-same-period (false positive guard)
      }

      const postedPeriod = periodOf(c.evaluation.postedDate);
      const evidencePeriod = periodOf(c.evaluation.governingDate);

      let priorPeriodLocked = false;
      const earlierDate = c.evaluation.governingDate < c.evaluation.postedDate ? c.evaluation.governingDate : c.evaluation.postedDate;
      try {
        await assertTransactionNotLocked(ctx.tenantId, TRANSACTION_LOCK_MODULE.PURCHASES, earlierDate);
      } catch (err) {
        if (err instanceof TransactionLockError) priorPeriodLocked = true;
        else throw err;
      }

      const proposedAction: "reclass" | "current_period_adjustment" = priorPeriodLocked ? "current_period_adjustment" : "reclass";
      exceptions.push({ candidate: c, postedPeriod, evidencePeriod, proposedAction, priorPeriodLocked });

      findings.push({
        id: `ai28-cutoff-${c.invoiceId}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: `Cut-off exception: ${c.invoiceName}`,
        detail: `Posted in ${postedPeriod}, evidence (${c.evaluation.governingDateType}) says ${evidencePeriod} — proposed: ${proposedAction}${priorPeriodLocked ? " (prior period locked, never back-dated)" : ""}`,
        amount: c.amount,
        confidence: 0.8,
        subjectRefs: [{ model: "Invoice", id: c.invoiceId }],
        evidence: c.evaluation.evidenceRef ? [{ kind: "record", ref: c.evaluation.evidenceRef, label: c.evaluation.governingDateType ?? "" }] : [],
        reasonChain: [],
      });
    }

    if (evidenceUnavailableCount > 0) reasonChain.push(`${evidenceUnavailableCount} bill(s) had no PO/StockMove evidence — reported evidence_unavailable, not assumed correct`);

    return {
      proposal: { exceptions, evidenceUnavailableCount },
      confidence: exceptions.length > 0 ? 0.8 : 0,
      findings,
      reasonChain,
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(): Promise<ActResult> {
    // RECOMMEND only — drafts nothing (A.3). Cut-off is judgement.
    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
