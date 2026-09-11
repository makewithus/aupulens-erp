import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import PlatformAlert from "@/models/platform/PlatformAlert";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY } from "@/lib/constants/statuses";

export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  if (!(await hasCapability(actor, ADMIN_CAPABILITY.VIEW_DASHBOARD))) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);
  const unresolvedOnly = url.searchParams.get("unresolvedOnly") === "true";
  const filter = unresolvedOnly ? { resolvedAt: { $exists: false } } : {};

  const alerts = await PlatformAlert.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json({
    success: true,
    data: alerts.map((a) => ({
      id: String(a._id),
      tenantId: a.tenantId,
      alertType: a.alertType,
      severity: a.severity,
      message: a.message,
      deliveryChannels: a.deliveryChannels,
      emailSent: a.emailSent,
      webhookSent: a.webhookSent,
      resolvedAt: a.resolvedAt?.toISOString(),
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
