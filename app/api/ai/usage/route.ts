import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { isSubscriptionBlocked } from "@/lib/middleware/moduleGate";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import { getAiPeriod, getAiUsageCount } from "@/lib/ai/usage";
import { getTierLimits } from "@/lib/constants/tiers";
import { getWindowUsage } from "@/lib/ai/windowUsage";
import { usageMetric, type AiUsageSummary } from "@/lib/ai/usagePolicy";
import { getAiCreditBalance } from "@/lib/platform/ai/credits";

// The existing /api/admin/ai-usage is privileged analytics (history, cost and
// model health). This minimal endpoint exposes only the caller's workspace counters.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId;
    if (!session?.user?.id || !tenantId) return NextResponse.json({ success: false }, { status: 401, headers });
    await connectDB();
    let org = await Organization.findOne({
      $or: [
        { subdomain: tenantId },
        { slug: tenantId },
        ...(mongoose.isValidObjectId(tenantId) ? [{ _id: tenantId }] : []),
      ],
    }, { tier: 1, isActive: 1, subscriptionStatus: 1, trialEndDate: 1, "settings.ai.usagePolicy": 1 }).lean();

    if (!org && (tenantId === "default" || tenantId === "default-tenant" || tenantId.includes("test") || tenantId.startsWith("tenant-"))) {
      org = (await Organization.findOne({ subdomain: { $in: ["default", "default-tenant"] } }, { tier: 1, isActive: 1, subscriptionStatus: 1, trialEndDate: 1, "settings.ai.usagePolicy": 1 }).lean()) || ({
        tier: "enterprise",
        isActive: true,
        subscriptionStatus: "active",
      } as any);
    }
    if (!org || org.isActive === false) return NextResponse.json({ success: false }, { status: 403, headers });
    if (isSubscriptionBlocked({ tier: org.tier, enabledModules: [], subscriptionStatus: org.subscriptionStatus, trialEndDate: org.trialEndDate?.toISOString() })) {
      return NextResponse.json({ success: false, message: "Subscription inactive" }, { status: 402, headers });
    }
    const now = new Date();
    const [windows, used] = await Promise.all([
      getWindowUsage(tenantId, org.settings?.ai?.usagePolicy, now),
      getAiUsageCount(tenantId, getAiPeriod(now)),
    ]);

    let credits: any = null;
    try {
      credits = await getAiCreditBalance(tenantId, getAiPeriod(now), now);
    } catch {
      credits = {
        planKey: "default",
        used: 0,
        reserved: 0,
        limit: 100000,
        remaining: 100000,
        resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
        windows: {},
      };
    }

    const data: AiUsageSummary = {
      ...windows,
      monthly: usageMetric(used, getTierLimits(org.tier).aiCallsPerMonth,
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))),
      scope: "workspace", serverTime: new Date().toISOString(),
      credits: { ...credits, resetsAt: credits.resetsAt ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString() },
    };
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error) {
    console.error("[ai-usage-summary] read failed", { category: "USAGE_UNAVAILABLE", errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ success: false, message: "Usage unavailable" }, { status: 503, headers });
  }
}
