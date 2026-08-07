/**
 * Real, deterministic data-completeness scanner (Phase 2).
 *
 * This is deliberately NOT an LLM call — checking whether a required field
 * is null/empty across potentially thousands of records is a mechanical
 * completeness check, not a judgment task; an LLM call per record would add
 * cost and latency for zero benefit over a plain field-presence check. This
 * mirrors the same reasoning duplicate detection (lib/crm/ai/duplicateAssistant.ts)
 * already uses: the right tool for this specific job isn't an LLM.
 *
 * Replaces the old lib/crm/dataGovernance/{dataQualityEngine,dataHealthScore}.ts,
 * which were fully written but never called from anywhere — this one backs
 * the real /crm/ai/dashboard "Data Health" widget.
 */

import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";

const LEAD_KEY_FIELDS: Array<{ field: string; label: string }> = [
  { field: "company_name", label: "Company Name" },
  { field: "budget_range", label: "Budget Range" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "expected_timeline", label: "Expected Timeline" },
];

export interface DataCompletionSummary {
  totalRecords: number;
  completeRecords: number;
  healthPercent: number;
  missingFieldCount: number;
  missingByField: Record<string, number>;
}

export function analyzeLeadCompleteness(leads: any[]): DataCompletionSummary {
  const missingByField: Record<string, number> = {};
  for (const f of LEAD_KEY_FIELDS) missingByField[f.label] = 0;

  let missingFieldCount = 0;
  let completeRecords = 0;

  for (const lead of leads) {
    let missingOnThisRecord = 0;
    for (const f of LEAD_KEY_FIELDS) {
      const value = (lead as any)[f.field];
      const isMissing = value === undefined || value === null || value === "";
      if (isMissing) {
        missingByField[f.label]++;
        missingFieldCount++;
        missingOnThisRecord++;
      }
    }
    if (missingOnThisRecord === 0) completeRecords++;
  }

  const totalRecords = leads.length;
  const totalPossibleFields = totalRecords * LEAD_KEY_FIELDS.length;
  const healthPercent = totalPossibleFields > 0 ? Math.round(((totalPossibleFields - missingFieldCount) / totalPossibleFields) * 100) : 100;

  return { totalRecords, completeRecords, healthPercent, missingFieldCount, missingByField };
}

// ── AI data COMPLETION (distinct from the deterministic detection above) ──────
//
// Detecting which fields are empty is mechanical (above). *Completing* them —
// inferring a plausible value from the other fields/notes on a record — is a
// genuine judgment task where an LLM adds value (Native ERP AI functionality
// #10, "data completion"). This SUGGESTS values for a human to accept; it never
// auto-writes. Falls back to a plain missing-field list when AI is
// gated/unavailable, so the feature degrades to "here's what to fill in" rather
// than breaking.

export interface FieldSuggestion {
  field: string;
  label: string;
  /** Suggested value, or null when the model can't responsibly infer one. */
  suggestion: string | null;
  /** 0-100 — the model's confidence it inferred correctly (0 when it declined). */
  confidence: number;
  reasoning?: string;
}

export interface DataCompletionSuggestions {
  aiUsed: boolean;
  /** Present when AI was gated/failed — the caller shows manual-fill guidance. */
  fallbackReason?: string;
  suggestions: FieldSuggestion[];
}

/** Fields on a single lead that are empty, as {field,label} pairs. */
export function missingFieldsForLead(lead: any): Array<{ field: string; label: string }> {
  return LEAD_KEY_FIELDS.filter((f) => {
    const v = (lead as any)[f.field];
    return v === undefined || v === null || v === "";
  });
}

export async function suggestLeadCompletions(
  tenantId: string,
  lead: any
): Promise<DataCompletionSuggestions> {
  const missing = missingFieldsForLead(lead);
  // Deterministic short-circuit: nothing missing → nothing to suggest.
  if (missing.length === 0) return { aiUsed: false, suggestions: [] };

  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
  const prompt = `A CRM lead record has missing fields. For EACH missing field, infer a plausible value ONLY if the other fields/notes genuinely support it — otherwise set suggestion to null (never guess blindly, never invent contact details like email/phone that aren't derivable). Missing fields: ${missing.map((m) => m.field).join(", ")}.

Lead record (JSON):
${JSON.stringify({ lead_name: lead?.lead_name, company_name: lead?.company_name, source: lead?.source, budget_range: lead?.budget_range, expected_timeline: lead?.expected_timeline, notes: lead?.notes, email: lead?.email, phone: lead?.phone })}

Respond with ONLY a JSON array (no markdown), one object per missing field:
[{"field":"<field key>","suggestion":<string or null>,"confidence":<0-100>,"reasoning":"<why, citing the fields used>"}]`;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt:
        "You complete CRM records conservatively. Only infer a value the other data genuinely supports; otherwise return null. Never fabricate emails, phone numbers, or names. Reply with raw JSON only.",
      maxTokens: AI_MAX_TOKENS.suggestion,
    });

    if (!("text" in result)) {
      return { aiUsed: false, fallbackReason: result.error, suggestions: missing.map((m) => ({ field: m.field, label: m.label, suggestion: null, confidence: 0 })) };
    }

    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { aiUsed: false, fallbackReason: "Model did not return parseable JSON", suggestions: missing.map((m) => ({ field: m.field, label: m.label, suggestion: null, confidence: 0 })) };
    }

    const parsed: any[] = JSON.parse(jsonMatch[0]);
    const byField = new Map(parsed.map((p) => [p.field, p]));
    return {
      aiUsed: true,
      suggestions: missing.map((m) => {
        const p = byField.get(m.field);
        const suggestion = typeof p?.suggestion === "string" && p.suggestion.trim() ? p.suggestion.trim() : null;
        const confidence = typeof p?.confidence === "number" ? Math.max(0, Math.min(100, p.confidence)) : 0;
        return { field: m.field, label: m.label, suggestion, confidence: suggestion ? confidence : 0, reasoning: typeof p?.reasoning === "string" ? p.reasoning : undefined };
      }),
    };
  } catch (err: any) {
    return { aiUsed: false, fallbackReason: err?.message || "AI call failed", suggestions: missing.map((m) => ({ field: m.field, label: m.label, suggestion: null, confidence: 0 })) };
  }
}
