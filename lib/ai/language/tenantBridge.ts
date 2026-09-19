/**
 * The single seam between callClaudeForTenant() and the language pipeline. Additive: when a
 * caller does not pass `language`, none of this runs and behaviour is byte-identical to before.
 */
import connectDB from "@/lib/db";
import AiLanguageInteraction from "@/models/ai/AiLanguageInteraction";
import { recordSarvamUsage } from "@/lib/platform/ai/instrumentation";
import { prepareLanguageInput, substituteUserText } from "./pipeline";
import { respondInLanguage, interpretationLine } from "./respond";
import type { LanguageTrace, ProviderCall } from "./types";

/** Pass the user's RAW typed text (as it appears inside the composed prompt). */
export interface LanguageOptions {
  rawText: string;
  userId?: string;
  /** Default true: reply in the user's language when they wrote in one. */
  replyInUserLanguage?: boolean;
  /** Default true: open with "I understood this as…" when meaning changed materially. */
  showInterpretation?: boolean;
}

export async function applyLanguageInput(
  tenantId: string,
  aiSettings: { multilingualDisabled?: boolean },
  userMessage: string,
  lang: LanguageOptions,
): Promise<{ message: string; trace: LanguageTrace }> {
  const trace = await prepareLanguageInput({
    tenantId,
    rawText: lang.rawText,
    multilingualDisabled: aiSettings.multilingualDisabled === true,
  });
  return { message: substituteUserText(userMessage, lang.rawText, trace.modelText), trace };
}

export async function applyLanguageReply(reply: string, trace: LanguageTrace, lang: LanguageOptions) {
  if (lang.replyInUserLanguage === false) {
    const prefix = lang.showInterpretation === false ? "" : interpretationLine(trace);
    return { text: prefix + reply, calls: [] as ProviderCall[] };
  }
  const r = await respondInLanguage(reply, trace, { showInterpretation: lang.showInterpretation });
  return { text: r.text, calls: r.calls };
}

/** Meter every Sarvam call and persist the trace (non-English/degraded only). Never throws. */
export async function finaliseLanguage(
  tenantId: string,
  feature: string,
  trace: LanguageTrace,
  extraCalls: ProviderCall[],
  userId?: string,
): Promise<void> {
  try {
    const calls = [...trace.providerCalls, ...extraCalls];
    const jobs: Promise<unknown>[] = calls.map((c) => recordSarvamUsage({ tenantId, feature, call: c }));
    const interesting = trace.degraded || (trace.kind !== "english" && trace.kind !== "none");
    if (interesting) {
      jobs.push(
        connectDB().then(() =>
          AiLanguageInteraction.create({
            tenantId, userId, feature,
            trace: { ...trace, providerCalls: calls },
            detectedLanguage: trace.detectedLanguage,
            degraded: trace.degraded,
          }),
        ),
      );
    }
    await Promise.allSettled(jobs);
  } catch (err) {
    console.error("[language] finalise failed", err instanceof Error ? err.message : String(err));
  }
}
