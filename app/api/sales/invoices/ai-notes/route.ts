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
    const { field, context } = body; // field: "notes" | "terms"
    if (!field) {
      return NextResponse.json({ success: false, message: "field is required" }, { status: 400 });
    }

    const systemPrompt =
      field === "terms"
        ? "You write concise, professional invoice Terms & Conditions for an Indian GST business invoice. Respond with plain text only, 2-4 short sentences, no markdown."
        : "You write concise, professional invoice Notes (a thank-you / payment reminder style note) for an Indian GST business invoice. Respond with plain text only, 1-2 short sentences, no markdown.";

    let text: string;
    try {
      text = await callClaude(context || "Write a suitable default.", { systemPrompt, maxTokens: 200 });
    } catch (aiError: any) {
      return NextResponse.json({ success: false, message: `AI assist unavailable: ${aiError.message}` }, { status: 503 });
    }

    return NextResponse.json({ success: true, data: { text: text.trim() } });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
