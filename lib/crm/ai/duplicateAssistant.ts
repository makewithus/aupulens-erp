import levenshtein from "js-levenshtein";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";

export function detectDuplicates(record: any, existingRecords: any[], entityType: string) {
  const duplicates = [];

  for (const existing of existingRecords) {
    if (String(existing._id) === String(record._id)) continue;

    let score = 0;
    const checks = 0;

    if (entityType === "Lead" || entityType === "Contact") {
      if (record.email && existing.email && record.email.toLowerCase() === existing.email.toLowerCase()) {
        score += 80;
      }
      if (record.phone && existing.phone && record.phone === existing.phone) {
        score += 40;
      }
      
      const name1 = record.lead_name || `${record.first_name} ${record.last_name}`;
      const name2 = existing.lead_name || `${existing.first_name} ${existing.last_name}`;
      
      if (name1 && name2) {
        const dist = levenshtein(name1.toLowerCase(), name2.toLowerCase());
        if (dist <= 2) score += 30; // Close name match
      }
    } else if (entityType === "Account") {
      if (record.company_name && existing.company_name) {
        const dist = levenshtein(record.company_name.toLowerCase(), existing.company_name.toLowerCase());
        if (dist <= 2) score += 90;
      }
      if (record.website && existing.website && record.website.toLowerCase() === existing.website.toLowerCase()) {
        score += 60;
      }
    }

    if (score >= 80) {
      duplicates.push({
        recordId: existing._id,
        confidence: Math.min(score, 100),
        reason: "Similar match found on key identifiers"
      });
    }
  }

  return duplicates;
}

// ── AI-assisted duplicate ADJUDICATION (Native ERP AI functionality #9) ───────
//
// The deterministic matcher above only catches near-exact matches (exact
// email/phone, Levenshtein <=2). It misses semantic duplicates a human would
// spot instantly — "IBM" vs "International Business Machines", "Acme Corp" vs
// "Acme Corporation Pvt Ltd", a typo'd surname with a matching company. This
// layer asks the model to adjudicate a shortlist of existing records for
// same-real-world-entity matches, then MERGES with the deterministic hits
// (union by recordId). Falls back to the deterministic result alone when AI is
// gated/unavailable — never returns nothing.

export interface DuplicateMatch {
  recordId: any;
  confidence: number;
  reason: string;
  source: "deterministic" | "ai";
}

export interface DuplicateDetectionResult {
  aiUsed: boolean;
  fallbackReason?: string;
  duplicates: DuplicateMatch[];
}

/** Minimal identifying fields to send per record — keeps token cost bounded. */
function idFields(r: any, entityType: string) {
  if (entityType === "Account") {
    return { id: String(r._id), company_name: r.company_name, website: r.website };
  }
  return {
    id: String(r._id),
    name: r.lead_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    email: r.email,
    phone: r.phone,
    company_name: r.company_name,
  };
}

export async function detectDuplicatesWithAi(
  tenantId: string,
  record: any,
  existingRecords: any[],
  entityType: string,
  opts: { shortlistSize?: number } = {}
): Promise<DuplicateDetectionResult> {
  const deterministic: DuplicateMatch[] = detectDuplicates(record, existingRecords, entityType).map((d) => ({
    ...d,
    source: "deterministic" as const,
  }));

  // Bound token cost: only adjudicate a shortlist (excluding the record itself).
  const shortlist = existingRecords
    .filter((r) => String(r._id) !== String(record._id))
    .slice(0, opts.shortlistSize ?? 15);
  if (shortlist.length === 0) return { aiUsed: false, duplicates: deterministic };

  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
  const prompt = `Identify which EXISTING records refer to the same real-world ${entityType.toLowerCase()} as the NEW record. Account for abbreviations, legal suffixes (Ltd/Inc/Pvt), reordered names, and common typos — but do NOT match merely similar-but-distinct entities. Only report a match you are genuinely confident about.

NEW record: ${JSON.stringify(idFields(record, entityType))}
EXISTING records: ${JSON.stringify(shortlist.map((r) => idFields(r, entityType)))}

Respond with ONLY a JSON array (no markdown) of the duplicates you find:
[{"id":"<existing record id>","confidence":<0-100>,"reason":"<why they are the same entity>"}]
Return [] if there are no true duplicates.`;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt:
        "You are a careful CRM data-deduplication assistant. Only flag records that are the SAME real-world entity. When unsure, do not flag. Reply with raw JSON only.",
      maxTokens: AI_MAX_TOKENS.suggestion,
    });

    if (!("text" in result)) {
      return { aiUsed: false, fallbackReason: result.error, duplicates: deterministic };
    }

    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { aiUsed: false, fallbackReason: "Model did not return parseable JSON", duplicates: deterministic };

    const parsed: any[] = JSON.parse(jsonMatch[0]);
    const merged = new Map<string, DuplicateMatch>();
    for (const d of deterministic) merged.set(String(d.recordId), d);
    for (const p of parsed) {
      const id = String(p?.id ?? "");
      if (!id || id === "undefined") continue;
      // Deterministic hits (exact identifiers) are more trustworthy — keep them
      // over an AI hit for the same record.
      if (merged.has(id)) continue;
      const confidence = typeof p?.confidence === "number" ? Math.max(0, Math.min(100, p.confidence)) : 0;
      if (confidence < 50) continue; // ignore low-confidence AI guesses
      merged.set(id, { recordId: id, confidence, reason: typeof p?.reason === "string" ? p.reason : "AI judged same entity", source: "ai" });
    }
    return { aiUsed: true, duplicates: [...merged.values()].sort((a, b) => b.confidence - a.confidence) };
  } catch (err: any) {
    return { aiUsed: false, fallbackReason: err?.message || "AI call failed", duplicates: deterministic };
  }
}
