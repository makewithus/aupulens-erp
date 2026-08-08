import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";

/**
 * Inline field autocomplete (Copilot-style tab-completion) for ERP form fields.
 *
 * Returns ONLY the short continuation for what the user has typed. This is the
 * highest-frequency AI call site, so it is deliberately tiny and cheap:
 * - client debounces hard (see lib/hooks/useAiComplete),
 * - a very small token cap (48) — a few words, not paragraphs,
 * - never fires under 3 chars.
 * It never writes anything; it only suggests text the user accepts with Tab.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!session || !tenantId) return NextResponse.json({ suggestion: "" }, { status: 401 });

    const body = await req.json();
    const label: string = String(body.label || "field");
    const value: string = String(body.value || "");
    const context = body.context;
    if (value.trim().length < 3) return NextResponse.json({ suggestion: "" });

    const prompt = `You are an inline autocomplete for an ERP form field. Continue the user's text naturally and briefly. Return ONLY the continuation text that should come immediately AFTER what they typed — no quotes, no explanation, no repetition of what's already there. If nothing sensible continues it, return an empty string. Keep it short (a phrase or one short sentence).

Field label: "${label}"${context ? `\nOther values already in this form: ${JSON.stringify(context).slice(0, 500)}` : ""}
Text so far: "${value.slice(-400)}"`;

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { maxTokens: 48 });
    if (!("text" in result)) return NextResponse.json({ suggestion: "" });

    let s = result.text.replace(/^\s+/, "").replace(/^["']|["']$/g, "");
    // Don't echo what the user already typed; cap length.
    if (value.endsWith(s)) s = "";
    return NextResponse.json({ suggestion: s.slice(0, 160) });
  } catch {
    return NextResponse.json({ suggestion: "" });
  }
}
