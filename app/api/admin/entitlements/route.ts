import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "master-admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const tenantId = session.user.tenantId;
  const resolved = await resolveEntitlements(tenantId);
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
