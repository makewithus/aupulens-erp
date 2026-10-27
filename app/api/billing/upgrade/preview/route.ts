import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import Organization from "@/models/admin/Organization";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { calculateProration, DEFAULT_SELLER_STATE } from "@/lib/billing/proration";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { PlanKeyType } from "@/lib/constants/statuses";
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

    if (typeof targetPlanKey !== "string" || !Object.hasOwn(PLAN_DEFINITIONS, targetPlanKey)) {
      return NextResponse.json(
        { success: false, error: "Valid targetPlanKey is required." },
        { status: 400 }
      );
    }
    if (billingCycle !== "monthly" && billingCycle !== "yearly") {
      return NextResponse.json(
        { success: false, error: "billingCycle must be monthly or yearly." },
        { status: 400 }
      );
    }

    const subscription = await subscriptionManager.getOrCreateSubscription(tenantId);
    const org = await Organization.findOne({ subdomain: tenantId });
    const targetDef = PLAN_DEFINITIONS[targetPlanKey];
    const targetPrice = billingCycle === "yearly" ? targetDef.priceYearly : targetDef.priceMonthly;

    const proration = calculateProration({
      currentPlanPrice: subscription.currentPrice,
      targetPlanPrice: targetPrice,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      sellerState: DEFAULT_SELLER_STATE,
      customerState: org?.settings?.state || DEFAULT_SELLER_STATE,
    });

    return NextResponse.json({
      success: true,
      data: {
        currentPlan: subscription.planKey,
        targetPlan: targetPlanKey,
        billingCycle,
        currentPrice: subscription.currentPrice,
        targetPrice,
        effectiveDate: new Date(),
        nextRenewalDate: subscription.nextRenewalDate,
        proration,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
