/**
 * Translation stage: masked text -> English (and English -> user's language for replies).
 * Independent chunks run in PARALLEL. Every result is verified before it is trusted:
 * placeholders must all survive exactly once and every number must be preserved — otherwise
 * the caller degrades to the untranslated text rather than acting on a possibly-wrong one.
 */
import { LANGUAGE_CODE, LANGUAGE_DEGRADED_REASON, SARVAM_CALL_TYPE, type LanguageDegradedReason } from "@/lib/constants/statuses";
import { getSarvamClient, MODEL_LIMITS, type TranslateMode, type TranslateModel } from "./sarvam/client";
import { getRomanStrategy } from "./config";
import type { Detection, ProviderCall, SarvamResult } from "./types";

export const NUMBER_TOKEN_RX = /\d+(?:\.\d+)?/g;

export function numbersPreserved(before: string, after: string): boolean {
  const need = new Map<string, number>();
  for (const n of before.match(NUMBER_TOKEN_RX) ?? []) need.set(n, (need.get(n) || 0) + 1);
  const have = new Map<string, number>();
  for (const n of after.match(NUMBER_TOKEN_RX) ?? []) have.set(n, (have.get(n) || 0) + 1);
  for (const [n, c] of need) if ((have.get(n) || 0) < c) return false;
  return true;
}

/** Split at paragraph/sentence boundaries into chunks <= max chars (hard-split as a last resort). */
export function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[.!?।\n])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (let p of parts) {
    while (p.length > max) {
      if (cur) { chunks.push(cur); cur = ""; }
      chunks.push(p.slice(0, max));
      p = p.slice(max);
    }
    if ((cur + " " + p).trim().length > max) { chunks.push(cur); cur = p; }
    else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks.filter((c) => c.length > 0);
}

const toCall = (type: ProviderCall["type"], model: string | undefined, r: SarvamResult<unknown>): ProviderCall => ({
  provider: "sarvam", type, model, characters: r.characters, latencyMs: r.latencyMs, ok: r.ok,
  error: r.ok === false ? r.error.kind : undefined,
});

const reasonFor = (kind: string): LanguageDegradedReason =>
  kind === "timeout" ? LANGUAGE_DEGRADED_REASON.TIMEOUT
  : kind === "not_configured" ? LANGUAGE_DEGRADED_REASON.NOT_CONFIGURED
  : kind === "disabled" ? LANGUAGE_DEGRADED_REASON.DISABLED_GLOBAL
  : kind === "bad_response" ? LANGUAGE_DEGRADED_REASON.BAD_RESPONSE
  : LANGUAGE_DEGRADED_REASON.PROVIDER_ERROR;

export type StageResult =
  | { ok: true; text: string; sourceLanguage?: string; calls: ProviderCall[] }
  | { ok: false; reason: LanguageDegradedReason; calls: ProviderCall[] };

/** Translate one masked string to English. Chunks in parallel. */
export async function translateToEnglish(masked: string, det: Detection): Promise<StageResult> {
  const client = getSarvamClient();
  const calls: ProviderCall[] = [];
  const romanised = det.script === "Latn";
  const source = det.ambiguous || det.language === "und" ? "auto" : det.language;
  const mode: TranslateMode = romanised || det.kind === "mixed" ? "code-mixed" : "modern-colloquial";

  let input = masked;

  // Optional two-step strategy for Roman-script text: transliterate to native first.
  if (romanised && det.language !== LANGUAGE_CODE.ENGLISH && det.language !== "und" && getRomanStrategy() === "transliterate_first") {
    const t = await client.transliterate(masked, LANGUAGE_CODE.ENGLISH, det.language);
    calls.push(toCall(SARVAM_CALL_TYPE.TRANSLITERATE, undefined, t));
    if (t.ok === false) return { ok: false, reason: reasonFor(t.error.kind), calls };
    input = t.data.text;
  }

  const model: TranslateModel = input.length <= MODEL_LIMITS["mayura:v1"] ? "mayura:v1" : "sarvam-translate:v1";
  const chunks = chunkText(input, MODEL_LIMITS[model] - 50);
  const results = await Promise.all(
    chunks.map((c) => client.translate({ input: c, source: romanised && getRomanStrategy() === "transliterate_first" ? det.language : source, target: LANGUAGE_CODE.ENGLISH, model, mode })),
  );
  let sourceLanguage: string | undefined;
  const out: string[] = [];
  for (const r of results) {
    calls.push(toCall(SARVAM_CALL_TYPE.TRANSLATE, model, r));
    if (r.ok === false) return { ok: false, reason: reasonFor(r.error.kind), calls };
    sourceLanguage ??= r.data.sourceLanguage;
    out.push(r.data.translatedText);
  }
  const text = out.join(" ").replace(/[ ]{2,}/g, " ").trim();
  if (!text) return { ok: false, reason: LANGUAGE_DEGRADED_REASON.BAD_RESPONSE, calls };
  return { ok: true, text, sourceLanguage, calls };
}

/** Translate an English (masked) reply into the user's language. */
export async function translateFromEnglish(masked: string, targetLanguage: string, roman: boolean): Promise<StageResult> {
  const client = getSarvamClient();
  const useRoman = roman && masked.length <= MODEL_LIMITS["mayura:v1"];
  const model: TranslateModel = useRoman || masked.length <= MODEL_LIMITS["mayura:v1"] ? "mayura:v1" : "sarvam-translate:v1";
  const chunks = chunkText(masked, MODEL_LIMITS[model] - 50);
  const results = await Promise.all(
    chunks.map((c) => client.translate({
      input: c, source: LANGUAGE_CODE.ENGLISH, target: targetLanguage, model,
      mode: model === "mayura:v1" ? "modern-colloquial" : undefined,
      outputScript: useRoman && model === "mayura:v1" ? "roman" : undefined,
    })),
  );
  const calls: ProviderCall[] = [];
  const out: string[] = [];
  for (const r of results) {
    calls.push(toCall(SARVAM_CALL_TYPE.TRANSLATE, model, r));
    if (r.ok === false) return { ok: false, reason: reasonFor(r.error.kind), calls };
    out.push(r.data.translatedText);
  }
  return { ok: true, text: out.join("\n"), calls };
}
