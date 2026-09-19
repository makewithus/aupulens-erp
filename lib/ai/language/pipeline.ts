/**
 * detect -> protect -> normalise -> translate -> unprotect. Fails OPEN: any provider problem
 * yields the ORIGINAL text with degraded:true — never an error (Rule 6). English input
 * short-circuits before configuration or any provider is even consulted (Rule 3).
 */
import crypto from "crypto";
import { LANGUAGE_CODE, LANGUAGE_DEGRADED_REASON, type LanguageDegradedReason } from "@/lib/constants/statuses";
import { detectLanguage } from "./detect";
import { ENGLISH_WORDS } from "./lexicon";
import { prepareText, type Prepared } from "./normalise";
import { placeholdersIntact, unprotectEntities } from "./protect";
import { normaliseNumbers } from "./numbers";
import { translateToEnglish, numbersPreserved } from "./translate";
import { getSarvamConfig, isSarvamUsable } from "./config";
import { TtlCache } from "./cache";
import type { Detection, LanguageTrace } from "./types";

const cache = new TtlCache<LanguageTrace>();
export const clearLanguageCache = () => cache.clear();

const now = () => performance.now();

function baseTrace(raw: string, det: Detection, prep: Prepared): LanguageTrace {
  return {
    original: raw,
    detectedLanguage: det.language,
    script: det.script,
    kind: det.kind,
    confidence: det.confidence,
    normalised: prep.normalised,
    translated: prep.normalised,
    modelText: prep.normalised,
    entitiesProtected: prep.entities.map((e) => ({ type: e.type, value: e.value })),
    rewrites: prep.rewrites,
    providerCalls: [],
    totalLatencyMs: 0,
    degraded: false,
    cacheHit: false,
    changedMaterially: prep.rewrites.length > 0,
    lowConfidence: false,
  };
}

function degrade(t: LanguageTrace, reason: LanguageDegradedReason, raw: string): LanguageTrace {
  return {
    ...t,
    modelText: raw, // original text goes to the model untouched
    translated: raw,
    degraded: true,
    degradedReason: reason,
    changedMaterially: false,
    lowConfidence: true, // we could not verify our understanding -> callers must ask, not act
    interpretation: undefined,
  };
}

export interface PrepareInput {
  tenantId: string;
  rawText: string;
  /** settings.ai.multilingualDisabled */
  multilingualDisabled?: boolean;
}

export async function prepareLanguageInput(input: PrepareInput): Promise<LanguageTrace> {
  const t0 = now();
  const raw = input.rawText;
  const finish = (t: LanguageTrace): LanguageTrace => ({ ...t, totalLatencyMs: Math.round((now() - t0) * 100) / 100 });

  try {
    const det = detectLanguage(raw);
    const prep = prepareText(raw);
    const trace = baseTrace(raw, det, prep);

    // ── English short-circuit: no config read, no provider, no cache ──
    if (det.kind === "english" || det.kind === "none") {
      trace.interpretation = prep.rewrites.length ? prep.normalised : undefined;
      trace.lowConfidence = false;
      return finish(trace);
    }

    if (input.multilingualDisabled) return finish(degrade(trace, LANGUAGE_DEGRADED_REASON.DISABLED_TENANT, raw));
    if (det.kind === "unsupported") return finish(degrade(trace, LANGUAGE_DEGRADED_REASON.UNSUPPORTED_LANGUAGE, raw));
    const cfg = getSarvamConfig();
    if (!cfg.enabled) return finish(degrade(trace, LANGUAGE_DEGRADED_REASON.DISABLED_GLOBAL, raw));
    if (!isSarvamUsable(cfg)) return finish(degrade(trace, LANGUAGE_DEGRADED_REASON.NOT_CONFIGURED, raw));

    const key = `${input.tenantId}|${crypto.createHash("sha1").update(raw).digest("hex")}`;
    const hit = cache.get(key);
    if (hit) return finish({ ...hit, cacheHit: true, providerCalls: [] });

    const tr = await translateToEnglish(prep.masked, det);
    trace.providerCalls = tr.calls;
    if (tr.ok === false) return finish(degrade(trace, tr.reason, raw));

    // Verify before trusting: numbers first (canonicalise "45,000" the provider may emit), then placeholders.
    const english = normaliseNumbers(tr.text).text;
    if (!numbersPreserved(prep.masked, english)) return finish(degrade(trace, LANGUAGE_DEGRADED_REASON.BAD_RESPONSE, raw));
    if (!placeholdersIntact(english, prep.entities)) return finish(degrade(trace, LANGUAGE_DEGRADED_REASON.BAD_RESPONSE, raw));

    const translated = unprotectEntities(english, prep.entities).replace(/[ ]{2,}/g, " ").trim();
    // A translator can invent a name. Any mid-sentence capitalised word that is neither a known
    // English word nor one of the user's own protected entities is unverifiable => low confidence.
    const own = prep.entities.map((e) => e.value.toLowerCase()).join(" ");
    const invented = [...translated.matchAll(/(?<=[a-z0-9,] )([A-Z][a-z]{2,})\b/g)].some(
      (m) => !ENGLISH_WORDS.has(m[1].toLowerCase()) && !own.includes(m[1].toLowerCase()),
    );
    const out: LanguageTrace = {
      ...trace,
      translated,
      modelText: translated,
      changedMaterially: true,
      lowConfidence: det.confidence < 0.6 || invented,
      interpretation: translated,
    };
    cache.set(key, { ...out, providerCalls: [] });
    return finish(out);
  } catch (err) {
    // Belt and braces: nothing in this module may ever break the assistant.
    const det = detectLanguage(raw);
    const stub: LanguageTrace = {
      original: raw, detectedLanguage: det.language, script: det.script, kind: det.kind, confidence: 0,
      normalised: raw, translated: raw, modelText: raw, entitiesProtected: [], rewrites: [], providerCalls: [],
      totalLatencyMs: Math.round((now() - t0) * 100) / 100, degraded: true,
      degradedReason: LANGUAGE_DEGRADED_REASON.PROVIDER_ERROR, cacheHit: false, changedMaterially: false, lowConfidence: true,
    };
    console.error("[language] pipeline error, failing open:", err instanceof Error ? err.message : String(err));
    return stub;
  }
}

/** Substitute the user's raw text inside an already-composed prompt with the model-ready text. */
export function substituteUserText(prompt: string, raw: string, modelText: string): string {
  if (raw === modelText) return prompt;
  if (raw && prompt.includes(raw)) return prompt.replace(raw, () => modelText);
  // The route reshaped the text; append rather than lose the interpretation.
  return `${prompt}\n\n(The user's message above, understood in English: ${modelText})`;
}

export { LANGUAGE_CODE };
