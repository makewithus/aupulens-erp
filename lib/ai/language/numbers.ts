import { NUMBER_WORDS, NUMBER_SCALES } from "./lexicon";

/**
 * Exact, deterministic number canonicalisation. Every rewrite preserves the numeric value
 * EXACTLY (no floats) or is skipped — a misread amount is the worst failure this layer can
 * cause, so anything that isn't provably value-preserving is left alone.
 */

const DIGIT_BLOCKS = [0x660, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66];

export function toAsciiDigits(text: string): string {
  return text.replace(/[٠-٩०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯]/g, (ch) => {
    const cp = ch.codePointAt(0)!;
    for (const start of DIGIT_BLOCKS) if (cp >= start && cp <= start + 9) return String(cp - start);
    return ch;
  });
}

const stripLeadingZeros = (s: string) => s.replace(/^0+(?=\d)/, "");

/** value = decimal string, multiplied by 10^p, only if the result stays an integer. */
function scaleDecimal(dec: string, p: number): string | null {
  const [int, frac = ""] = dec.split(".");
  if (frac.length > p) return null;
  return stripLeadingZeros(int + frac + "0".repeat(p - frac.length));
}

const SUFFIX_POW: Record<string, number> = { k: 3, lakh: 5, lakhs: 5, lac: 5, lacs: 5, crore: 7, crores: 7, cr: 7 };

export interface NumberNormalisation {
  text: string;
  /** Material rewrites (45k -> 45000, "forty five thousand" -> 45000). Comma removal is not listed. */
  rewrites: string[];
}

function parseNumberWords(seq: string): number | null {
  const toks = seq.toLowerCase().split(/[\s-]+/).filter((t) => t && t !== "and");
  if (!toks.length) return null;
  let total = 0;
  let current = 0;
  let prev: "start" | "unit" | "tens" | "hundred" | "scale" = "start";
  let hasScale = false;
  for (const t of toks) {
    if (t in NUMBER_WORDS) {
      const v = NUMBER_WORDS[t];
      if (v >= 20 && v % 10 === 0) {
        if (prev === "unit" || prev === "tens") return null;
        current += v;
        prev = "tens";
      } else if (v >= 1 && v <= 9 && prev === "tens") {
        current += v;
        prev = "unit";
      } else {
        if (prev === "unit" || prev === "tens") return null;
        current += v;
        prev = "unit";
      }
    } else if (t === "hundred") {
      if (prev === "hundred" || prev === "start") { if (prev === "start") return null; return null; }
      current = (current || 1) * 100;
      prev = "hundred";
      hasScale = true;
    } else if (t in NUMBER_SCALES) {
      const sc = NUMBER_SCALES[t];
      if (prev === "start" || prev === "scale") return null;
      total += current * sc;
      current = 0;
      prev = "scale";
      hasScale = true;
    } else return null;
  }
  total += current;
  // "one" / "two" alone are ordinary words, not amounts.
  if (toks.filter((t) => t !== "and").length < 2 && !hasScale) return null;
  return total;
}

const WORD_ALT = [...Object.keys(NUMBER_WORDS), ...Object.keys(NUMBER_SCALES)].join("|");
const WORD_SEQ_RX = new RegExp(`(?<![\\w-])(?:(?:${WORD_ALT})(?:[\\s-]+and)?(?:[\\s-]+|(?![\\w])))+`, "gi");

export function normaliseNumbers(input: string): NumberNormalisation {
  const rewrites: string[] = [];
  let text = toAsciiDigits(input);

  // 45,000 / 1,00,000 / 12,34,567 -> plain digits (value identical).
  text = text.replace(
    /(?<![\w.,])(?:\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)(\.\d+)?(?![\w,])/g,
    (m) => m.replace(/,/g, ""),
  );

  // 45k / 2.5k / 1.5 lakh / 2 crore
  text = text.replace(
    /(?<![\w.])(\d+(?:\.\d+)?)(?:k(?![\w])|\s?(lakhs?|lacs?|crores?|cr)(?![\w]))/gi,
    (m, num: string, word?: string) => {
      const key = (word ?? "k").toLowerCase();
      const out = scaleDecimal(num, SUFFIX_POW[key]);
      if (out === null) return m;
      rewrites.push(`${m.trim()} → ${out}`);
      return out;
    },
  );

  // "forty five thousand" -> 45000
  text = text.replace(WORD_SEQ_RX, (m) => {
    const trailing = /\s+$/.exec(m)?.[0] ?? "";
    const core = m.slice(0, m.length - trailing.length);
    const v = parseNumberWords(core);
    if (v === null) return m;
    rewrites.push(`${core.trim()} → ${v}`);
    return String(v) + trailing;
  });

  return { text, rewrites };
}
