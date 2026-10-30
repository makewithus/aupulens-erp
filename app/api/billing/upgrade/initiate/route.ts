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
    const billingCycle = (body.billingCycle || "monthly") as "monthly" | "yearly";
    const userCount = Number(body.userCount);
    const addOns = Array.isArray(body.addOns) ? body.addOns.filter((key: unknown) => typeof key === "string") : [];

    if (typeof targetPlanKey !== "string") {
      return NextResponse.json(
        { success: false, error: "Valid targetPlanKey is required." },
        { status: 400 }
      );
    }
    await connectDB();
    const targetPlan = await Plan.findOne({ key: targetPlanKey, active: true, availableForPurchase: true }).select("_id").lean();
    if (!targetPlan) return NextResponse.json({ success: false, error: "Target plan is unavailable." }, { status: 404 });
    if (billingCycle !== "monthly" && billingCycle !== "yearly") {
      return NextResponse.json(
        { success: false, error: "billingCycle must be monthly or yearly." },
        { status: 400 }
      );
    }

    const result = await subscriptionManager.prepareUpgrade({
      tenantId,
      targetPlanKey,
      billingCycle,
      userCount,
      addOns,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
