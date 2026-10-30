import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import Organization from "@/models/admin/Organization";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import { calculateProration, DEFAULT_SELLER_STATE } from "@/lib/billing/proration";
import Plan from "@/models/platform/Plan";
import { PlanKeyType } from "@/lib/constants/statuses";
import { handleRouteError } from "@/lib/api/validateId";
import { priceWithAddOns } from "@/lib/billing/planPricing";

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
    const userCount = Number(body.userCount);

    if (typeof targetPlanKey !== "string") {
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
    const targetDef = await Plan.findOne({ key: targetPlanKey, active: true, availableForPurchase: true }).lean();
    if (!targetDef) return NextResponse.json({ success: false, error: "Target plan is unavailable." }, { status: 404 });
    const addOns = Array.isArray(body.addOns) ? body.addOns.filter((key: unknown) => typeof key === "string") : [];
    const { price: targetPrice, userCount: pricedUserCount, selectedAddOns } = priceWithAddOns({ ...targetDef, key: targetDef.key }, billingCycle, userCount, addOns);

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
        userCount: pricedUserCount,
        addOns: selectedAddOns,
        effectiveDate: new Date(),
        nextRenewalDate: subscription.nextRenewalDate,
        proration,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
