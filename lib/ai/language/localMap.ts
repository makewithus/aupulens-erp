/**
 * Deterministic local mapping for the MOST COMMON code-mixed invoice vocabulary ("invoice banao for Acme, amount
 * 45000 rupees"). Found live (docs/sarvam/live-results): the translator returned degenerate text for exactly this
 * canonical sentence, and dropped the customer name even unmasked. Text that is really English plus a few Hindi
 * particles does not need a paid, fallible round trip: map the particles, and if NOTHING unmapped Roman-Indic remains,
 * skip the provider (0 ms, 0 cost). Otherwise the text goes to the provider exactly as before.
 * Only unambiguous verbs/particles/currency words are mapped; names, ids and numbers are never touched (they are
 * masked / digits). The result is always shown back ("I understood this as…") and confirmed in the summary.
 */
const NOUN = "(?:invoice|invoices|bill|quote|quotation|customer|order|receipt|payment|challan)";
const MAKE = "(?:banao|bana\\s+do|banado|banana\\s+hai|banani\\s+hai|banaiye|banaye|bana\\s+dijiye|karo|kar\\s+do|kardo)";

const RULES: [RegExp, string][] = [
  // OV word order: "<noun> banao" → "create <noun>"  (mujhe … banana hai → I need to create …)
  [new RegExp(`\\bmujhe\\s+(?:ek\\s+)?(${NOUN})\\s+${MAKE}\\b`, "gi"), "I need to create $1"],
  [new RegExp(`\\b(?:ek\\s+)?(${NOUN})\\s+${MAKE}\\b`, "gi"), "create $1"],
  // "<entity> ke liye" → "for <entity>" — only when the entity is a single masked token (a multi-word lowercase name is left to the provider).
  [/\b(ZXQ\d+ZXQ|Ent\d+)\s+ke\s+liye\b/g, "for $1"],
  [/\b(?:rupaye|rupay|rupaya)\b/gi, "rupees"],
  [/\b(?:hazaar|hazar)\b/gi, "thousand"],
  [/\bdikhao\b/gi, "show"],
  [/\bbhejo\b/gi, "send"],
  [/\baur\b/gi, "and"],
];

export function localRomanToEnglish(text: string): { text: string; changed: boolean } {
  let out = text;
  for (const [rx, to] of RULES) out = out.replace(rx, to);
  return { text: out, changed: out !== text };
}
