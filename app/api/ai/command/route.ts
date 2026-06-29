import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { command, context } = await req.json();

    if (!command) {
      return NextResponse.json({ error: "No command provided" }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("ANTHROPIC_API_KEY not set. Using mocked response.");
      return NextResponse.json({
        action: "action",
        message: `(Mock) Understood intent for context ${context?.pathname || 'unknown'}: ${command}`
      });
    }

    const prompt = `
You are an AI assistant for a comprehensive ERP system (Aupulens ERP). 
The user is invoking a command from a specific page.
User Command: "${command}"
Current Page Context: "${context?.pathname}"

Your goal is to understand the user's intent based on the command and the context.
You can respond with two main actions:
1. "navigate": If the user wants to go to a different module or page.
2. "action": If the user wants to perform an action on the current page (e.g., "Export to PDF", "Create new Invoice", "Approve this voucher"). For now, we will just return a success message for actions, as actual execution might require complex frontend state manipulation not yet fully wired.

Return a JSON object with the following structure:
{
  "action": "navigate" | "action" | "unknown",
  "url": "optional string (required if action is navigate)",
  "message": "A short, friendly message indicating what is being done or why it cannot be done.",
  "refresh": boolean (optional, if the page should be refreshed after an action)
}

Do not include any markdown formatting, only pure JSON. Example: {"action":"navigate", "url":"/finance/accounting/vouchers", "message":"Navigating to vouchers"}
    `;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    let responseText = "";
    if (message.content[0].type === "text") {
      responseText = message.content[0].text;
    }

    // Remove markdown code block if present
    if (responseText.startsWith("\`\`\`json")) {
        responseText = responseText.replace(/^\`\`\`json\n/, "").replace(/\n\`\`\`$/, "");
    }
    
    let parsedResponse;
    try {
        parsedResponse = JSON.parse(responseText);
    } catch (e) {
        console.error("Failed to parse AI response:", responseText);
        parsedResponse = { action: "unknown", message: "I didn't quite understand that command." };
    }

    return NextResponse.json(parsedResponse);
  } catch (error: any) {
    console.error("AI Command processing error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
