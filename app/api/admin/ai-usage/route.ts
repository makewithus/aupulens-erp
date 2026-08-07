import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiUsage from "@/models/AiUsage";
import Organization from "@/models/Organization";
import { getAiPeriod } from "@/lib/ai/usage";
import { getTierLimits } from "@/lib/constants/tiers";

/**
 * Per-tenant AI cost/usage analytics (Phase 6.6, "AI Studio").
 * Reads the AiUsage counters (already tracked per tenant/month by
 * lib/ai/usage.ts) and pairs them with the tier cap so a workspace admin
 * can see how much of their monthly AI allowance they've used and the trend
 * over recent months. The editable AI preferences (model/kill-switch/token
 * limit) already live on the workspace settings page (Phase 3).
 */
export async function GET() {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });
  if (session!.user.role !== "admin" && session!.user.role !== "master-admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const [org, history] = await Promise.all([
    Organization.findOne({ subdomain: tenantId }, { tier: 1, "settings.ai": 1 }).lean(),
    AiUsage.find({ tenantId }).sort({ period: -1 }).limit(12).lean(),
  ]);

  const tier = (org as any)?.tier ?? "starter";
  const { aiCallsPerMonth: cap } = getTierLimits(tier);
  const currentPeriod = getAiPeriod();
  const current = (history as any[]).find((h) => h.period === currentPeriod)?.count ?? 0;

  return NextResponse.json({
    success: true,
    data: {
      tier,
      cap,
      currentPeriod,
      currentUsage: current,
      remaining: Math.max(0, cap - current),
      percentUsed: cap > 0 ? Math.round((current / cap) * 100) : 0,
      aiDisabled: (org as any)?.settings?.ai?.disabled ?? false,
      history: (history as any[]).map((h) => ({ period: h.period, count: h.count })),
    },
  });
}
