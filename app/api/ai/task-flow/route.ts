export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { resolveTenantAiSettings } from "@/lib/ai/tenantAi";
import { getTierLimits } from "@/lib/constants/tiers";
import { getAiPeriod, getAiUsageCount, incrementAiUsage, getGlobalMonthlyCap, getGlobalAiUsageCount, incrementGlobalAiUsage } from "@/lib/ai/usage";
import { costCapReached } from "@/lib/platform/ai/spend";
import { resolveAtLimitDecision } from "@/lib/platform/ai/limitBehavior";
import { handleTaskFlow, type TaskFlowDeps } from "@/lib/ai/taskFlow/handler";
import { loadActiveSession, saveSession, closeSession } from "@/lib/ai/taskFlow/session";

/**
 * POST /api/ai/task-flow  { text, expectSession? }
 * One turn of the guided create flow. See lib/ai/taskFlow/handler.ts. Never opens or creates
 * anything itself: it returns what the client should show/navigate to.
 */
const deps: TaskFlowDeps = {
  loadSession: loadActiveSession,
  saveSession,
  closeSession,
  async aiAllowed(tenantId) {
    // Same limits callClaudeForTenant enforces, read-only: translation is not free.
    const { tier } = await resolveTenantAiSettings(tenantId);
    const period = getAiPeriod();
    if ((await getGlobalAiUsageCount(period)) >= getGlobalMonthlyCap()) return false;
    if (await costCapReached(tenantId)) return false; // combined Azure+Sarvam spend vs the tenant's cost cap
    const cap = getTierLimits(tier).aiCallsPerMonth;
    if ((await getAiUsageCount(tenantId, period)) >= cap) return (await resolveAtLimitDecision(tenantId)).action !== "block";
    return true;
  },
  async chargeTranslation(tenantId) {
    const period = getAiPeriod();
    await incrementAiUsage(tenantId, period);
    await incrementGlobalAiUsage(period);
  },
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    const userId = (session?.user as any)?.id as string | undefined;
    if (!session || !tenantId || !userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ success: false, message: "text is required" }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ handled: false, sessionActive: false, kind: "not_handled", message: "", english: text, language: { detected: "und", degraded: false, original: text } });

    await connectDB();
    const { aiSettings } = await resolveTenantAiSettings(tenantId);
    const url = new URL(req.url);
    const result = await handleTaskFlow(
      {
        tenantId, userId, role: String((session.user as any).role ?? ""), text,
        expectSession: body.expectSession === true, aiSettings,
        http: { origin: url.origin, cookie: req.headers.get("cookie") ?? "" },
      },
      deps,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[task-flow] route error", err instanceof Error ? err.message : String(err));
    // Fail open: the client falls back to the normal assistant.
    return NextResponse.json({ handled: false, sessionActive: false, kind: "not_handled", message: "", english: "", language: { detected: "und", degraded: true, original: "" } });
  }
}
