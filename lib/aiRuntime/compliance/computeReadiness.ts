import connectDB from "@/lib/db";
import AiComplianceProfile, { type IAiComplianceObligation, type IAiComplianceRegistration } from "@/models/ai/AiComplianceProfile";
import AiTaxTransaction, { AI_TAX_DIRECTION } from "@/models/ai/AiTaxTransaction";
import { RECONCILIATION_DEFINITIONS, runReconciliationDefinition } from "@/lib/aiRuntime/reconciliation/engine";
import { findTreatmentExceptions, findMissingEvidence } from "@/lib/aiRuntime/tax/taxSignals";

/**
 * AI-17's obligation-readiness computation (docs/ai/BRIEF-06-BATCH-E.md, AI-17) — shared between
 * AI-17's own workflow and AI-13's new `compliance` close domain, so neither re-derives a
 * disagreeing answer (the same "most of the workflow is aggregation of work already done"
 * precedent AI-13 itself set).
 *
 * **"Deadline risk scored early"**: a *fully clean* obligation (reconciled, evidenced, no
 * registration gap) still reports `at_risk` once `daysRemaining <= warningWindowDays` — the
 * brief's own bar is "an obligation that first appears at-risk three days before its deadline is
 * a failure of this workflow," and `warningWindowDays` defaults generous (21 days, weeks not
 * days) precisely so this never comes as a surprise. A *hard* problem (unreconciled three-way,
 * missing evidence, an open registration gap) is always `blocked`, regardless of how much time is
 * left — deadline proximity only ever adds urgency, never removes a real blocker.
 *
 * **Scope of the obligation calendar**: an obligation is "due this run" only when the evaluated
 * `period` is that obligation's own period-end bucket — a monthly obligation matches every
 * period, a quarterly one only when `period`'s month closes a quarter (Mar/Jun/Sep/Dec), an
 * annual one only at fiscal year-end (Dec, until a configurable fiscal year-end exists). This is
 * a documented simplification, not a full multi-period calendar generator — see
 * `docs/ai/OPEN_QUESTIONS.md`.
 *
 * **Registration gaps**: this codebase has no place-of-supply signal to detect "taxable activity
 * in a jurisdiction we're not registered in" from transaction data alone (the same limitation
 * `rebuildTaxProjection.ts` documents for jurisdiction resolution). What *is* honestly derivable
 * from the profile itself: (1) an obligation naming a jurisdiction with no matching registration
 * on file — the human's own configuration is internally inconsistent; (2) a registered threshold
 * whose actual turnover (this fiscal year's projected output tax base) has been crossed with no
 * registration recorded for that jurisdiction/taxType. Both are real, config-grounded findings,
 * never a guess about where a specific transaction was supplied.
 */

export type ObligationReadinessStatus = "ready" | "at_risk" | "blocked" | "not_started";

export interface ObligationReadiness {
  jurisdiction: string;
  taxType: string;
  returnType: string;
  period: string;
  deadline: Date;
  daysRemaining: number;
  warningWindowDays: number;
  readiness: ObligationReadinessStatus;
  blockers: string[];
  workpaperRef: string | null;
  missingEvidence: string[];
  lastFiledNote: string;
}

export interface RegistrationGap {
  jurisdiction: string;
  taxType: string;
  severity: "high";
  reason: string;
}

export interface ComplianceReadinessComputation {
  profileConfigured: boolean;
  obligations: ObligationReadiness[];
  registrationGaps: RegistrationGap[];
  submissionCapability: "not_implemented";
}

function periodMonth(period: string): number {
  return Number(period.split("-")[1]);
}

function obligationDueThisPeriod(o: IAiComplianceObligation, period: string): boolean {
  if (period < o.firstPeriod) return false;
  const month = periodMonth(period);
  if (o.frequency === "monthly") return true;
  if (o.frequency === "quarterly") return [3, 6, 9, 12].includes(month);
  if (o.frequency === "annual") return month === 12;
  return false;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function periodEndOf(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

function fiscalYearOf(period: string): string {
  return period.split("-")[0];
}

/** @param asOfDate the "today" readiness/deadline-risk is scored against — defaults to now. */
export async function computeComplianceReadiness(tenantId: string, period: string, asOfDate: Date = new Date()): Promise<ComplianceReadinessComputation> {
  await connectDB();
  const profile = await AiComplianceProfile.findOne({ tenantId }).lean();
  const profileConfigured = Boolean(profile && (profile.registrations.length > 0 || profile.obligations.length > 0 || profile.thresholds.length > 0));

  if (!profileConfigured) {
    return { profileConfigured: false, obligations: [], registrationGaps: [], submissionCapability: "not_implemented" };
  }

  const registrations: IAiComplianceRegistration[] = profile!.registrations;
  const hasRegistration = (jurisdiction: string, taxType: string) => registrations.some((r) => r.jurisdiction === jurisdiction && r.taxType === taxType);

  // ── Registration gaps: config-internal-consistency only (A.2 — never a guessed transaction-level jurisdiction). ──
  const registrationGaps: RegistrationGap[] = [];
  for (const o of profile!.obligations) {
    if (!hasRegistration(o.jurisdiction, o.taxType)) {
      registrationGaps.push({
        jurisdiction: o.jurisdiction,
        taxType: o.taxType,
        severity: "high",
        reason: `An obligation is configured for ${o.jurisdiction}/${o.taxType} but no matching registration is on file`,
      });
    }
  }
  const fyPrefix = fiscalYearOf(period);
  const fyOutputRows = await AiTaxTransaction.find({ tenantId, direction: AI_TAX_DIRECTION.OUTPUT, periodKey: { $regex: `^${fyPrefix}-` } })
    .select("taxableAmount")
    .lean();
  const fyTurnover = fyOutputRows.reduce((s, r) => s + (r.taxableAmount ?? 0), 0);
  for (const t of profile!.thresholds) {
    if (!hasRegistration(t.jurisdiction, t.taxType) && fyTurnover >= t.turnoverThreshold) {
      registrationGaps.push({
        jurisdiction: t.jurisdiction,
        taxType: t.taxType,
        severity: "high",
        reason: `${t.jurisdiction}/${t.taxType} year-to-date turnover of ₹${fyTurnover} exceeds the configured threshold of ₹${t.turnoverThreshold} with no registration on file`,
      });
    }
  }

  // ── Obligation readiness ──
  const taxDefinition = RECONCILIATION_DEFINITIONS.find((d) => d.id === "tax")!;
  const obligations: ObligationReadiness[] = [];
  const dueObligations = profile!.obligations.filter((o) => obligationDueThisPeriod(o, period));
  const periodEnd = periodEndOf(period);

  for (const o of dueObligations) {
    const deadline = addDays(periodEnd, o.dueDayOffset);
    const daysRemaining = Math.ceil((deadline.getTime() - asOfDate.getTime()) / (24 * 60 * 60 * 1000));
    const warningWindow = o.warningWindowDays ?? 21;

    const rows = await AiTaxTransaction.find({ tenantId, periodKey: period }).lean();
    const blockers: string[] = [];
    let readiness: ObligationReadinessStatus;

    if (rows.length === 0) {
      readiness = "not_started";
      blockers.push("no tax transactions have been projected for this period yet — run AI-12's rebuild");
    } else {
      const reconciliation = await runReconciliationDefinition(tenantId, taxDefinition, periodEnd, period);
      const reconciled = reconciliation.status === "reconciled" || reconciliation.status === "not_applicable";
      if (!reconciled) blockers.push(`three-way reconciliation is ${reconciliation.status} — ledger vs projected transactions disagree`);

      const missing = findMissingEvidence(rows);
      if (missing.length > 0) blockers.push(`${missing.length} transaction(s) missing counterparty registration number evidence`);

      const treatmentExceptions = findTreatmentExceptions(rows);
      if (treatmentExceptions.length > 0) blockers.push(`${treatmentExceptions.length} transaction(s) have an unreviewed treatment exception`);

      const hasGap = registrationGaps.some((g) => g.jurisdiction === o.jurisdiction && g.taxType === o.taxType);
      if (hasGap) blockers.push("a registration gap is open for this jurisdiction/taxType");

      const hardBlocked = !reconciled || missing.length > 0 || hasGap;
      if (hardBlocked) {
        readiness = "blocked";
      } else if (treatmentExceptions.length > 0 || daysRemaining <= warningWindow) {
        readiness = "at_risk";
      } else {
        readiness = "ready";
      }
    }

    obligations.push({
      jurisdiction: o.jurisdiction,
      taxType: o.taxType,
      returnType: o.returnType,
      period,
      deadline,
      daysRemaining,
      warningWindowDays: warningWindow,
      readiness,
      blockers,
      workpaperRef: rows.length > 0 ? `${tenantId}:${period}:${o.returnType}` : null,
      missingEvidence: rows.length > 0 ? findMissingEvidence(rows).map((m) => m.what) : [],
      lastFiledNote: "no filing history exists in this system — submission is not_implemented (A.3)",
    });
  }

  return { profileConfigured: true, obligations, registrationGaps, submissionCapability: "not_implemented" };
}
