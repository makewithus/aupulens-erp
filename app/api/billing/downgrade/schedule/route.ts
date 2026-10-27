import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { PlanKeyType } from "@/lib/constants/statuses";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { handleRouteError } from "@/lib/api/validateId";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const body = await req.json().catch(() => ({}));
    const targetPlanKey = body.targetPlanKey as PlanKeyType;
    const reason = body.reason as string | undefined;

    if (!targetPlanKey || !PLAN_DEFINITIONS[targetPlanKey]) {
      return NextResponse.json(
        { success: false, error: "Valid targetPlanKey is required." },
        { status: 400 }
      );
    }

    const subscription = await subscriptionManager.scheduleDowngrade({
      tenantId,
      targetPlanKey,
      reason,
    });

    return NextResponse.json({
      success: true,
      message: `Downgrade to ${targetPlanKey} scheduled for ${new Date(
        subscription.scheduledChange!.effectiveDate
      ).toLocaleDateString()}. Your current features remain active until then.`,
      data: subscription,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const subscription = await subscriptionManager.cancelScheduledDowngrade(tenantId);

    return NextResponse.json({
      success: true,
      message: "Scheduled downgrade has been cancelled. Your current plan renewal is restored.",
      data: subscription,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
