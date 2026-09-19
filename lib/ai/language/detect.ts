import { LANGUAGE_CODE, type LanguageCode } from "@/lib/constants/statuses";
import type { Detection, ScriptKind } from "./types";
import { ENGLISH_WORDS, ROMAN_LOOKUP, MARATHI_DEVANAGARI, HINDI_DEVANAGARI, DOMAIN_MISSPELLINGS } from "./lexicon";

/** Cheap, local, allocation-light detection. Runs before ANY provider call. */

const SCRIPT_RANGES: { script: ScriptKind; lo: number; hi: number; lang: LanguageCode }[] = [
  { script: "Deva", lo: 0x0900, hi: 0x097f, lang: LANGUAGE_CODE.HINDI },
  { script: "Beng", lo: 0x0980, hi: 0x09ff, lang: LANGUAGE_CODE.BENGALI },
  { script: "Guru", lo: 0x0a00, hi: 0x0a7f, lang: LANGUAGE_CODE.PUNJABI },
  { script: "Gujr", lo: 0x0a80, hi: 0x0aff, lang: LANGUAGE_CODE.GUJARATI },
  { script: "Orya", lo: 0x0b00, hi: 0x0b7f, lang: LANGUAGE_CODE.ODIA },
  { script: "Taml", lo: 0x0b80, hi: 0x0bff, lang: LANGUAGE_CODE.TAMIL },
  { script: "Telu", lo: 0x0c00, hi: 0x0c7f, lang: LANGUAGE_CODE.TELUGU },
  { script: "Knda", lo: 0x0c80, hi: 0x0cff, lang: LANGUAGE_CODE.KANNADA },
  { script: "Mlym", lo: 0x0d00, hi: 0x0d7f, lang: LANGUAGE_CODE.MALAYALAM },
];

const NONE: Detection = { language: "und", script: "None", kind: "none", confidence: 1, ambiguous: false };

export function detectLanguage(text: string): Detection {
  const counts: Record<string, number> = {};
  let latin = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) {
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
      continue;
    }
    if (c < 0x0900) {
      // Latin-1 / extended Latin letters vs. Arabic/Cyrillic/Greek etc.
      if (c >= 0xc0 && c <= 0x24f) latin++;
      else if (c >= 0x370 && c <= 0x6ff) other++;
      continue;
    }
    let hit = false;
    for (const r of SCRIPT_RANGES) {
      if (c >= r.lo && c <= r.hi) {
        counts[r.script] = (counts[r.script] || 0) + 1;
        hit = true;
        break;
      }
    }
    if (!hit && ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x3040 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af))) other++;
  }

  const indicTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const letters = latin + indicTotal + other;
  if (letters === 0) return NONE;

  if (indicTotal > 0) {
    const [topScript, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const range = SCRIPT_RANGES.find((r) => r.script === topScript)!;
    const multiScript = Object.keys(counts).length > 1;
    const share = topCount / letters;
    let language = range.lang;
    let ambiguous = false;
    if (topScript === "Deva") {
      const tokens = text.match(/[ऀ-ॿ]+/g) || [];
      const mr = tokens.filter((t) => MARATHI_DEVANAGARI.has(t)).length;
      const hi = tokens.filter((t) => HINDI_DEVANAGARI.has(t)).length;
      if (mr > hi) language = LANGUAGE_CODE.MARATHI;
      else if (hi === 0) ambiguous = true; // could be Hindi/Marathi (or Konkani/Nepali…) — provider decides
    }
    const mixed = multiScript || latin / letters > 0.15;
    return {
      language,
      script: topScript as ScriptKind,
      kind: mixed ? "mixed" : "native",
      confidence: ambiguous ? 0.6 : Math.min(0.98, 0.7 + share * 0.3),
      ambiguous: ambiguous || multiScript,
    };
  }

  if (other > 0 && other >= latin) {
    return { language: "und", script: "Other", kind: "unsupported", confidence: 0.9, ambiguous: false };
  }

  // Latin script: English vs Roman-script Indic. Ignore Capitalised mid-sentence tokens
  // (names — "Sunder", "Kamal") and anything containing digits.
  const rawTokens = text.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’]*/g) || [];
  let tokens = 0;
  let hits = 0;
  const langVotes: Record<string, number> = {};
  let first = true;
  for (const tok of rawTokens) {
    const isFirst = first;
    first = false;
    if (!isFirst && tok[0] !== tok[0].toLowerCase() && tok !== tok.toUpperCase()) continue; // Titlecase name
    const w = tok.toLowerCase();
    tokens++;
    if (ENGLISH_WORDS.has(w) || DOMAIN_MISSPELLINGS[w]) continue;
    const lang = ROMAN_LOOKUP.get(w);
    if (lang) {
      hits++;
      langVotes[lang] = (langVotes[lang] || 0) + 1;
    }
  }

  if (hits === 0) return { language: LANGUAGE_CODE.ENGLISH, script: "Latn", kind: "english", confidence: tokens ? 0.9 : 0.5, ambiguous: false };
  // One stray Indic word inside a long English paste isn't worth a provider round-trip.
  if (tokens > 40 && hits / tokens < 0.05) {
    return { language: LANGUAGE_CODE.ENGLISH, script: "Latn", kind: "english", confidence: 0.7, ambiguous: false };
  }
  const [topLang, topVotes] = Object.entries(langVotes).sort((a, b) => b[1] - a[1])[0];
  const ratio = hits / Math.max(tokens, 1);
  const englishShare = 1 - ratio;
  return {
    language: topLang as LanguageCode,
    script: "Latn",
    kind: englishShare > 0.3 && ratio < 0.7 ? "mixed" : "romanised",
    confidence: Math.min(0.95, 0.5 + 0.15 * topVotes + 0.3 * ratio),
    ambiguous: Object.keys(langVotes).length > 1,
  };
}
