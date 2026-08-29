import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiUsage from "@/models/AiUsage";
import Organization from "@/models/Organization";
import { getAiPeriod, getGlobalMonthlyCap, getGlobalAiUsageCount } from "@/lib/ai/usage";
import { getTierLimits } from "@/lib/constants/tiers";
import { checkTenantModelOverrides } from "@/lib/ai/modelHealth";

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

  const isMasterAdmin = session!.user.role === "master-admin";
  const currentPeriod = getAiPeriod();

  // Model-override health check (stale/invalid settings.ai.model). A workspace
  // admin only sees their OWN tenant's status (scoped server-side so this
  // doesn't scan every tenant on the platform); a master-admin sees the whole
  // platform (so they can spot and fix any tenant silently 400-ing on AI).
  const [org, history, healthReport, globalUsed] = await Promise.all([
    Organization.findOne({ subdomain: tenantId }, { tier: 1, "settings.ai": 1 }).lean(),
    AiUsage.find({ tenantId }).sort({ period: -1 }).limit(12).lean(),
    checkTenantModelOverrides(isMasterAdmin ? undefined : tenantId),
    getGlobalAiUsageCount(currentPeriod),
  ]);

  const tier = (org as any)?.tier ?? "starter";
  const { aiCallsPerMonth: cap } = getTierLimits(tier);
  const current = (history as any[]).find((h) => h.period === currentPeriod)?.count ?? 0;

  const modelHealth = {
    deployedChatModels: healthReport.deployedChatModels,
    configured: healthReport.configured,
    // Scope the flagged list to the caller's authority.
    stale: isMasterAdmin
      ? healthReport.stale
      : healthReport.stale.filter((s) => s.subdomain === tenantId),
    // This workspace's own override status (null if it uses the default).
    ownOverride:
      healthReport.overrides.find((o) => o.subdomain === tenantId) ?? null,
  };

  // Platform-wide trial-budget ceiling (visible so an admin understands a
  // possible AI_GLOBAL_LIMIT_REACHED even while under their own tier cap).
  const globalCap = getGlobalMonthlyCap();

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
      modelHealth,
      globalCeiling: {
        cap: globalCap,
        used: globalUsed,
        remaining: Math.max(0, globalCap - globalUsed),
        percentUsed: globalCap > 0 ? Math.round((globalUsed / globalCap) * 100) : 0,
        // Only a master-admin sees the raw platform-wide number is meaningful;
        // for a workspace admin it's still shown as context for the shared cap.
        visibleToAll: true,
      },
    },
  });
}
