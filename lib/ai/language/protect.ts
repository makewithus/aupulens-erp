import { ENGLISH_WORDS, ROMAN_LOOKUP, DOMAIN_MISSPELLINGS } from "./lexicon";
import type { EntityType, ProtectedEntity } from "./types";

/**
 * Mask -> transform -> restore. Anything masked here is never seen by a spell-fixer or a
 * translator; it is restored verbatim afterwards (Rule 5). Numbers are deliberately NOT masked
 * (translators must see "45000 rupees"); they are verified unchanged after translation instead.
 */

/**
 * Two placeholder styles, chosen by the input's script (live-verified, docs/sarvam/LIVE_VERIFICATION.md §1):
 *  - "zxq"  ZXQ<n>ZXQ — survives native-script text and every English→regional reply (11/11), but in ROMAN-script /
 *           code-mixed text the real translator garbles it ("JXQ0ZXQ", "zxq zxq zxq …") 4 times in 10.
 *  - "ent"  Ent<n>    — a short name-like token: survived 9 of 10 of the same Roman/code-mixed sentences.
 * Restoration accepts either; any alteration/drop/duplicate still degrades (placeholdersIntact).
 */
const PH_PREFIX = "ZXQ";
export type PlaceholderStyle = "zxq" | "ent";
const PH_RX = /ZXQ\s*(\d+)\s*ZXQ|\bEnt(\d+)\b/gi;
const phIndex = (m: RegExpMatchArray | string[]) => Number(m[1] ?? m[2]);
export const placeholder = (i: number, style: PlaceholderStyle = "zxq") => (style === "ent" ? `Ent${i}` : `${PH_PREFIX}${i}${PH_PREFIX}`);
/** A literal "Ent3" in the user's own text would collide with the ent style — fall back to zxq. */
export const chooseStyle = (raw: string, latinScript: boolean): PlaceholderStyle => (latinScript && !/\bEnt\d+\b/i.test(raw) ? "ent" : "zxq");

interface Span { start: number; end: number; type: EntityType; prio: number }

const SUFFIX_RX = /^(?:pvt\.?|private|ltd\.?|limited|llp|inc\.?|corp\.?|co\.?|&|and|traders?|enterprises?|industries|sons)$/i;

const PATTERNS: { type: EntityType; rx: RegExp }[] = [
  { type: "quoted", rx: /"[^"\n]{1,300}"|“[^”\n]{1,300}”|(?<=^|[\s(])'[^'\n]{2,200}'(?=[\s).,;!?]|$)|‘[^’\n]{1,200}’/g },
  { type: "email", rx: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { type: "url", rx: /\bhttps?:\/\/[^\s<>"]+|\bwww\.[^\s<>"]+/gi },
  { type: "gstin", rx: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g },
  { type: "pan", rx: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { type: "tan", rx: /\b[A-Z]{4}\d{5}[A-Z]\b/g },
  { type: "phone", rx: /(?<![\w])(?:\+?91[\s-]?)?[6-9]\d{9}(?![\w])/g },
  { type: "date", rx: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g },
  // Mixed letters+digits (INV-2024-001, SKU-AB12, ab12cd). Ordinals/am-pm are not codes.
  {
    type: "code",
    rx: /(?<![\w])(?=[A-Za-z0-9\-_/.]*\d)(?=[A-Za-z0-9\-_/.]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9\-_/.]{1,}[A-Za-z0-9](?![\w])/g,
  },
];
const CODE_EXCLUDE = /^\d+(?:st|nd|rd|th|am|pm|k|lakhs?|lacs?|crores?|cr)$/i;

const MD_PATTERNS: { type: EntityType; rx: RegExp }[] = [
  { type: "label", rx: /\*\*[^*\n]+\*\*/g },
  { type: "label", rx: /`[^`\n]+`/g },
  { type: "url", rx: /\[[^\]\n]+\]\([^)\n]+\)/g },
];

// "PLEASEEEE" is an elongated word, not a name (found live: it was masked as an entity and reached the translator).
const collapse = (w: string) => w.replace(/([a-z])\1{2,}/g, "$1");
const isLexicon = (w: string) => ENGLISH_WORDS.has(w) || ROMAN_LOOKUP.has(w) || w in DOMAIN_MISSPELLINGS || ENGLISH_WORDS.has(collapse(w)) || ENGLISH_WORDS.has(w.replace(/([a-z])\1+/g, "$1"));

function nameSpans(text: string): Span[] {
  const spans: Span[] = [];
  const tokRx = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’.&-]*/g;
  const toks: { s: number; e: number; w: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokRx.exec(text))) toks.push({ s: m.index, e: m.index + m[0].length, w: m[0] });

  const alpha = toks.filter((t) => /[A-Za-z]/.test(t.w));
  const titleCount = alpha.filter((t) => t.w[0] === t.w[0].toUpperCase() && t.w !== t.w.toUpperCase()).length;
  const upperLetters = (text.match(/[A-Z]/g) || []).length;
  const allLetters = (text.match(/[A-Za-z]/g) || []).length || 1;
  // Title Case / ALL CAPS messages: only UNKNOWN words are candidate names, otherwise the
  // whole sentence would be masked and nothing could be translated.
  const shouty = upperLetters / allLetters > 0.7 && allLetters > 6;
  const titleCase = alpha.length >= 3 && titleCount / alpha.length >= 0.7;
  const lenient = shouty || titleCase;

  const sentenceStart = (idx: number) => {
    let i = idx - 1;
    while (i >= 0 && /\s/.test(text[i])) i--;
    return i < 0 || /[.!?\n:]/.test(text[i]);
  };

  let run: { s: number; e: number } | null = null;
  const flush = () => {
    if (run) spans.push({ start: run.s, end: run.e, type: "name", prio: 9 });
    run = null;
  };
  let prevEnd = -1;
  for (const t of toks) {
    const w = t.w.replace(/[.'’&-]+$/, "");
    const lower = w.toLowerCase();
    const isCap = w.length > 0 && w[0] === w[0].toUpperCase() && /[A-Za-z]/.test(w[0]);
    const isAllCapsAcronym = w.length >= 2 && w === w.toUpperCase();
    let protect = false;
    if (isCap) {
      if (lenient) protect = !isLexicon(lower);
      else if (isAllCapsAcronym) protect = !isLexicon(lower);
      else if (sentenceStart(t.s)) {
        // "Recipt Traders ke liye…": a known MISSPELLING at the start of a Capitalised run is a company name, not a typo
        // (found live: it was "corrected" to "Receipt"). Real English words ("Create Invoice…") still are not names.
        const next = toks[toks.indexOf(t) + 1];
        const nextIsCap = !!next && /^[A-Z]/.test(next.w) && /^[ \t]+$/.test(text.slice(t.e, next.s));
        protect = !isLexicon(lower) || (lower in DOMAIN_MISSPELLINGS && !ENGLISH_WORDS.has(lower) && nextIsCap);
      } else protect = !ROMAN_LOOKUP.has(lower); // "Ki"/"Kam" typed with a capital are Hindi words, not names (they were masked as entities and broke translation)
    }
    const gap = prevEnd >= 0 ? text.slice(prevEnd, t.s) : "";
    if (protect) {
      if (run && /^[ \t]+$/.test(gap)) run.e = t.s + w.length;
      else { flush(); run = { s: t.s, e: t.s + w.length }; }
    } else if (run && /^[ \t]+$/.test(gap) && SUFFIX_RX.test(w)) {
      run.e = t.s + t.w.length; // "Kanchipuram Silks" + "pvt ltd"
    } else flush();
    prevEnd = t.e;
  }
  flush();
  return spans;
}

export function protectEntities(
  text: string,
  opts: { markdown?: boolean; style?: PlaceholderStyle } = {},
): { masked: string; entities: ProtectedEntity[] } {
  const spans: Span[] = [];
  let prio = 0;
  const pats = opts.markdown ? [...MD_PATTERNS, ...PATTERNS] : PATTERNS;
  for (const { type, rx } of pats) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      if (m[0].length === 0) { rx.lastIndex++; continue; }
      if (type === "code" && CODE_EXCLUDE.test(m[0])) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, type, prio });
    }
    prio++;
  }
  // Names are detected on a COPY with every other entity blanked out, so a name run can never swallow part of a
  // PAN/GSTIN/code ("PAN AAPFU0939F" was split into "PAN AAPFU" + "F" — found live).
  const blank = (t: string) => { let o = t; for (const sp of spans) o = o.slice(0, sp.start) + " ".repeat(sp.end - sp.start) + o.slice(sp.end); return o; };
  if (!opts.markdown) spans.push(...nameSpans(blank(text)));
  else spans.push(...nameSpans(blank(text.replace(/\*\*[^*\n]+\*\*|`[^`\n]+`/g, (s) => " ".repeat(s.length)))));

  // Resolve overlaps: earliest start wins, then higher priority (lower number), then longer.
  spans.sort((a, b) => a.start - b.start || a.prio - b.prio || b.end - a.end);
  const chosen: Span[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start >= cursor) { chosen.push(s); cursor = s.end; }
  }

  const entities: ProtectedEntity[] = [];
  let out = "";
  let pos = 0;
  for (const s of chosen) {
    const ph = placeholder(entities.length, opts.style);
    entities.push({ type: s.type, value: text.slice(s.start, s.end), placeholder: ph });
    out += text.slice(pos, s.start) + ph;
    pos = s.end;
  }
  out += text.slice(pos);
  return { masked: out, entities };
}

/** True iff every placeholder survived exactly once — otherwise the transform is untrustworthy. */
export function placeholdersIntact(text: string, entities: ProtectedEntity[]): boolean {
  const seen = new Map<number, number>();
  for (const m of text.matchAll(PH_RX)) seen.set(phIndex(m), (seen.get(phIndex(m)) || 0) + 1);
  if (seen.size !== entities.length) return false;
  if (!entities.every((_, i) => seen.get(i) === 1)) return false;
  // Nothing placeholder-shaped may be left over once the well-formed ones are removed
  // ("ZXQ", "ZXQ1ZX", "zxq 3"…): a half-mangled token must never reach a model or a form.
  return !/ZXQ/i.test(text.replace(PH_RX, ""));
}

export function unprotectEntities(text: string, entities: ProtectedEntity[]): string {
  return text.replace(PH_RX, (whole, n1, n2) => {
    const e = entities[Number(n1 ?? n2)];
    return e ? e.value : whole;
  });
}

/** Apply `fn` only to the parts of `text` that are not placeholders. */
export function mapOutsidePlaceholders(text: string, fn: (s: string) => string): string {
  let out = "";
  let pos = 0;
  for (const m of text.matchAll(PH_RX)) {
    out += fn(text.slice(pos, m.index)) + m[0];
    pos = m.index! + m[0].length;
  }
  return out + fn(text.slice(pos));
}
