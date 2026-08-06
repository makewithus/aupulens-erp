/**
 * Shared LLM-backed CRM insight helper (Phase 2 — CRM AI genuinely LLM-backed).
 *
 * Before this file, every "AI" feature under lib/crm/ai/* and the deterministic
 * engines it sits alongside (leadScoring, opportunityHealth, churnRisk) were
 * pure hand-written scoring functions — zero LLM calls anywhere in CRM. This
 * is the one shared call site every genuinely LLM-backed CRM feature should
 * go through, instead of each feature hand-rolling its own prompt/parse logic.
 *
 * Callers are expected to treat a non-ok result as "fall back to the existing
 * deterministic engine" — never as a hard failure — so a workspace with AI
 * disabled or over its monthly cap keeps working exactly as it did before
 * this migration, just without the LLM-generated reasoning layered on top.
 */

import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";

export interface LlmInsightResult {
  ok: true;
  /** 0-100 numeric estimate — meaning depends on the task (score, probability, risk score, etc). */
  score?: number;
  riskLevel?: "Low" | "Medium" | "High" | "Critical";
  /** 0-100 — the model's own stated confidence in this assessment, not a fabricated placeholder. */
  confidence: number;
  summary: string;
  reasoning: string;
  suggestedAction?: string;
  /** A ready-to-send draft message, only populated when the task asks for one (e.g. a follow-up draft). */
  draftMessage?: string;
}

export interface LlmInsightUnavailable {
  ok: false;
  /** true when blocked by the tenant AI kill-switch / monthly cap, false for any other failure. */
  gated: boolean;
  code?: string;
  error: string;
}

export type LlmInsightOutcome = LlmInsightResult | LlmInsightUnavailable;

const VALID_RISK_LEVELS = new Set(["Low", "Medium", "High", "Critical"]);

function clamp0to100(n: unknown): number | undefined {
  if (typeof n !== "number" || Number.isNaN(n)) return undefined;
  return Math.max(0, Math.min(100, n));
}

/**
 * Ask the tenant's configured model to analyze a CRM record for a specific
 * task. `task` is the instruction (e.g. "Score this lead's likelihood to
 * convert, 0-100."); `recordJson` is the relevant record fields, already
 * JSON-stringified by the caller so each caller controls exactly what data
 * (and how much of it) is sent.
 */
export async function getLlmCrmInsight(
  tenantId: string,
  task: string,
  recordJson: string
): Promise<LlmInsightOutcome> {
  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);

  const prompt = `${task}

Record data (JSON):
${recordJson}

Respond with ONLY a JSON object — no markdown fences, no prose before or after — in exactly this shape:
{
  "score": <number 0-100, your best-effort numeric estimate for this specific task>,
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "confidence": <number 0-100, how confident you genuinely are in this assessment given the data provided>,
  "summary": "<one sentence, plain language>",
  "reasoning": "<2-3 sentences citing the specific fields/values that drove your assessment>",
  "suggestedAction": "<one concrete, specific next action a rep should take right now>",
  "draftMessage": "<OMIT this field entirely unless the task explicitly asks for a draft message/email/note — when it does, a ready-to-send 2-3 sentence draft in a professional tone>"
}`;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt:
        "You are a precise CRM analyst. Base your assessment strictly on the record data given — never invent facts, names, or numbers not present in it. Reply with raw JSON only, no markdown.",
      maxTokens: 512,
    });

    if (!("text" in result)) {
      return { ok: false, gated: true, code: result.code, error: result.error };
    }

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: false, gated: false, error: "Model did not return parseable JSON" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const confidence = clamp0to100(parsed.confidence);

    return {
      ok: true,
      score: clamp0to100(parsed.score),
      riskLevel: VALID_RISK_LEVELS.has(parsed.riskLevel) ? parsed.riskLevel : undefined,
      // Confidence must come from the model, not a fabricated default — if the
      // model omitted it, that's a signal the response is unreliable, not a
      // reason to make up a number (the exact bug found in the old
      // leadScoringAI.ts dead code, Math.floor(Math.random()*20)+75).
      confidence: confidence ?? 0,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      suggestedAction: typeof parsed.suggestedAction === "string" ? parsed.suggestedAction : undefined,
      draftMessage: typeof parsed.draftMessage === "string" ? parsed.draftMessage : undefined,
    };
  } catch (err: any) {
    return { ok: false, gated: false, error: err?.message || "AI call failed" };
  }
}
