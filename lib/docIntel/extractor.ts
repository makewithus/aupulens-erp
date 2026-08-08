/**
 * LLM extraction step — turns document content (text or image) into a structured
 * VendorBillExtraction. Goes through callClaudeForTenant so it respects the
 * tenant AI kill-switch, monthly cap, and model selection like every other AI
 * feature. When the source is an image, the data URL is passed to the vision
 * model (gpt-4o) for real OCR + extraction in one call.
 *
 * Returns a discriminated result so callers can distinguish "AI unavailable"
 * (gated / disabled) from a genuine extraction failure.
 */

import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import {
  buildExtractionPrompt,
  parseExtraction,
  type DocIntelType,
  type VendorBillExtraction,
} from "@/lib/docIntel/extractionSchemas";
import type { ExtractedContent } from "@/lib/docIntel/textExtract";

export type ExtractionOutcome =
  | { ok: true; data: VendorBillExtraction }
  | { ok: false; gated: boolean; error: string };

const SYSTEM =
  "You are a precise document-data extractor for an ERP. Read the document and return ONLY the requested JSON. Never fabricate values that are not present in the document.";

export async function extractDocument(
  tenantId: string,
  type: DocIntelType,
  content: ExtractedContent,
): Promise<ExtractionOutcome> {
  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);

  const instruction = buildExtractionPrompt(type);
  const userMessage =
    content.kind === "image"
      ? instruction
      : `${instruction}\n\nDocument text:\n"""\n${content.text.slice(0, 12000)}\n"""`;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, userMessage, {
      systemPrompt: SYSTEM,
      maxTokens: 1200,
      imageDataUrl: content.kind === "image" ? content.imageDataUrl : undefined,
    });

    if (!("text" in result)) {
      return { ok: false, gated: true, error: result.error };
    }

    const data = parseExtraction(type, result.text);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, gated: false, error: err instanceof Error ? err.message : "Extraction failed" };
  }
}
