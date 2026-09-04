import { annotateStatement } from "@/lib/aiRuntime/statements/annotateStatement";
import { sampleItems } from "@/lib/aiRuntime/audit/sampling";
import type { Claim } from "@/lib/aiRuntime/audit/citations";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-18 — Audit / evidence intelligence (docs/ai/BRIEF-07-BATCH-F.md). "Show me the support for
 * this number." Composes AI-21's `drillIntoAccount()` and AI-22's reconciliation engine — builds
 * no new trace infrastructure of its own (`lib/aiRuntime/audit/traceEvidence.ts`).
 *
 * **Default trigger behaviour** (`period.horizon.reached`, OBSERVE): sweeps AI-21's own
 * `unsupportedMaterial` lines for the period — the accounts AI-21 already flagged as material AND
 * unreconciled — and builds a cited evidence pack for each, exactly the population an auditor
 * would ask about first. Ad-hoc lookups (`get_decision_trace`, one-off `build_evidence_pack`
 * calls) are exposed as tools other workflows/routes can call directly; this workflow's own
 * `act()` is the sweep.
 *
 * **A.2's citation rule is structural**: every `Claim` in this workflow's output was built via
 * `makeClaim()`/`makeNotFoundClaim()` (`lib/aiRuntime/audit/citations.ts`), which throws on an
 * empty citations array — an uncited claim cannot exist in this workflow's output, proven by a
 * test that asserts the constructor itself rejects one.
 */

interface Ai18Raw {
  period: string;
  periodEnd: string;
}

interface SweptAccount {
  accountId: string;
  accountName: string;
}

interface Ai18Extracted {
  period: string;
  periodEnd: string;
  sweptAccounts: SweptAccount[];
}

interface Ai18AccountPack {
  accountId: string;
  accountName: string;
  figures: Claim[];
  documents: Claim[];
  approvals: Claim[];
  reconciliations: Claim[];
  missingEvidence: { subjectRef: { model: string; id: string }; what: string }[];
}

interface Ai18Proposal {
  period: string;
  packId: string;
  accountPacks: Ai18AccountPack[];
  missingEvidenceCount: number;
  completenessScore: number;
  sample: { method: string; seed: string; items: string[] } | null;
}

function currentPeriod(): { period: string; periodEnd: Date } {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return { period, periodEnd };
}

export const ai18AuditEvidence: WorkflowDefinition<Ai18Raw, Ai18Extracted, Ai18Proposal> = {
  id: "AI-18",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  subscriptionFilter(): boolean {
    return true; // fan-out, same as AI-13/17/20/21/22
  },

  async observe(event): Promise<ObservedResult<Ai18Raw>> {
    const fallback = currentPeriod();
    const period = event.payload.period ? String(event.payload.period) : fallback.period;
    const periodEnd = event.payload.periodEnd ? String(event.payload.periodEnd) : fallback.periodEnd.toISOString();
    return { entityId: event.tenantId, raw: { period, periodEnd } };
  },

  async extract(observed, ctx): Promise<Ai18Extracted> {
    const [balanceSheet, incomeStatement] = await Promise.all([
      annotateStatement(ctx.tenantId, observed.raw.period, "balance_sheet"),
      annotateStatement(ctx.tenantId, observed.raw.period, "income_statement"),
    ]);
    const sweptAccounts: SweptAccount[] = [];
    for (const statement of [balanceSheet, incomeStatement]) {
      for (const group of Object.values(statement.groups)) {
        for (const line of group.lines) {
          if (line.unsupportedMaterial) sweptAccounts.push({ accountId: line.accountId, accountName: line.name });
        }
      }
    }
    return { period: observed.raw.period, periodEnd: observed.raw.periodEnd, sweptAccounts };
  },

  async reason(extracted): Promise<ReasonResult<Ai18Proposal>> {
    return {
      proposal: {
        period: extracted.period,
        packId: `${extracted.period}-sweep`,
        accountPacks: [],
        missingEvidenceCount: 0,
        completenessScore: 1,
        sample: null,
      },
      confidence: 1,
      findings: [],
      reasonChain: [`${extracted.sweptAccounts.length} unsupported material line(s) to build evidence for in ${extracted.period}`],
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const tenantId = ctx.tenantId;
    const findings: ActResult["findings"] = [];
    const accountPacks: Ai18AccountPack[] = [];
    let missingEvidenceCount = 0;
    let checkedCount = 0;

    for (const acc of extracted.sweptAccounts.slice(0, 20)) {
      const built = await rt.callTool<{ figures: Claim[]; documents: Claim[]; approvals: Claim[]; missingEvidence: Ai18AccountPack["missingEvidence"]; reconciliations: Claim[] }>(
        "build_evidence_pack",
        { tenantId, accountId: acc.accountId, accountName: acc.accountName, period: extracted.period, periodEnd: extracted.periodEnd },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
      );
      accountPacks.push({ accountId: acc.accountId, accountName: acc.accountName, ...built });
      checkedCount += 1;
      missingEvidenceCount += built.missingEvidence.length;

      if (built.missingEvidence.length > 0) {
        findings.push({
          id: `ai18-missing-evidence-${acc.accountId}-${extracted.period}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.HIGH,
          title: `Missing evidence: ${acc.accountName}`,
          detail: built.missingEvidence.map((m) => m.what).slice(0, 3).join("; "),
          confidence: 1,
          subjectRefs: [{ model: "Account", id: acc.accountId }],
          evidence: built.missingEvidence.slice(0, 10).map((m) => ({ kind: "record" as const, ref: m.subjectRef.id, label: m.subjectRef.model })),
          reasonChain: [],
        });
      }
    }

    const sampleSeed = `${tenantId}:${extracted.period}`;
    const sample =
      accountPacks.length > 0
        ? {
            method: "risk_weighted",
            seed: sampleSeed,
            items: sampleItems(accountPacks, (p) => p.accountId, Math.min(5, accountPacks.length), "risk_weighted", sampleSeed, (p) => p.missingEvidence.length + 1).map((p) => p.accountId),
          }
        : null;

    const completenessScore = checkedCount === 0 ? 1 : Math.max(0, 1 - missingEvidenceCount / Math.max(checkedCount, 1));

    await rt.callTool(
      "record_evidence_pack",
      {
        tenantId,
        packId: `${extracted.period}-sweep`,
        scope: { type: "period_sweep", period: extracted.period },
        figures: accountPacks.flatMap((p) => p.figures),
        documents: accountPacks.flatMap((p) => p.documents),
        approvals: accountPacks.flatMap((p) => p.approvals),
        reconciliations: accountPacks.flatMap((p) => p.reconciliations),
        decisionTraces: [],
        missingEvidence: accountPacks.flatMap((p) => p.missingEvidence),
        completenessScore,
        sample,
      },
      { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
    );

    reasoned.proposal.accountPacks = accountPacks;
    reasoned.proposal.missingEvidenceCount = missingEvidenceCount;
    reasoned.proposal.completenessScore = completenessScore;
    reasoned.proposal.sample = sample;

    return { findings, actionsTaken: [], metrics: { scanned: checkedCount, exceptions: missingEvidenceCount } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
