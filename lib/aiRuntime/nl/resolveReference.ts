import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";
import type { AiNlSessionState } from "@/lib/aiRuntime/nl/conversationMemory";

/**
 * AI-NL's reference resolution (Chunk 9, Part D.2 — docs/ai/BRIEF-09-VERIFICATION.md). Covers all
 * nine reference shapes the brief names — pronoun ("it"), ordinal ("the second one"), descriptive
 * ("the one from Acme"), continuation ("and also…"), modification ("actually make it…"),
 * scope-change ("now for last quarter"), correction ("no, I meant…"), meta ("why did it flag
 * that"), undo ("undo that") — with ONE mechanism rather than nine separate parsers, because they
 * all reduce to the same three outcomes: point at something already in the result set, re-run the
 * last workflow with an adjusted parameter, or ask one clarifying question.
 *
 * **The safety property that makes this safe to hand to a model at all**: the model is given the
 * result set as a plain NUMBERED LIST OF LABELS ONLY — never the real record ids. It can only
 * return an `itemIndex` into that list; the actual id substitution happens here, in code, after
 * the response comes back and the index is bounds-checked. The model therefore cannot invent an
 * id, leak one from its own training, or resolve to anything this tenant/user didn't already
 * retrieve this session — "resolve from stored state BY ID, never from the model's own
 * recollection" is enforced structurally, not by prompt instruction alone.
 *
 * Cheap to skip: if the session has no result set, no pending clarification, and no pending
 * proposal, there is nothing to resolve against — `resolveReference` returns `not_a_reference`
 * immediately with no model call, so an ordinary first-turn command costs nothing extra.
 */

export interface ReferenceResolution {
  type: "explain_item" | "rerun" | "answer_clarification" | "clarify" | "undo" | "not_a_reference";
  /** explain_item: which remembered item ("the second one", "it", "the one from Acme"). */
  item?: { id: string; model: string; label: string };
  /** rerun: re-run a workflow with these parameters layered over the prior call's own
   *  (continuation/modification/scope-change/correction all resolve to this). */
  workflowId?: string;
  eventKey?: string;
  parameters?: Record<string, unknown>;
  /** clarify: the one question to ask back, never a guess. */
  question?: string;
}

const NOT_A_REFERENCE: ReferenceResolution = { type: "not_a_reference" };

function hasResolvableState(session: AiNlSessionState): boolean {
  return Boolean(session.resultSet?.items.length || session.pendingClarification || session.pendingProposal || session.currentFocus);
}

export async function resolveReference(tenantId: string, command: string, session: AiNlSessionState): Promise<ReferenceResolution> {
  if (!hasResolvableState(session)) return NOT_A_REFERENCE;

  const items = session.resultSet?.items ?? (session.currentFocus ? [session.currentFocus] : []);
  const labelledList = items.map((it, i) => `${i + 1}. ${it.label} (${it.model})`).join("\n") || "(none)";
  const recentTurns = session.turns.slice(-6).map((t) => `${t.role}: ${t.text}`).join("\n") || "(none)";

  const prompt = `You are resolving a follow-up message in an ongoing conversation with an AI finance operations assistant. Decide what the user's new message refers to, using ONLY the context below — never invent a record, never assume something not listed here.

Recent conversation:
${recentTurns}

Remembered result set from the last workflow run (workflow: ${session.resultSet?.workflowId ?? "none"}), as a numbered list — you may ONLY refer to these by their number, never by inventing a name/id of your own:
${labelledList}

${session.pendingClarification ? `A clarifying question was just asked: "${session.pendingClarification.question}" — if the new message answers it, resolve it.` : ""}
${session.pendingProposal ? `A pending, unconfirmed proposal exists: "${session.pendingProposal.summary}" — if the new message says to cancel/undo/stop it, resolve as undo.` : ""}

New message: "${command}"

Classify into exactly ONE of:
- "explain_item": the message refers to a SPECIFIC item from the numbered list above (a pronoun like "it"/"that", an ordinal like "the second one", or a description like "the one from Acme"). Provide "itemIndex" (1-based, matching the list above).
- "rerun": the message asks to repeat/adjust/continue the same kind of analysis with a different parameter (a continuation like "and also check X", a modification like "actually raise the threshold to Y", a scope change like "now for last quarter", or a correction like "no, I meant Y not X"). Provide "parameters" as a flat JSON object of ONLY the parameter(s) the user is changing or adding — never repeat ones they didn't mention.
- "answer_clarification": the message directly answers the pending clarifying question above. Provide "parameters" with the answer.
- "undo": the message says to cancel, undo, or stop the pending proposal above.
- "clarify": the reference is genuinely ambiguous (e.g. "the second one" but you're not confident which "second" is meant, or it could match more than one item). Provide "question" — ONE short clarifying question.
- "not_a_reference": the message is a fresh, unrelated request that doesn't refer back to anything above.

Return ONLY JSON, no markdown: {"type":"...","itemIndex":0,"parameters":{},"question":"..."}`;

  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
  const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { maxTokens: AI_MAX_TOKENS.intent });
  if (!("text" in result)) return NOT_A_REFERENCE; // AI disabled/gated — fail open to the normal path, never block on this

  let parsed: any;
  try {
    parsed = JSON.parse(result.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim());
  } catch {
    return NOT_A_REFERENCE;
  }

  switch (parsed.type) {
    case "explain_item": {
      const idx = Number(parsed.itemIndex) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return { type: "clarify", question: "Which one did you mean?" };
      return { type: "explain_item", item: items[idx] };
    }
    case "rerun": {
      const workflowId = session.resultSet?.workflowId ?? session.pendingClarification?.forWorkflowId;
      const eventKey = session.resultSet?.runId ? undefined : session.pendingClarification?.forEventKey;
      if (!workflowId) return NOT_A_REFERENCE; // nothing to re-run against
      return { type: "rerun", workflowId, eventKey: eventKey ?? "ai.sweep.hourly", parameters: typeof parsed.parameters === "object" && parsed.parameters ? parsed.parameters : {} };
    }
    case "answer_clarification": {
      if (!session.pendingClarification) return NOT_A_REFERENCE;
      const merged = { ...session.pendingClarification.forParameters, ...(typeof parsed.parameters === "object" && parsed.parameters ? parsed.parameters : {}) };
      return { type: "rerun", workflowId: session.pendingClarification.forWorkflowId, eventKey: session.pendingClarification.forEventKey, parameters: merged };
    }
    case "undo":
      return session.pendingProposal ? { type: "undo" } : NOT_A_REFERENCE;
    case "clarify":
      return { type: "clarify", question: typeof parsed.question === "string" && parsed.question ? parsed.question : "Which one did you mean?" };
    default:
      return NOT_A_REFERENCE;
  }
}
