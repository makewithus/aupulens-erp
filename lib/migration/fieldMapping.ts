/**
 * Field mapping — suggest which source column feeds each canonical target field.
 *
 * Two layers, same defensive pattern as lib/crm/ai/*: a deterministic alias
 * matcher always runs and always returns something usable; the LLM layer only
 * *refines* it and is skipped/ignored when AI is disabled or over cap. A
 * workspace with AI off still gets a solid auto-mapping.
 */

import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { deterministicMapping } from "@/lib/migration/deterministicMapping";
import {
  resolveTenantAiSettings,
  callClaudeForTenant,
} from "@/lib/ai/tenantAi";

export { deterministicMapping };

export interface MappingSuggestion {
  /** targetFieldKey -> sourceColumn (only confident matches included). */
  mapping: Record<string, string>;
  aiUsed: boolean;
}

/**
 * Full mapping suggestion: deterministic first, then ask the LLM to fill gaps /
 * correct obvious misses using a couple of sample rows for context. The LLM can
 * only *add or change* mappings to columns that actually exist and fields that
 * actually exist — anything else it returns is ignored.
 */
export async function suggestMapping(
  tenantId: string,
  entity: string,
  columns: string[],
  sampleRows: Record<string, unknown>[],
): Promise<MappingSuggestion> {
  const schema = getEntitySchema(entity);
  if (!schema) return { mapping: {}, aiUsed: false };

  const base = deterministicMapping(schema, columns);

  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);

  const fieldList = schema.fields
    .map((f) => `- ${f.key}${f.required ? " (required)" : ""}: ${f.label}`)
    .join("\n");

  const prompt = `You are mapping columns from a legacy ERP export to Aupulens' ${schema.label} fields.

Target fields:
${fieldList}

Source columns:
${columns.map((c) => `- ${c}`).join("\n")}

A few sample rows (JSON):
${JSON.stringify(sampleRows.slice(0, 3))}

A deterministic matcher already produced this mapping:
${JSON.stringify(base)}

Improve it. Respond with ONLY a JSON object mapping targetFieldKey -> exact sourceColumn name. Use only field keys and column names from the lists above. Omit a field entirely if no column fits. No markdown, no prose.`;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt:
        "You map spreadsheet columns to ERP fields. Reply with raw JSON only. Never invent field keys or column names that were not given to you.",
      maxTokens: 500,
    });

    if (!("text" in result)) {
      return { mapping: base, aiUsed: false };
    }

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { mapping: base, aiUsed: false };

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const validFieldKeys = new Set(schema.fields.map((f) => f.key));
    const validColumns = new Set(columns);
    const merged: Record<string, string> = { ...base };
    for (const [k, v] of Object.entries(parsed)) {
      if (validFieldKeys.has(k) && typeof v === "string" && validColumns.has(v)) {
        merged[k] = v;
      }
    }
    return { mapping: merged, aiUsed: true };
  } catch {
    return { mapping: base, aiUsed: false };
  }
}
