/**
 * Per-feature max_tokens caps (cost control).
 *
 * Every AI call runs on the single gpt-4o deployment — there is no cheap
 * model tier. So cost is controlled here: high-frequency, low-stakes
 * suggestion features that fire on every create/update request short,
 * structured outputs with small caps; genuinely conversational assistant
 * chats get a larger cap.
 *
 * Rationale for the numbers (measured against real gpt-4o responses — see
 * PROGRESS.md for the live token counts):
 *  - Suggestion/JSON features return a compact JSON object (score, riskLevel,
 *    confidence, one-line summary/reasoning, one suggested action) — that fits
 *    comfortably under ~256 completion tokens, so 256 is a safe cap that won't
 *    truncate a well-formed response but hard-stops a runaway generation.
 *  - Summaries (call notes / conversation) can have a few short bullet arrays,
 *    so a slightly higher 384.
 *  - Conversational assistant chats are the only genuinely open-ended output;
 *    they keep the historical 1024.
 */
export const AI_MAX_TOKENS = {
  /** Lead scoring, deal risk, churn, win-probability, next-best-action, data completion — compact JSON. */
  suggestion: 256,
  /** Command Center intent classification — tiny navigate/action JSON. */
  intent: 200,
  /** Call-note / conversation summaries — short structured bullets. */
  summary: 384,
  /** Draft follow-up messages / correspondence — a few sentences. */
  draft: 300,
  /** Anomaly detection explanations — a compact finding + reason. */
  anomaly: 300,
  /** Full conversational module assistant chat (Finance/Sales/etc.). */
  chat: 1024,
  /** RAG / copilot answer grounded in retrieved context. */
  rag: 700,
} as const;

export type AiFeature = keyof typeof AI_MAX_TOKENS;
