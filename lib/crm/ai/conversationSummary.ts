/**
 * Real, LLM-backed conversation/call-note summarization (Phase 2).
 *
 * Replaces the old lib/crm/ai/conversationEngine.ts, which was pure keyword
 * matching (e.g. `text.includes("great")` -> sentiment Positive) and its own
 * comment admitted "In a real implementation, this would... pass to an LLM."
 * That file and its CrmConversationSummary writer were never wired to
 * anything — this one is, from the Activity-creation route, whenever a
 * Call/Meeting activity is logged with real notes.
 */

import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import dbConnect from "@/lib/db";
import CrmConversationSummary from "@/models/crm/ConversationSummary";

export interface ConversationSummaryOutcome {
  ok: boolean;
  gated?: boolean;
}

/**
 * Summarizes a single call/meeting note and persists it to
 * CrmConversationSummary. Silently no-ops (returns { ok: false }) when AI is
 * gated or the call fails — a missing summary is not worth blocking or
 * failing the activity-creation request over.
 */
export async function summarizeAndStoreConversation(params: {
  tenantId: string;
  recordType: string;
  recordId: string;
  activityType: string;
  noteText: string;
}): Promise<ConversationSummaryOutcome> {
  const { tier, aiSettings } = await resolveTenantAiSettings(params.tenantId);

  const prompt = `Summarize this ${params.activityType.toLowerCase()} note from a CRM system. Respond with ONLY a JSON object — no markdown, no prose — in exactly this shape:
{
  "summary": "<1-2 sentence summary of what was discussed>",
  "keyDecisions": ["<decision 1>", "..."],
  "risks": ["<any concern or objection raised, if any>"],
  "followUps": ["<any follow-up mentioned or implied>"],
  "actionItems": ["<concrete action items, if any>"],
  "sentiment": "Positive" | "Neutral" | "Negative"
}
Omit arrays entirely (use []) when nothing applies — never invent content not present in the note.

Note:
"${params.noteText}"`;

  try {
    const result = await callClaudeForTenant(params.tenantId, tier, aiSettings, prompt, {
      systemPrompt:
        "You are a precise CRM note summarizer. Base your summary strictly on the note text given — never invent decisions, risks, or action items not present in it. Reply with raw JSON only.",
      maxTokens: 512,
    });

    if (!("text" in result)) {
      return { ok: false, gated: true };
    }

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false };

    const parsed = JSON.parse(jsonMatch[0]);
    const sentiment = ["Positive", "Neutral", "Negative"].includes(parsed.sentiment) ? parsed.sentiment : "Neutral";

    await dbConnect();
    await CrmConversationSummary.create({
      tenantId: params.tenantId,
      recordType: params.recordType,
      recordId: params.recordId,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions.filter((x: unknown) => typeof x === "string") : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.filter((x: unknown) => typeof x === "string") : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps.filter((x: unknown) => typeof x === "string") : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.filter((x: unknown) => typeof x === "string") : [],
      sentiment,
    });

    return { ok: true };
  } catch {
    return { ok: false };
  }
}
