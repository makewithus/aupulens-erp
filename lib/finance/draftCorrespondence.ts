/**
 * AI-drafted finance correspondence (Scope F — AI Copilot "draft correspondence").
 *
 * Generates a ready-to-send payment reminder / follow-up for an invoice. This
 * DRAFTS text for a human to review and send — it never sends anything itself.
 * Falls back to a deterministic template when AI is gated/unavailable, so the
 * feature always returns usable copy.
 */
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";

export type CorrespondenceTone = "friendly" | "firm" | "final_notice";

export interface DraftInput {
  invoiceNumber: string;
  amount: number;
  daysOverdue: number;
  customerName?: string;
  tone?: CorrespondenceTone;
}

export interface DraftResult { subject: string; body: string; aiUsed: boolean }

function templateDraft(input: DraftInput): DraftResult {
  const who = input.customerName || "Customer";
  const subject = `Payment reminder: Invoice ${input.invoiceNumber}`;
  const body =
    `Dear ${who},\n\n` +
    `This is a reminder that Invoice ${input.invoiceNumber} for ${input.amount} is ` +
    `${input.daysOverdue > 0 ? `${input.daysOverdue} day(s) overdue` : "due"}. ` +
    `We would appreciate your payment at the earliest convenience.\n\n` +
    `If you have already made this payment, please disregard this notice.\n\n` +
    `Kind regards,\nAccounts Receivable`;
  return { subject, body, aiUsed: false };
}

export async function draftPaymentReminder(tenantId: string, input: DraftInput): Promise<DraftResult> {
  const tone = input.tone || (input.daysOverdue > 90 ? "final_notice" : input.daysOverdue > 30 ? "firm" : "friendly");
  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);

  const prompt = `Draft a ${tone.replace("_", " ")} payment-reminder email for this overdue invoice. Keep it professional and concise. Respond with ONLY JSON: {"subject":"...","body":"..."}.

Invoice: ${input.invoiceNumber}
Amount: ${input.amount}
Days overdue: ${input.daysOverdue}
Customer: ${input.customerName || "the customer"}`;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt: "You write professional B2B accounts-receivable correspondence. Never invent amounts or dates beyond those given. Reply with raw JSON only.",
      maxTokens: AI_MAX_TOKENS.draft,
    });
    if (!("text" in result)) return templateDraft(input);

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return templateDraft(input);
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") return templateDraft(input);
    return { subject: parsed.subject, body: parsed.body, aiUsed: true };
  } catch {
    return templateDraft(input);
  }
}
