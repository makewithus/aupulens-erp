import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { callClaudeForTenant, resolveTenantAiSettings } from "@/lib/ai/tenantAi";
import { randomUUID } from "crypto";

// Assistive only — returns a proposed invoice draft as JSON. Nothing is
// persisted here; the client shows the proposal for the user to review/edit,
// then submits it through the normal POST /api/sales/invoices flow (the
// existing confirmation gate: no AI call ever writes directly).
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = stripProtectedFields(await request.json());
    const { prompt, customers = [], products = [] } = body;
    if (!prompt) {
      return NextResponse.json({ success: false, message: "prompt is required" }, { status: 400 });
    }

    const customerList = customers
      .slice(0, 50)
      .map((c: any) => `- ${c._id}: ${c.name}${c.company ? ` (${c.company})` : ""}`)
      .join("\n");
    const productList = products
      .slice(0, 100)
      .map((p: any) => `- ${p._id}: ${p.name} @ ${p.price ?? p.unitPrice ?? 0}`)
      .join("\n");

    const systemPrompt = `You are an invoicing assistant for an Indian GST ERP. Given a free-text request, respond with STRICT JSON ONLY (no markdown fences, no commentary) matching this shape:
{
  "customerId": string | null,
  "customerName": string | null,
  "lineItems": [{ "itemId": string | null, "name": string, "qty": number, "unitPrice": number, "taxRate": number, "hsn": string | null }],
  "notes": string | null,
  "reference": string | null
}
Match customerId/itemId from the provided lists by closest name match; if nothing matches, set the id to null and fill in the *Name/name field instead so the UI can prompt the user to create it.

Known customers:
${customerList || "(none)"}

Known products:
${productList || "(none)"}`;

    let text: string;
    try {
      const tenantId = session.user.tenantId;
      const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
      const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { systemPrompt, maxTokens: 1024, feature: "ai_invoice_draft", idempotencyKey: typeof body.requestId === "string" ? body.requestId : randomUUID() });
      if (!("text" in result)) return NextResponse.json({ success: false, message: result.error, code: result.code }, { status: 403 });
      text = result.text;
    } catch (aiError: any) {
      return NextResponse.json({ success: false, message: `AI assist unavailable: ${aiError.message}` }, { status: 503 });
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, message: "Could not parse an invoice draft from the AI response" }, { status: 422 });
    }

    let draft: any;
    try {
      draft = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ success: false, message: "Could not parse an invoice draft from the AI response" }, { status: 422 });
    }

    return NextResponse.json({ success: true, data: draft });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: safeInternalErrorMessage() }, { status: 500 });
  }
}
