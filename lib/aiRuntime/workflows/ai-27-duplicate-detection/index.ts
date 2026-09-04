import {
  findBillDuplicateCandidates,
  findExpenseDuplicateCandidates,
  findBankPaymentDuplicatePatterns,
  findDuplicatePaymentPostings,
  runRetrospectiveSweep,
  type DuplicateCandidate,
  type ExpenseDuplicateCandidate,
  type BankDuplicatePattern,
  type DuplicatePaymentPosting,
  type RetrospectiveSweepResult,
} from "@/lib/aiRuntime/duplicates/detect";
import { getWorkflowGaps } from "@/lib/aiRuntime/capabilities/registry";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-27 — Duplicate & duplicate-payment intelligence (docs/ai/BRIEF-08a-BATCH-G.md). Paying the
 * same bill twice is the single most recoverable finance loss this system can catch — this
 * workflow searches **across sources** (bills, expenses, bank-statement lines), not within one
 * table (`lib/docIntel/duplicateCheck.ts` already does that narrower, single-table job for the
 * extraction-confirm flow and is untouched here — its existing callers behave identically,
 * asserted directly in this workflow's own test suite).
 *
 * **Chunk 8b (0.1)**: the same bill paid twice — via two separate *posted* payment
 * `JournalEntry`s whose lines both carry `sourceId` back to the same bill, summing to more than
 * the bill's own total — is now detected directly (`findDuplicatePaymentPostings`), `certain` by
 * construction, never scored. What genuinely remains unbuildable: no *unposted* payment record
 * exists anywhere (only `Invoice.paymentState`, a flag), so a duplicate caught before both sides
 * post is bill-level detection (the scored candidates below), not this; and "same bank account
 * paid twice" still has no definitive bill link beyond AI-03's own reconciliation match, so that
 * stays informational-only. The one dimension that really is unbuildable — a credit note applied
 * against a re-billed invoice — has no applied/reversal link field on `Invoice` at all (confirmed
 * by schema inspection) and is declared in `checksNotImplemented`, not silently skipped.
 *
 * **Reuses AI-19's duplicate-vendor matching directly** (`findDuplicateEntities`) for the
 * duplicate-vendor case — never a second entity-matching implementation. **Reuses AI-19's
 * `place_hold`** (`lib/aiRuntime/tools/masterDataTools.ts`) for `certain`/`probable` candidates —
 * never a second hold implementation. **No `release_hold` tool exists at any autonomy level**
 * (asserted directly, same as AI-19).
 */

interface Ai27Raw {
  isSweep: boolean;
}

interface Ai27Extracted {
  isSweep: boolean;
  billCandidates: DuplicateCandidate[];
  expenseCandidates: ExpenseDuplicateCandidate[];
  bankPatterns: BankDuplicatePattern[];
  duplicatePayments: DuplicatePaymentPosting[];
  retrospective: RetrospectiveSweepResult | null;
}

interface Ai27Candidate {
  sourceModel: DuplicateCandidate["sourceModel"];
  primaryRef: string;
  duplicateRef: string;
  score: number;
  classification: string;
  matchedOn: string[];
  amountAtRisk: number;
  sideBySide: DuplicateCandidate["sideBySide"];
  holdPlaced: boolean;
  recommendedAction: string;
}

interface Ai27DuplicatePaymentItem extends DuplicatePaymentPosting {
  holdPlaced: boolean;
}

interface Ai27Proposal {
  candidates: Ai27Candidate[];
  expenseCandidates: ExpenseDuplicateCandidate[];
  bankPatterns: BankDuplicatePattern[];
  duplicatePayments: Ai27DuplicatePaymentItem[];
  retrospective: RetrospectiveSweepResult | null;
  checksNotImplemented: { what: string; reason: string }[];
}

// Chunk 9 (0.2): read live from the shared capability registry (lib/aiRuntime/capabilities/registry.ts).
const NOT_IMPLEMENTED = getWorkflowGaps("AI-27");

export const ai27DuplicateDetection: WorkflowDefinition<Ai27Raw, Ai27Extracted, Ai27Proposal> = {
  id: "AI-27",
  version: "1.0.0",
  eventKeys: ["bill.created", "invoice.created", "expense.submitted", "ai.sweep.hourly"],
  actionClass: "duplicate_intelligence",
  defaultAutonomy: AI_AUTONOMY_LEVEL.RECOMMEND,

  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai27Raw>> {
    return { entityId: event.tenantId, raw: { isSweep: event.eventKey === "ai.sweep.hourly" } };
  },

  async extract(observed, ctx): Promise<Ai27Extracted> {
    const tenantId = ctx.tenantId;
    const [billCandidates, expenseCandidates, bankPatterns, duplicatePayments] = await Promise.all([
      findBillDuplicateCandidates(tenantId),
      findExpenseDuplicateCandidates(tenantId),
      findBankPaymentDuplicatePatterns(tenantId),
      findDuplicatePaymentPostings(tenantId),
    ]);

    let retrospective: RetrospectiveSweepResult | null = null;
    if (observed.raw.isSweep) {
      retrospective = (await runRetrospectiveSweep(tenantId)).result;
    }

    return { isSweep: observed.raw.isSweep, billCandidates, expenseCandidates, bankPatterns, duplicatePayments, retrospective };
  },

  async reason(extracted): Promise<ReasonResult<Ai27Proposal>> {
    const findings: ReasonResult<Ai27Proposal>["findings"] = [];

    const candidates: Ai27Candidate[] = extracted.billCandidates.map((c) => {
      const actionable = c.classification === "certain" || c.classification === "probable";
      return {
        sourceModel: c.sourceModel,
        primaryRef: c.primaryRef,
        duplicateRef: c.duplicateRef,
        score: c.score,
        classification: c.classification,
        matchedOn: c.matchedOn,
        amountAtRisk: c.amountAtRisk,
        sideBySide: c.sideBySide,
        holdPlaced: false, // set in act() once the tool call actually succeeds
        recommendedAction: actionable ? "hold and review side-by-side before releasing payment" : "monitor — likely legitimate, no action needed",
      };
    });

    for (const c of candidates) {
      if (c.classification === "certain" || c.classification === "probable") {
        findings.push({
          id: `ai27-duplicate-${c.primaryRef}-${c.duplicateRef}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.CRITICAL,
          title: `Likely duplicate bill (${c.classification}): matched on ${c.matchedOn.join(", ")}`,
          detail: `₹${c.amountAtRisk} at risk between ${c.primaryRef} and ${c.duplicateRef}`,
          amount: c.amountAtRisk,
          confidence: c.score / 100,
          subjectRefs: [{ model: "Invoice", id: c.primaryRef }],
          evidence: c.sideBySide.filter((f) => !f.differs).map((f) => ({ kind: "calculation" as const, ref: f.name, label: `${f.name}: ${f.primary}` })),
          reasonChain: [`score ${c.score}`, ...c.matchedOn],
        });
      } else if (c.classification === "possible") {
        findings.push({
          id: `ai27-possible-${c.primaryRef}-${c.duplicateRef}`,
          type: AI_FINDING_TYPE.ANOMALY,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: `Possible duplicate bill: matched on ${c.matchedOn.join(", ")}`,
          detail: `₹${c.amountAtRisk} between ${c.primaryRef} and ${c.duplicateRef} — below the hold threshold`,
          amount: c.amountAtRisk,
          confidence: c.score / 100,
          subjectRefs: [{ model: "Invoice", id: c.primaryRef }],
          evidence: [],
          reasonChain: [`score ${c.score}`, ...c.matchedOn],
        });
      }
    }

    for (const e of extracted.expenseCandidates) {
      findings.push({
        id: `ai27-expense-${e.primaryRef}-${e.duplicateRef}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: "Possible duplicate expense claim",
        detail: `same employee, same amount ₹${e.amountAtRisk}, within days — ${e.primaryRef} vs ${e.duplicateRef}`,
        amount: e.amountAtRisk,
        confidence: 0.6,
        subjectRefs: [{ model: "Expense", id: e.primaryRef }],
        evidence: [],
        reasonChain: [],
      });
    }

    const duplicatePayments: Ai27DuplicatePaymentItem[] = extracted.duplicatePayments.map((dp) => ({ ...dp, holdPlaced: false }));
    for (const dp of duplicatePayments) {
      const overpaid = Math.round((dp.totalPaid - dp.billAmount) * 100) / 100;
      findings.push({
        id: `ai27-duplicate-payment-${dp.billId}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.CRITICAL,
        title: `Bill paid twice: ${dp.billName}`,
        detail: `${dp.paymentIds.length} posted payments totalling ₹${dp.totalPaid} against a ₹${dp.billAmount} bill — ₹${overpaid} overpaid`,
        amount: overpaid,
        confidence: 1,
        subjectRefs: [{ model: "Invoice", id: dp.billId }, ...dp.paymentIds.map((id) => ({ model: "JournalEntry", id }))],
        evidence: dp.paymentIds.map((id) => ({ kind: "record" as const, ref: id, label: "posted payment JournalEntry" })),
        reasonChain: [`${dp.paymentIds.length} posted payment postings reference the same bill sourceId`],
      });
    }

    for (const b of extracted.bankPatterns) {
      findings.push({
        id: `ai27-bank-${b.primaryRef}-${b.duplicateRef}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.LOW,
        title: "Possible duplicate outgoing bank payment pattern",
        detail: `two similar outgoing lines (₹${b.amount}) on the same account within days — informational only, no definitive bill link exists`,
        amount: b.amount,
        confidence: 0.4,
        subjectRefs: [],
        evidence: [],
        reasonChain: [],
      });
    }

    return {
      proposal: { candidates, expenseCandidates: extracted.expenseCandidates, bankPatterns: extracted.bankPatterns, duplicatePayments, retrospective: extracted.retrospective, checksNotImplemented: NOT_IMPLEMENTED },
      confidence: 1,
      findings,
      reasonChain: [`${candidates.length} bill candidate(s), ${extracted.expenseCandidates.length} expense candidate(s), ${extracted.bankPatterns.length} bank pattern(s), ${duplicatePayments.length} duplicate payment posting(s)`],
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt): Promise<ActResult> {
    const tenantId = ctx.tenantId;

    for (const c of reasoned.proposal.candidates) {
      if (c.classification !== "certain" && c.classification !== "probable") continue;
      if (c.matchedOn.includes("split_amount")) continue; // no single valid subject document to hold — a combination, not one record

      const holdResult = await rt.callTool<{ holdId: string; alreadyOpen: boolean }>(
        "place_hold",
        { tenantId, subjectModel: "Invoice", subjectId: c.duplicateRef, reason: `Likely duplicate of ${c.primaryRef} (${c.classification}, matched on ${c.matchedOn.join(", ")})`, placedByWorkflow: "AI-27" },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
      );
      c.holdPlaced = true;
      void holdResult;
    }

    for (const dp of reasoned.proposal.duplicatePayments) {
      const holdResult = await rt.callTool<{ holdId: string; alreadyOpen: boolean }>(
        "place_hold",
        { tenantId, subjectModel: "Invoice", subjectId: dp.billId, reason: `Paid twice: ${dp.paymentIds.length} posted payments totalling ₹${dp.totalPaid} against a ₹${dp.billAmount} bill`, placedByWorkflow: "AI-27" },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
      );
      dp.holdPlaced = true;
      void holdResult;
    }

    await rt.callTool(
      "record_duplicate_findings",
      {
        tenantId,
        runId: rt.runId,
        candidates: reasoned.proposal.candidates,
        duplicatePayments: reasoned.proposal.duplicatePayments,
        retrospective: reasoned.proposal.retrospective,
        checksNotImplemented: reasoned.proposal.checksNotImplemented,
      },
      { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
    );

    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
