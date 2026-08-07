/**
 * Natural-language → CRM automation rule (Scope D).
 *
 * Turns "When a lead's budget is over 100k, create a high-priority follow-up
 * task" into a structured, VALIDATED CrmAutomationRule object (trigger / entity
 * / conditions / actions) the existing automation engine
 * (lib/crm/automationEngine.ts) can execute — without the user hand-building it
 * in the visual editor.
 *
 * The model's output is validated against the engine's ACTUAL vocabulary
 * (triggers/entities/operators/action types) — anything outside it is dropped
 * with a warning rather than persisted, so a hallucinated trigger can never
 * produce a dead rule. This PARSES only; the caller reviews the result and
 * saves it via the normal POST /api/crm/automations route (human in the loop).
 */
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";

export const RULE_TRIGGERS = [
  "record_created", "field_changed", "stage_changed", "date_reached", "approval_completed",
  "quote_accepted", "quote_rejected", "no_activity", "task_overdue", "sla_breached", "contract_expiring",
] as const;
export const RULE_ENTITIES = ["Lead", "Opportunity", "Account", "Quote", "Contract", "Case"] as const;
export const RULE_OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than", "exists", "date_before", "date_after"] as const;
export const RULE_ACTIONS = [
  "create_task", "send_notification", "update_field", "change_status", "assign_owner",
  "create_related_record", "add_tag", "trigger_approval", "send_email", "send_whatsapp", "send_sms", "create_activity",
] as const;

export interface ParsedRule {
  name: string;
  description: string;
  trigger: string;
  entity: string;
  conditions: { field: string; operator: string; value: unknown }[];
  actions: { type: string; payload: Record<string, unknown> }[];
  enabled: boolean;
}

export type NlToRuleOutcome =
  | { ok: true; rule: ParsedRule; warnings: string[] }
  | { ok: false; gated: boolean; code?: string; error: string };

export async function parseRuleFromNaturalLanguage(tenantId: string, description: string): Promise<NlToRuleOutcome> {
  if (!description || description.trim().length < 5) {
    return { ok: false, gated: false, error: "Please describe the automation in a full sentence." };
  }
  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);

  const prompt = `Convert this plain-English automation request into a CRM automation rule.

Request: "${description}"

You MUST use only these exact vocabularies:
- trigger (one of): ${RULE_TRIGGERS.join(", ")}
- entity (one of): ${RULE_ENTITIES.join(", ")}
- condition.operator (one of): ${RULE_OPERATORS.join(", ")}
- action.type (one of): ${RULE_ACTIONS.join(", ")}

Respond with ONLY this JSON (no markdown):
{
  "name": "<short rule name>",
  "trigger": "<one trigger>",
  "entity": "<one entity>",
  "conditions": [{"field":"<record field, e.g. budget_range>","operator":"<one operator>","value":<string|number>}],
  "actions": [{"type":"<one action>","payload":{<action-specific fields, e.g. {"title":"Follow up","priority":"High"}>}}]
}`;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt: "You translate business automation requests into strict JSON rules using only the allowed vocabulary. Never invent trigger/entity/operator/action values outside the allowed lists. Reply with raw JSON only.",
      maxTokens: AI_MAX_TOKENS.summary,
    });
    if (!("text" in result)) return { ok: false, gated: true, code: result.code, error: result.error };

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, gated: false, error: "Could not parse a rule from that description. Try rephrasing." };
    const parsed = JSON.parse(jsonMatch[0]);

    const warnings: string[] = [];

    const trigger = (RULE_TRIGGERS as readonly string[]).includes(parsed.trigger) ? parsed.trigger : "record_created";
    if (trigger !== parsed.trigger) warnings.push(`Unknown trigger "${parsed.trigger}" → defaulted to record_created.`);

    const entity = (RULE_ENTITIES as readonly string[]).includes(parsed.entity) ? parsed.entity : "Lead";
    if (entity !== parsed.entity) warnings.push(`Unknown entity "${parsed.entity}" → defaulted to Lead.`);

    const conditions = Array.isArray(parsed.conditions)
      ? parsed.conditions.filter((c: any) => {
          const valid = c && typeof c.field === "string" && (RULE_OPERATORS as readonly string[]).includes(c.operator);
          if (!valid) warnings.push(`Dropped an invalid condition (operator "${c?.operator}").`);
          return valid;
        }).map((c: any) => ({ field: c.field, operator: c.operator, value: c.value }))
      : [];

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.filter((a: any) => {
          const valid = a && (RULE_ACTIONS as readonly string[]).includes(a.type);
          if (!valid) warnings.push(`Dropped an unsupported action "${a?.type}".`);
          return valid;
        }).map((a: any) => ({ type: a.type, payload: a.payload && typeof a.payload === "object" ? a.payload : {} }))
      : [];

    if (actions.length === 0) {
      return { ok: false, gated: false, error: "The described automation had no supported action. Try naming a concrete action (e.g. create a task, send a notification)." };
    }

    return {
      ok: true,
      warnings,
      rule: {
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Untitled automation",
        description,
        trigger,
        entity,
        conditions,
        actions,
        enabled: false, // created disabled — the user reviews then enables it
      },
    };
  } catch (err: any) {
    return { ok: false, gated: false, error: err?.message || "AI rule parsing failed" };
  }
}
