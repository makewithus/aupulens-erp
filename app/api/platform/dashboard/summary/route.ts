import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import AdminUser from "@/models/platform/AdminUser";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { countOrganizations } from "@/lib/platform/tenancy/crossTenant";

/**
 * Phase 1's "empty shell" dashboard. Every number here is either a real,
 * live query result or an explicit `available: false` empty state with a
 * reason — never a placeholder figure (Hard Rule 3). Later phases add rows
 * (AI usage, MRR/ARR, alerts) beside these, following the same shape.
 */
export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  await connectDB();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [organizationCount, adminUserCount, auditEventsToday] = await Promise.all([
    countOrganizations(actor, "platform dashboard summary view"),
    AdminUser.countDocuments({}),
    PlatformAuditLog.countDocuments({ createdAt: { $gte: startOfToday } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      organizationCount,
      adminUserCount,
      auditEventsToday,
      aiUsage: { available: false, reason: "AI usage metering ships in Phase 4." },
      billing: { available: false, reason: "Platform billing (MRR/ARR) is not yet integrated — see docs/admin/OPEN_QUESTIONS.md #4." },
    },
  });
}
