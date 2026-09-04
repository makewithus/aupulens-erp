import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";

/**
 * The shared LLM-call helper every Batch A `reason()` stage uses (A.4). Routes through
 * `lib/ai/tenantAi.ts::callClaudeForTenant()` — the tenant-aware wrapper that already
 * enforces the workspace-level kill switch (`Organization.settings.ai.disabled`) and the
 * monthly usage cap. This composes with, but is separate from, the per-workflow
 * `AiWorkflowPolicy.killSwitchEnabled` the executor's autonomy gate checks — both must
 * pass for anything above OBSERVE/RECOMMEND (docs/ai/OPEN_QUESTIONS.md #6).
 *
 * Despite the "Claude" naming on the wrapped functions, this calls Azure OpenAI (GPT-4o) —
 * see docs/ai/GLOSSARY.md. Mockable in tests by `vi.mock("@/lib/ai/tenantAi", ...)`.
 */

export type LlmGatedCode = "AI_DISABLED" | "AI_LIMIT_REACHED" | "AI_GLOBAL_LIMIT_REACHED";

export type LlmReasonOutcome<T> =
  | { gated: false; proposal: T; confidence: number; reasons: string[]; rawText: string }
  | { gated: true; code: LlmGatedCode; reason: string };

export interface CallLlmForReasoningParams<T> {
  tenantId: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  /** Parses the model's raw text into a typed proposal + confidence + reason chain.
   *  Throwing here is caught and turned into a zero-confidence outcome, never propagated —
   *  a malformed model response is a low-confidence signal, not a workflow crash. */
  parseResponse: (text: string) => { proposal: T; confidence: number; reasons: string[] };
}

export async function callLlmForReasoning<T>(
  params: CallLlmForReasoningParams<T>,
): Promise<LlmReasonOutcome<T>> {
  const { tier, aiSettings } = await resolveTenantAiSettings(params.tenantId);

  const result = await callClaudeForTenant(params.tenantId, tier, aiSettings, params.userMessage, {
    systemPrompt: params.systemPrompt,
    maxTokens: params.maxTokens ?? AI_MAX_TOKENS.suggestion,
  });

  // Narrowing on `"text" in result` rather than `!result.gated`, matching
  // lib/docIntel/extractor.ts's own established pattern in this codebase —
  // this project runs with strictNullChecks:false, under which boolean-
  // literal discriminated-union narrowing on `.gated` does not narrow reliably.
  if (!("text" in result)) {
    return { gated: true, code: result.code, reason: result.error };
  }

  const text = result.text;
  try {
    const parsed = params.parseResponse(text);
    return { gated: false, ...parsed, rawText: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      gated: false,
      proposal: null as unknown as T,
      confidence: 0,
      reasons: [`failed to parse model response: ${message}`],
      rawText: text,
    };
  }
}
