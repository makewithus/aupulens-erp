/**
 * AI-19's masking rule (docs/ai/BRIEF-08a-BATCH-G.md, AI-19) — "Bank details must be masked in
 * every output, log, attention item and decision trace — last four characters only." Applied at
 * the single point every bank-detail value passes through on its way into any persisted or
 * returned structure (`snapshot.ts`), so there is no second code path where an unmasked value
 * could leak.
 */
export function maskValue(value: unknown): string {
  const s = String(value ?? "").trim();
  if (s.length === 0) return "";
  if (s.length <= 4) return "*".repeat(s.length);
  return "*".repeat(s.length - 4) + s.slice(-4);
}
