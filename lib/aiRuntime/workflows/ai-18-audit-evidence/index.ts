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

// Same defect class fixed in AI-14/AI-25/AI-17/AI-29 (docs/ai/BRIEF-09-VERIFICATION.md Part B):
// an unvalidated event.payload.period/periodEnd on `period.horizon.reached` reaches
// annotateStatement()'s report-building Date logic as NaN/Invalid Date, which risks an uncaught
// Mongoose cast exception the same way AI-14's did. Only a MISSING field was guarded before
// (`event.payload.period ? ... : fallback`); a present-but-malformed string was not. Now: validate
// the period's shape and always DERIVE periodEnd from the validated period rather than trusting a
// separately-supplied periodEnd string.
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const MAX_ACCOUNTS_PER_SWEEP = 20;

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
    const rawPeriod = event.payload.period;
    const period = typeof rawPeriod === "string" && PERIOD_PATTERN.test(rawPeriod) ? rawPeriod : currentPeriod().period;
    const [y, m] = period.split("-").map(Number);
    const periodEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
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

    for (const acc of extracted.sweptAccounts.slice(0, MAX_ACCOUNTS_PER_SWEEP)) {
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

    // Bug found in this pass (docs/ai/verification/AI-18.md §9, C.6 adversarial): with more than
    // MAX_ACCOUNTS_PER_SWEEP material-unsupported accounts in a period, the sweep above only ever
    // BUILDS a pack for the first 20 — but completenessScore was computed as
    // `1 - missingEvidenceCount / checkedCount`, i.e. only over the accounts actually checked. A
    // tenant with, say, 25 unsupported accounts where the first 20 all evidence cleanly reported
    // completenessScore: 1 (100% complete) while 5 known-unsupported accounts were never
    // evidenced at all this run — a confidently wrong "fully evidenced" signal a reviewer would
    // accept at face value. Root cause: the denominator excluded the very items the cap skipped.
    // Fixed by scoring against the TOTAL swept population (never just what fit this run) and
    // treating every unchecked account as incomplete (honest, conservative — we have no evidence
    // either way), plus a stated finding so "N accounts not yet evidenced this run" is never
    // silent. The skipped accounts are still picked up on the next sweep (this trigger recurs
    // hourly) — this only fixes what THIS run's own completenessScore claims about itself.
    const sweptTotal = extracted.sweptAccounts.length;
    const uncheckedCount = sweptTotal - checkedCount;
    if (uncheckedCount > 0) {
      findings.push({
        id: `ai18-sweep-cap-${extracted.period}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: `${uncheckedCount} material unsupported account(s) not yet evidenced this run`,
        detail: `${sweptTotal} account(s) were flagged material-and-unsupported this period; only the first ${MAX_ACCOUNTS_PER_SWEEP} were evidenced in this run. The remaining ${uncheckedCount} are not reflected in this run's completenessScore as complete and will be picked up on a subsequent sweep.`,
        confidence: 1,
        subjectRefs: extracted.sweptAccounts.slice(MAX_ACCOUNTS_PER_SWEEP).map((a) => ({ model: "Account", id: a.accountId })),
        evidence: [],
        reasonChain: [],
      });
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

    const completenessScore = sweptTotal === 0 ? 1 : Math.max(0, 1 - (missingEvidenceCount + uncheckedCount) / sweptTotal);

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
