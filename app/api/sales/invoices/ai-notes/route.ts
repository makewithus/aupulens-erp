import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { callClaude } from "@/lib/ai/claude";

// Assistive draft-writer for the Notes / Terms & Conditions fields. Returns
// plain text only; the user still has to accept it into the field.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { field, context } = body; // field: "notes" | "terms"; context: the document type / situation
    if (!field) {
      return NextResponse.json({ success: false, message: "field is required" }, { status: 400 });
    }

    // The note/terms MUST match the document it's written for. A receipt/payment
    // note thanks the customer for their PAYMENT and never says an amount is due;
    // a quote invites the customer to proceed; an invoice is a thank-you / gentle
    // payment reminder; a log/chatter note records what happened. Drive this off
    // the caller-supplied `context` so the wrong (invoice-due) note is never used.
    const docType = String(context || "invoice").trim() || "invoice";
    const kindRules =
      field === "terms"
        ? `Write concise, professional Terms & Conditions that fit a "${docType}" for an Indian GST business. 2-4 short sentences.`
        : `Write ONE concise, professional Note that fits a "${docType}" for an Indian GST business. 1-2 short sentences.`;
    const systemPrompt =
      `You draft the ${field === "terms" ? "Terms & Conditions" : "Note"} for business documents. ${kindRules}\n` +
      `CRITICAL — the text must be appropriate for a "${docType}" specifically:\n` +
      `• receipt / payment: thank the customer for their PAYMENT received; NEVER say an amount is due or overdue.\n` +
      `• quote / quotation: invite the customer to accept/proceed; do not imply money is owed.\n` +
      `• invoice: a warm thank-you with a gentle payment reminder per the stated terms.\n` +
      `• sales order / delivery / operations log: a short relevant note for that action.\n` +
      `Plain text only, no markdown, no quotes around the text.`;

    let text: string;
    try {
      text = await callClaude(`Write the ${field} for a ${docType}.`, { systemPrompt, maxTokens: 200 });
    } catch (aiError: any) {
      return NextResponse.json({ success: false, message: `AI assist unavailable: ${aiError.message}` }, { status: 503 });
    }

    return NextResponse.json({ success: true, data: { text: text.trim() } });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
