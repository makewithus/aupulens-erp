import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { handleRouteError } from "@/lib/api/validateId";

export async function POST(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const subscription = await subscriptionManager.reactivateSubscription(tenantId);

    return NextResponse.json({
      success: true,
      message: "Subscription successfully reactivated. Automatic renewals have been restored.",
      data: subscription,
    });
  } catch (error: any) {
    if (error?.message?.includes("Subscription is not in cancelled status") || error?.message?.includes("Paid-through period has already elapsed")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return handleRouteError(error);
  }
}
