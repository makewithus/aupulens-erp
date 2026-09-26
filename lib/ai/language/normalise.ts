import levenshtein from "js-levenshtein";
import { protectEntities, unprotectEntities, mapOutsidePlaceholders, type PlaceholderStyle } from "./protect";
import { normaliseNumbers } from "./numbers";
import { ENGLISH_WORDS, ROMAN_LOOKUP, DOMAIN_MISSPELLINGS, DOMAIN_VOCAB } from "./lexicon";
import type { ProtectedEntity } from "./types";

/**
 * Deterministic pass — always runs BEFORE any provider call and needs no network. Works on a
 * COPY: the user's original is never modified anywhere (Rule 4). Newlines are preserved on
 * purpose — pasted tables are inputs to the prefill flow, not "damage".
 */

// Zero-width / bidi / soft-hyphen. ZWJ/ZWNJ (200C/200D) are kept between Indic letters because
// they change how conjuncts render; elsewhere they are paste debris.
const INVISIBLE_RX = /[​⁠﻿­‎‏‪-‮⁦-⁩]/g;
const STRAY_JOINER_RX = /(?<![ऀ-ൿ])[‌‍]|[‌‍](?![ऀ-ൿ])/g;
const EMOJI_RX = /[\p{Extended_Pictographic}️⃣]/gu;

export function stripInvisibles(s: string): string {
  return s.normalize("NFC").replace(INVISIBLE_RX, "").replace(STRAY_JOINER_RX, "");
}

function normaliseWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[   -   　]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ ]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const isKnown = (w: string) =>
  ENGLISH_WORDS.has(w) || ROMAN_LOOKUP.has(w) || w in DOMAIN_MISSPELLINGS || DOMAIN_VOCAB.includes(w);

function fixWords(s: string, rewrites: string[]): string {
  return s.replace(/[A-Za-z]{3,}/g, (tok) => {
    let word = tok;
    const lower = tok.toLowerCase();
    const cased = (repl: string) => (tok[0] === tok[0].toUpperCase() && tok !== tok.toUpperCase() ? repl[0].toUpperCase() + repl.slice(1) : repl);

    // pleaseeee -> please (collapse to 1 only if that yields a known word, else to 2).
    if (/([A-Za-z])\1{2,}/.test(lower)) {
      const one = lower.replace(/([a-z])\1+/g, "$1");
      const two = lower.replace(/([a-z])\1{2,}/g, "$1$1");
      word = isKnown(one) ? one : isKnown(two) ? two : two;
      if (isKnown(one) || word !== lower) {
        const out = cased(word);
        return out;
      }
    }

    const w = word.toLowerCase();
    const direct = DOMAIN_MISSPELLINGS[w];
    if (direct && !ENGLISH_WORDS.has(w)) {
      // Keep the user's casing style for ALL CAPS acronyms like GSTN.
      const out = direct === direct.toUpperCase() ? direct : cased(direct);
      if (out.toLowerCase() !== tok.toLowerCase()) rewrites.push(`${tok} → ${out}`);
      return out;
    }

    // Guarded fuzzy: long, lowercase, unknown, not an inflection of a vocab word.
    if (w.length >= 6 && tok === lower && !isKnown(w)) {
      for (const v of DOMAIN_VOCAB) {
        if (w[0] !== v[0] || w.startsWith(v) || w.endsWith(v) || v.startsWith(w)) continue;
        const max = w.length >= 8 ? 2 : 1;
        if (Math.abs(w.length - v.length) <= max && levenshtein(w, v) <= max) {
          rewrites.push(`${tok} → ${v}`);
          return v;
        }
      }
    }
    return word === lower ? tok : cased(word);
  });
}

function fixNativeDomainTerms(s: string, rewrites: string[]): string {
  return s.replace(/बीजक/g, (tok) => {
    rewrites.push(`${tok} → इनव्हॉइस`);
    return "इनव्हॉइस";
  });
}

export interface Prepared {
  /** Text with placeholders — what providers see. */
  masked: string;
  entities: ProtectedEntity[];
  /** Deterministic result with entities restored (no provider involved). */
  normalised: string;
  rewrites: string[];
  /** True when whitespace/quotes/emoji/case-only cleanup is all that happened. */
  cosmeticOnly: boolean;
}

export function prepareText(raw: string, opts: { style?: PlaceholderStyle } = {}): Prepared {
  const cleaned = stripInvisibles(raw);
  const { masked: m0, entities } = protectEntities(cleaned, { style: opts.style });
  const rewrites: string[] = [];

  let masked = mapOutsidePlaceholders(m0, (seg) => {
    let s = seg
      .replace(/[“”„]/g, '"')
      .replace(/[‘’‚]/g, "'")
      .replace(EMOJI_RX, "")
      .replace(/([!?.,])\1{2,}/g, "$1")
      .replace(/([,;])(?=[A-Za-z])/g, "$1 "); // "invoice,for" -> "invoice, for"
    s = fixNativeDomainTerms(s, rewrites);
    s = fixWords(s, rewrites);
    const n = normaliseNumbers(s);
    rewrites.push(...n.rewrites);
    return n.text;
  });
  masked = normaliseWhitespace(masked);

  const normalised = unprotectEntities(masked, entities);
  const cosmeticOnly = rewrites.length === 0;
  return { masked, entities, normalised, rewrites, cosmeticOnly };
}
