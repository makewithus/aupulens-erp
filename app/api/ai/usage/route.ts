import { NextResponse } from "next/server";
import { isSubscriptionBlocked } from "@/lib/middleware/moduleGate";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import { getAiPeriod, getAiUsageCount } from "@/lib/ai/usage";
import { getTierLimits } from "@/lib/constants/tiers";
import { getWindowUsage } from "@/lib/ai/windowUsage";
import { usageMetric, type AiUsageSummary } from "@/lib/ai/usagePolicy";

// The existing /api/admin/ai-usage is privileged analytics (history, cost and
// model health). This minimal endpoint exposes only the caller's workspace counters.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId;
    if (!session?.user?.id || !tenantId) return NextResponse.json({ success: false }, { status: 401, headers });
    await connectDB();
    const org = await Organization.findOne({ subdomain: tenantId }, { tier: 1, isActive: 1, subscriptionStatus: 1, trialEndDate: 1, "settings.ai.usagePolicy": 1 }).lean();
    if (!org || org.isActive === false) return NextResponse.json({ success: false }, { status: 403, headers });
    if (isSubscriptionBlocked({ tier: org.tier, enabledModules: [], subscriptionStatus: org.subscriptionStatus, trialEndDate: org.trialEndDate?.toISOString() })) {
      return NextResponse.json({ success: false, message: "Subscription inactive" }, { status: 402, headers });
    }
    const now = new Date();
    const [windows, used] = await Promise.all([
      getWindowUsage(tenantId, org.settings?.ai?.usagePolicy, now),
      getAiUsageCount(tenantId, getAiPeriod(now)),
    ]);
    const data: AiUsageSummary = {
      ...windows,
      monthly: usageMetric(used, getTierLimits(org.tier).aiCallsPerMonth,
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))),
      scope: "workspace", serverTime: new Date().toISOString(),
    };
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error) {
    console.error("[ai-usage-summary] read failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, message: "Usage unavailable" }, { status: 503, headers });
  }
}
