import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { handleRouteError } from "@/lib/api/validateId";
import { requireBillingOperator } from "@/lib/billing/authz";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const forbidden = requireBillingOperator(session.user);
    if (forbidden) return forbidden;

    const tenantId = session.user.tenantId;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason as string | undefined;

    const subscription = await subscriptionManager.cancelSubscription({
      tenantId,
      reason,
    });

    return NextResponse.json({
      success: true,
      message: `Cancellation requested. Your paid access remains active through ${new Date(
        subscription.paidThroughDate
      ).toLocaleDateString()}. No future renewals will occur.`,
      data: subscription,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
