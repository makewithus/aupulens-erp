/**
 * Reply side: put the model's English reply back into the user's language, and open with
 * "I understood this as…" when the input was materially changed. Fails open to the English reply.
 * Entities, numbers, markdown and UI labels are never translated (Part 4.4).
 */
import { LANGUAGE_DEGRADED_REASON, type LanguageDegradedReason } from "@/lib/constants/statuses";
import { protectEntities, placeholdersIntact, unprotectEntities } from "./protect";
import { translateFromEnglish, numbersPreserved } from "./translate";
import { getSarvamConfig, isSarvamUsable } from "./config";
import type { LanguageTrace, ProviderCall } from "./types";

export interface RespondResult {
  text: string;
  translated: boolean;
  calls: ProviderCall[];
  degradedReason?: LanguageDegradedReason;
}

export function interpretationLine(trace: LanguageTrace): string {
  if (!trace.changedMaterially || !trace.interpretation) return "";
  const flat = trace.interpretation.replace(/\s*\n\s*/g, " ");
  return `> *I understood this as:* "${flat}" — not right? Reply "no, I meant …" and I'll redo it.\n\n`;
}

/** Only pure regional input gets a regional reply; code-mixed input keeps an English reply. */
export function wantsRegionalReply(trace: LanguageTrace): boolean {
  return !trace.degraded && (trace.kind === "native" || trace.kind === "romanised") && trace.detectedLanguage !== "en-IN" && trace.detectedLanguage !== "und";
}

export async function respondInLanguage(reply: string, trace: LanguageTrace | undefined, opts: { showInterpretation?: boolean } = {}): Promise<RespondResult> {
  if (!trace) return { text: reply, translated: false, calls: [] };
  const prefix = opts.showInterpretation === false ? "" : interpretationLine(trace);
  if (!wantsRegionalReply(trace) || !reply.trim() || !isSarvamUsable(getSarvamConfig())) {
    return { text: prefix + reply, translated: false, calls: [] };
  }
  try {
    const { masked, entities } = protectEntities(reply, { markdown: true });
    const r = await translateFromEnglish(masked, trace.detectedLanguage, trace.script === "Latn");
    if (r.ok === false) return { text: prefix + reply, translated: false, calls: r.calls, degradedReason: r.reason };
    if (!numbersPreserved(masked, r.text) || !placeholdersIntact(r.text, entities)) {
      return { text: prefix + reply, translated: false, calls: r.calls, degradedReason: LANGUAGE_DEGRADED_REASON.BAD_RESPONSE };
    }
    return { text: prefix + unprotectEntities(r.text, entities), translated: true, calls: r.calls };
  } catch {
    return { text: prefix + reply, translated: false, calls: [], degradedReason: LANGUAGE_DEGRADED_REASON.PROVIDER_ERROR };
  }
}
