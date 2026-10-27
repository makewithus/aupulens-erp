import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "master-admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const tenantId = session.user.tenantId;
  const resolved = await resolveEntitlements(tenantId);
  if (resolved.source === "permissive_default") {
    return NextResponse.json({ success: false, message: "Unable to verify approved modules" }, { status: 503 });
  }
  const entitlementDoc = await OrganizationEntitlement.findOne({ tenantId }).select("overrides").lean();

  return NextResponse.json({
    success: true,
    data: {
      planKey: resolved.planKey,
      modules: resolved.modules,
      limits: resolved.limits,
      source: resolved.source,
      overrides: entitlementDoc?.overrides ?? null,
    },
  });
}
