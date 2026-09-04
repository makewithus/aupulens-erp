/**
 * Human-readable display metadata for AI-XX workflow ids — UI-only, no behavioural meaning.
 * Kept separate from lib/aiRuntime/runtime/registry.ts (which is the real registration source
 * of truth) so a label update never touches runtime code. Update this alongside bootstrap.ts
 * whenever a new workflow is registered.
 */
export const AI_WORKFLOW_LABELS: Record<string, string> = {
  "AI-01": "Document Ingestion",
  "AI-02": "Ledger Classification",
  "AI-03": "Bank Reconciliation",
  "AI-04": "Expense Intelligence",
  "AI-05": "Receivables Operations",
  "AI-06": "Payables Operations",
  "AI-07": "Accrual Intelligence",
  "AI-08": "Prepaid/Deferred Schedules",
  "AI-09": "Revenue Recognition",
  "AI-10": "Fixed Assets",
  "AI-13": "Day Zero Close",
  "AI-14": "Flux Analysis",
  "AI-15": "Anomaly Detection",
  "AI-16": "Cash Intelligence",
  "AI-22": "Continuous Reconciliation",
  "AI-24": "Close Evidence",
  "AI-25": "Working Capital Intelligence",
  "AI-28": "Cutoff Intelligence",
};
