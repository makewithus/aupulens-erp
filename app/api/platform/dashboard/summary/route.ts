import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import AdminUser from "@/models/platform/AdminUser";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { countOrganizations } from "@/lib/platform/tenancy/crossTenant";
import { getPlatformAiUsageSummary } from "@/lib/platform/ai/dashboard";

/**
 * Every number here is either a real, live query result or an explicit
 * `available: false` empty state with a reason — never a placeholder figure
 * (Hard Rule 3). Billing (MRR/ARR) stays an honest empty state — see
 * docs/admin/OPEN_QUESTIONS.md #4 — since Phase 4 built AI usage but no
 * platform-billing/payment integration exists.
 */
export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  await connectDB();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [organizationCount, adminUserCount, auditEventsToday, aiUsage] = await Promise.all([
    countOrganizations(actor, "platform dashboard summary view"),
    AdminUser.countDocuments({}),
    PlatformAuditLog.countDocuments({ createdAt: { $gte: startOfToday } }),
    getPlatformAiUsageSummary(actor, "platform dashboard summary view"),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      organizationCount,
      adminUserCount,
      auditEventsToday,
      aiUsage: { available: true, ...aiUsage },
      billing: { available: false, reason: "Platform billing (MRR/ARR) is not yet integrated — see docs/admin/OPEN_QUESTIONS.md #4." },
    },
  });
}
