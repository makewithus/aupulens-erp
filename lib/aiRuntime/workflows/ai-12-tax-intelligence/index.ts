import connectDB from "@/lib/db";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiTaxTransaction, { AI_TAX_DIRECTION } from "@/models/ai/AiTaxTransaction";
import { findTreatmentExceptions, findMissingEvidence } from "@/lib/aiRuntime/tax/taxSignals";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-12 — Tax intelligence (docs/ai/BRIEF-06-BATCH-E.md). Gets tax treatment right, keeps the
 * tax ledger reconciled to the returns, and has the workpaper ready before the deadline.
 *
 * **Everything substantive happens in `act()`, not `reason()`** — a deliberate departure from
 * this project's usual shape. `extract()`/`reason()` never receive `rt` (only `act()` does, by
 * the 10-stage pipeline's own design), and `rebuild_tax_projection` (A.1 — the tax ledger is a
 * derived projection, never a source of truth) must run through the registered tool, not a
 * direct call from workflow code. So the rebuild, and everything that depends on its freshly
 * rebuilt output, has to live where tool calls are actually allowed. `reason()`'s own proposal is
 * mutated in place once `act()`'s real numbers are known — the same pattern AI-13 uses for
 * `autoResolvedThisRun`, here applied at the workflow level; `executor.ts` serializes
 * `reasoned.proposal` only after `act()` returns, so this is a supported shape, not a hack.
 *
 * **Three-way reconciliation**: ledger (the GL tax control account, via AI-22's `tax`
 * reconciliation definition — never a second engine), transactions (the projection's own sum),
 * return (the workpaper's net-payable box, itself built from the same projection). Transactions
 * and return are mathematically the same computation viewed two ways, so they tie exactly by
 * construction; the meaningful gap this surfaces is always ledger-vs-the-other-two — the real
 * difference AI-22 already finds.
 *
 * **The AI never computes a tax figure** (A.1) — `TaxRate` cannot be mutated by anything here;
 * no write tool for it exists anywhere in the registry (asserted directly in tests). Empty
 * `AiComplianceProfile` → `not_configured` everywhere (A.2) — no assumed GST-monthly default.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Ai12Raw {
  actingUserId?: string;
  period: string;
  periodEnd: string;
}

interface Ai12Extracted {
  actingUserId?: string;
  period: string;
  periodEnd: Date;
  profileConfigured: boolean;
  returnType: string | null;
  jurisdiction: string | null;
}

interface Ai12Proposal {
  period: string;
  jurisdiction: string | null;
  profileConfigured: boolean;
  returnDataset: { returnType: string | null; boxes: { code: string; label: string; value: number; supporting_transaction_count: number; supporting_refs: string[] }[] } | null;
  threeWay: { ledger: number; transactions: number; return: number; differences: { pair: string; amount: number; tracedRefs: string[] }[] };
  treatmentExceptions: { transactionId: string; sourceRef: { model: string; id: string }; detail: string }[];
  missingEvidence: { transactionId: string; sourceRef: { model: string; id: string }; what: string }[];
  jurisdictionUnresolvedCount: number;
}

export const ai12TaxIntelligence: WorkflowDefinition<Ai12Raw, Ai12Extracted, Ai12Proposal> = {
  id: "AI-12",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached"],
  actionClass: "tax_intelligence",
  defaultAutonomy: AI_AUTONOMY_LEVEL.RECOMMEND,

  async subscriptionFilter(): Promise<boolean> {
    return true; // fan-out, shared with AI-13/14/22/24/25/28
  },

  async observe(event): Promise<ObservedResult<Ai12Raw>> {
    const period = String(event.payload.period);
    const periodEnd = String(event.payload.periodEnd);
    return { entityId: `${event.tenantId}:${period}`, raw: { period, periodEnd, actingUserId: event.payload.actingUserId ? String(event.payload.actingUserId) : undefined } };
  },

  async extract(observed, ctx): Promise<Ai12Extracted> {
    await connectDB();
    const tenantId = ctx.tenantId;
    const period = observed.raw.period;

    const profile = await AiComplianceProfile.findOne({ tenantId }).lean();
    const profileConfigured = Boolean(profile && (profile.registrations.length > 0 || profile.obligations.length > 0 || profile.thresholds.length > 0));
    const relevantObligation = profile?.obligations.find((o) => o.firstPeriod <= period) ?? profile?.obligations[0];
    const returnType = profileConfigured ? relevantObligation?.returnType ?? null : null;
    const jurisdiction = profile && profile.registrations.length === 1 ? profile.registrations[0].jurisdiction : null;

    return {
      actingUserId: observed.raw.actingUserId,
      period,
      periodEnd: new Date(observed.raw.periodEnd),
      profileConfigured,
      returnType,
      jurisdiction,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai12Proposal>> {
    return {
      proposal: {
        period: extracted.period,
        jurisdiction: extracted.jurisdiction,
        profileConfigured: extracted.profileConfigured,
        returnDataset: null,
        threeWay: { ledger: 0, transactions: 0, return: 0, differences: [] },
        treatmentExceptions: [],
        missingEvidence: [],
        jurisdictionUnresolvedCount: 0,
      },
      confidence: 1,
      findings: [],
      reasonChain: [`rebuilding and reconciling the tax projection for ${extracted.period}`, extracted.profileConfigured ? "compliance profile configured" : "no compliance profile configured — not_configured, never an assumed default"],
      gateOverrides: { periodOpen: true, permissionOk: true },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const tenantId = ctx.tenantId;
    const findings: ActResult["findings"] = [];
    const reasonChain: string[] = [];

    await rt.callTool("rebuild_tax_projection", { tenantId, period: extracted.period }, { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE });

    const rows = await AiTaxTransaction.find({ tenantId, periodKey: extracted.period }).lean();
    reasonChain.push(`${rows.length} projected tax transaction(s) after rebuild`);

    const { result: ledgerResult } = await rt.callTool<{ result: { rightTotal: number; status: string } }>(
      "run_tax_reconciliation",
      { tenantId, periodEnd: extracted.periodEnd.toISOString(), period: extracted.period },
      { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
    );
    const ledgerTotal = ledgerResult.rightTotal;
    const ledgerNotApplicable = ledgerResult.status === "not_applicable";

    // ── Transactions total (input positive, output negative — the same debit-normal axis the GL uses) ──
    const transactionsTotal = round2(rows.reduce((s, r) => s + (r.direction === AI_TAX_DIRECTION.INPUT ? r.taxAmount : -r.taxAmount), 0));
    const outputTotal = round2(rows.filter((r) => r.direction === AI_TAX_DIRECTION.OUTPUT).reduce((s, r) => s + r.taxAmount, 0));
    const inputTotal = round2(rows.filter((r) => r.direction === AI_TAX_DIRECTION.INPUT).reduce((s, r) => s + r.taxAmount, 0));
    const returnTotal = round2(inputTotal - outputTotal);

    const differences: Ai12Proposal["threeWay"]["differences"] = [];
    if (!ledgerNotApplicable) {
      const ledgerVsTx = round2(ledgerTotal - transactionsTotal);
      if (Math.abs(ledgerVsTx) >= 0.01) differences.push({ pair: "ledger_vs_transactions", amount: ledgerVsTx, tracedRefs: rows.map((r) => String(r._id)) });
      const ledgerVsReturn = round2(ledgerTotal - returnTotal);
      if (Math.abs(ledgerVsReturn) >= 0.01) differences.push({ pair: "ledger_vs_return", amount: ledgerVsReturn, tracedRefs: rows.map((r) => String(r._id)) });
    }
    const txVsReturn = round2(transactionsTotal - returnTotal);
    if (Math.abs(txVsReturn) >= 0.01) differences.push({ pair: "transactions_vs_return", amount: txVsReturn, tracedRefs: rows.map((r) => String(r._id)) });

    for (const d of differences) {
      findings.push({
        id: `ai12-threeway-${d.pair}-${extracted.period}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: `Tax three-way mismatch: ${d.pair.replace(/_/g, " ")}`,
        detail: `₹${d.amount} difference for ${extracted.period}`,
        amount: d.amount,
        confidence: 1,
        subjectRefs: [],
        evidence: d.tracedRefs.slice(0, 20).map((ref) => ({ kind: "record" as const, ref, label: "AiTaxTransaction" })),
        reasonChain: [],
      });
    }

    // ── Treatment review, proposal-only: flag a transaction whose tax/taxable ratio deviates
    // materially from other same-direction transactions this period. Never touches TaxRate.
    // Shared with AI-17's obligation-readiness check (lib/aiRuntime/tax/taxSignals.ts) — never a
    // second, disagreeing computation.
    const treatmentExceptions = findTreatmentExceptions(rows);

    // ── Missing evidence ──
    const missingEvidence = findMissingEvidence(rows);
    if (missingEvidence.length > 0) {
      findings.push({
        id: `ai12-missing-evidence-${extracted.period}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: `${missingEvidence.length} input credit(s) with no counterparty registration number`,
        detail: missingEvidence.map((m) => m.what).slice(0, 3).join("; "),
        confidence: 1,
        subjectRefs: [],
        evidence: missingEvidence.slice(0, 20).map((m) => ({ kind: "record" as const, ref: m.transactionId, label: "AiTaxTransaction" })),
        reasonChain: [],
      });
    }
    const jurisdictionUnresolvedCount = rows.filter((r) => !r.jurisdiction).length;

    // ── Workpaper ──
    let returnDataset: Ai12Proposal["returnDataset"] = null;
    if (extracted.profileConfigured && extracted.returnType) {
      returnDataset = await rt.callTool<Ai12Proposal["returnDataset"]>(
        "build_tax_workpaper",
        { tenantId, period: extracted.period, returnType: extracted.returnType },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
      );
    }

    // Mutate the already-returned reason() proposal in place — executor.ts only serializes
    // reasoned.proposal after act() returns, so this is reflected in the final trace/envelope.
    reasoned.proposal.returnDataset = returnDataset;
    reasoned.proposal.threeWay = { ledger: ledgerTotal, transactions: transactionsTotal, return: returnTotal, differences };
    reasoned.proposal.treatmentExceptions = treatmentExceptions;
    reasoned.proposal.missingEvidence = missingEvidence;
    reasoned.proposal.jurisdictionUnresolvedCount = jurisdictionUnresolvedCount;

    return { findings, actionsTaken: [], metrics: { scanned: rows.length, exceptions: differences.length + missingEvidence.length }, reasonChain };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
