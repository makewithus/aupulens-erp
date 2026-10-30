import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import Plan from "@/models/platform/Plan";
import { handleRouteError } from "@/lib/api/validateId";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const subscription = await subscriptionManager.getOrCreateSubscription(tenantId);
    const entitlements = await resolveEntitlements(tenantId);
    const planDef = await Plan.findOne({ key: subscription.planKey }).lean();

    return NextResponse.json({
      success: true,
      data: {
        subscription,
        entitlements,
        planCatalogDetails: planDef,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
