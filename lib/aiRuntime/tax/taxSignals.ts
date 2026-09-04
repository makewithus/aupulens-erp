import { AI_TAX_DIRECTION } from "@/models/ai/AiTaxTransaction";

/**
 * Pure signal-derivation over already-projected `AiTaxTransaction` rows, shared between AI-12
 * (which raises these as findings on its own run) and AI-17 (which reads the same two signals as
 * inputs to an obligation's readiness — never a second, disagreeing computation).
 */

export interface TaxSignalRow {
  _id: unknown;
  direction: string;
  taxableAmount: number;
  taxAmount: number;
  counterpartyTaxRegistrationNumber: string | null;
  sourceRef: { model: string; id: unknown };
}

export interface TreatmentException {
  transactionId: string;
  sourceRef: { model: string; id: string };
  detail: string;
}

export interface MissingEvidence {
  transactionId: string;
  sourceRef: { model: string; id: string };
  what: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A transaction whose tax/taxable ratio deviates >20% (documented heuristic — no per-transaction
 *  rate baseline exists to consult) from other same-direction transactions this period. Proposal-
 *  only; never touches `TaxRate`. */
export function findTreatmentExceptions(rows: TaxSignalRow[]): TreatmentException[] {
  const exceptions: TreatmentException[] = [];
  for (const direction of [AI_TAX_DIRECTION.INPUT, AI_TAX_DIRECTION.OUTPUT]) {
    const group = rows.filter((r) => r.direction === direction && r.taxableAmount > 0);
    if (group.length < 3) continue; // too small a sample to call anything an outlier
    const ratios = group.map((r) => r.taxAmount / r.taxableAmount);
    const meanRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    group.forEach((r, i) => {
      if (meanRatio > 0 && Math.abs(ratios[i] - meanRatio) / meanRatio > 0.2) {
        exceptions.push({
          transactionId: String(r._id),
          sourceRef: { model: r.sourceRef.model, id: String(r.sourceRef.id) },
          detail: `tax/taxable ratio ${round2(ratios[i] * 100)}% vs this period's ${direction} average of ${round2(meanRatio * 100)}%`,
        });
      }
    });
  }
  return exceptions;
}

/** Input credit claimed with no counterparty tax registration number on file. */
export function findMissingEvidence(rows: TaxSignalRow[]): MissingEvidence[] {
  const missing: MissingEvidence[] = [];
  for (const r of rows) {
    if (r.direction === AI_TAX_DIRECTION.INPUT && !r.counterpartyTaxRegistrationNumber) {
      missing.push({ transactionId: String(r._id), sourceRef: { model: r.sourceRef.model, id: String(r.sourceRef.id) }, what: "input credit claimed with no counterparty tax registration number on file" });
    }
  }
  return missing;
}
