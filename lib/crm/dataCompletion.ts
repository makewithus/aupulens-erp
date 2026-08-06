/**
 * Real, deterministic data-completeness scanner (Phase 2).
 *
 * This is deliberately NOT an LLM call — checking whether a required field
 * is null/empty across potentially thousands of records is a mechanical
 * completeness check, not a judgment task; an LLM call per record would add
 * cost and latency for zero benefit over a plain field-presence check. This
 * mirrors the same reasoning duplicate detection (lib/crm/ai/duplicateAssistant.ts)
 * already uses: the right tool for this specific job isn't an LLM.
 *
 * Replaces the old lib/crm/dataGovernance/{dataQualityEngine,dataHealthScore}.ts,
 * which were fully written but never called from anywhere — this one backs
 * the real /crm/ai/dashboard "Data Health" widget.
 */

const LEAD_KEY_FIELDS: Array<{ field: string; label: string }> = [
  { field: "company_name", label: "Company Name" },
  { field: "budget_range", label: "Budget Range" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "expected_timeline", label: "Expected Timeline" },
];

export interface DataCompletionSummary {
  totalRecords: number;
  completeRecords: number;
  healthPercent: number;
  missingFieldCount: number;
  missingByField: Record<string, number>;
}

export function analyzeLeadCompleteness(leads: any[]): DataCompletionSummary {
  const missingByField: Record<string, number> = {};
  for (const f of LEAD_KEY_FIELDS) missingByField[f.label] = 0;

  let missingFieldCount = 0;
  let completeRecords = 0;

  for (const lead of leads) {
    let missingOnThisRecord = 0;
    for (const f of LEAD_KEY_FIELDS) {
      const value = (lead as any)[f.field];
      const isMissing = value === undefined || value === null || value === "";
      if (isMissing) {
        missingByField[f.label]++;
        missingFieldCount++;
        missingOnThisRecord++;
      }
    }
    if (missingOnThisRecord === 0) completeRecords++;
  }

  const totalRecords = leads.length;
  const totalPossibleFields = totalRecords * LEAD_KEY_FIELDS.length;
  const healthPercent = totalPossibleFields > 0 ? Math.round(((totalPossibleFields - missingFieldCount) / totalPossibleFields) * 100) : 100;

  return { totalRecords, completeRecords, healthPercent, missingFieldCount, missingByField };
}
