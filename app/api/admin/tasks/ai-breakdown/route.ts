import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { goal } = await request.json();

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API Key missing" },
        { status: 500 }
      );
    }

    const prompt = `
      You are a project manager. Break down the following goal into 3-5 actionable subtasks.
      GOAL: "${goal}"
      
      Reply ONLY with a valid JSON array of objects. Do not include any other text or markdown formatting.
      Format: [{"title": "Task Title", "description": "Brief description", "priority": "high|medium|low"}]
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const result = await response.json();
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    console.log("Gemini Raw Response:", text);

    // Clean up markdown code blocks if present
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // Extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const tasks = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("AI Breakdown Error:", error);
    return NextResponse.json(
      { error: "Failed to generate tasks" },
      { status: 500 }
    );
  }
}
