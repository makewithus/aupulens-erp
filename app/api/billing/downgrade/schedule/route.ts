import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { requireBillingOperator } from "@/lib/billing/authz";
import { PlanKeyType } from "@/lib/constants/statuses";
import Plan from "@/models/platform/Plan";
import connectDB from "@/lib/db";
import { handleRouteError } from "@/lib/api/validateId";

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
    const targetPlanKey = body.targetPlanKey as PlanKeyType;
    const reason = body.reason as string | undefined;
    const userCount = Number(body.userCount);
    const addOns = Array.isArray(body.addOns) ? body.addOns.filter((key: unknown): key is string => typeof key === "string") : [];
    const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";

    if (typeof targetPlanKey !== "string") {
      return NextResponse.json(
        { success: false, error: "Valid targetPlanKey is required." },
        { status: 400 }
      );
    }
    await connectDB();
    const targetPlan = await Plan.findOne({ key: targetPlanKey, active: true, availableForPurchase: true }).select("_id").lean();
    if (!targetPlan) return NextResponse.json({ success: false, error: "Target plan is unavailable." }, { status: 404 });

    const subscription = await subscriptionManager.scheduleDowngrade({
      tenantId,
      targetPlanKey,
      userCount,
      addOns,
      billingCycle,
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
