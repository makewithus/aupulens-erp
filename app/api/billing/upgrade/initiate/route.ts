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
    const billingCycle = (body.billingCycle || "monthly") as "monthly" | "yearly";

    if (!targetPlanKey || !PLAN_DEFINITIONS[targetPlanKey]) {
      return NextResponse.json(
        { success: false, error: "Valid targetPlanKey is required." },
        { status: 400 }
      );
    }

    const result = await subscriptionManager.prepareUpgrade({
      tenantId,
      targetPlanKey,
      billingCycle,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
