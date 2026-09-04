/**
 * AI-27's document-number normalisation (docs/ai/BRIEF-08a-BATCH-G.md, AI-27 similarity
 * dimensions: "Same vendor + same document number, normalised (strip spaces, leading zeros,
 * case, punctuation)"). Deliberately separate from `lib/docIntel/duplicateCheck.ts`'s own `norm()`
 * (trim+lowercase only) — that function has existing callers (AI-01's extraction flow, AI-06) that
 * must behave identically; this is a new, stricter normalisation for AI-27's own cross-source
 * scoring, not a change to the existing one.
 */
export function normalizeDocNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // strip spaces and punctuation
    .replace(/\d+/g, (run) => String(parseInt(run, 10))); // strip leading zeros within each numeric run — "INV-001" and "INV-0001" both become "inv1"
}

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000);
}
