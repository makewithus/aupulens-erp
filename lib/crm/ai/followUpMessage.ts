/**
 * Suggested follow-up message drafting (Native ERP AI functionality).
 *
 * The other engines recommend the ACTION "follow up" (nextBestAction); this one
 * actually DRAFTS the message text — a short, context-specific email / WhatsApp /
 * SMS the rep can review and send. It only suggests text; it never sends
 * anything (assist, don't override).
 */
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";

export interface FollowUpResult {
  ok: boolean;
  message: string;
  gated?: boolean;
}

export async function draftFollowUpMessage(params: {
  tenantId: string;
  entityType: string; // "Lead" | "Opportunity" | "Account" | "Contact"
  context: Record<string, unknown>; // sanitized record (no internal IDs)
  channel?: "email" | "whatsapp" | "sms";
  tone?: string;
}): Promise<FollowUpResult> {
  const channel = params.channel || "email";
  const prompt = `Draft a short, professional follow-up ${channel} message for a ${params.entityType} in a sales CRM. Make it specific to the context (name, company, stage, recent activity) — warm and human, not generic boilerplate. Return ONLY the message body text: no subject line, no quotes, no preamble, no placeholders like [Name] (use the real values from the context, or omit gracefully). Keep it concise (${channel === "email" ? "3-5 short sentences" : "1-3 short sentences"}). Tone: ${params.tone || "professional and friendly"}.

Context (never print raw database IDs): ${JSON.stringify(params.context).slice(0, 1200)}`;

  try {
    const { tier, aiSettings } = await resolveTenantAiSettings(params.tenantId);
    const result = await callClaudeForTenant(params.tenantId, tier, aiSettings, prompt, {
      maxTokens: AI_MAX_TOKENS.draft,
      systemPrompt: "You write concise, human follow-up messages for a sales CRM. Never invent facts that aren't in the provided context, and never expose internal IDs.",
    });
    // strictNullChecks off — narrow on "text" in result.
    if (!("text" in result)) return { ok: false, message: "", gated: true };
    return { ok: true, message: result.text.trim() };
  } catch {
    return { ok: false, message: "" };
  }
}
