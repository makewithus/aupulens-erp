/**
 * The "manual journal to a sensitive account" pattern (AI-15's journal-pattern detector family,
 * Chunk 5) — extracted into a plain function per docs/ai/BRIEF-07-BATCH-F.md A.3: "AI-23 consumes
 * AI-15's detectors; it does not rebuild them." AI-15's own workflow wraps this exact function
 * (a behaviour-preserving refactor); AI-23 calls it directly as one of its own risk-score
 * dimensions, rather than growing a second detector list.
 */

export const SENSITIVE_ACCOUNT_TYPES = new Set(["asset_cash"]);
export const SENSITIVE_GROUPS = new Set(["income", "equity"]);

export function isManualJournalToSensitiveAccount(journalType: string, accountType: string, internalGroup: string): boolean {
  if (journalType !== "general") return false; // manual entry, not an auto-posted business document
  return SENSITIVE_ACCOUNT_TYPES.has(accountType) || SENSITIVE_GROUPS.has(internalGroup);
}
