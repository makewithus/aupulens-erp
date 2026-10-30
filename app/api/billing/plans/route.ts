import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { PLAN_KEY_LABELS, PlanKeyType } from "@/lib/constants/statuses";
import { handleRouteError } from "@/lib/api/validateId";
import connectDB from "@/lib/db";
import Plan from "@/models/platform/Plan";
import { PLAN_SEAT_BANDS, type SeatBandPlanKey } from "@/lib/billing/seatBands";

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const plans = await Plan.find({ active: true, availableForPurchase: true, isCustom: false })
      .select("key name description priceMonthly priceYearly meteredUsers includedUsers additionalUserPriceMonthly additionalUserPriceYearly availableForPurchase features isCustom")
      .lean();
    const data = plans.map((plan) => ({
      key: plan.key,
      name: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.displayName || plan.name || PLAN_KEY_LABELS[plan.key as PlanKeyType] || plan.key,
      description: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.description || plan.description,
      note: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.note,
      priceMonthly: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.baseMonthly ?? plan.priceMonthly,
      priceYearly: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.baseYearly ?? plan.priceYearly,
      // Plan definitions are the source of truth for whether customer-facing
      // seat pricing is adjustable. Older catalog rows may contain a stale
      // explicit false value from before metered pricing was introduced.
      meteredUsers: PLAN_DEFINITIONS[plan.key]?.meteredUsers ?? plan.meteredUsers ?? false,
      includedUsers: PLAN_DEFINITIONS[plan.key]?.includedUsers ?? plan.includedUsers ?? plan.features.maxUsers,
      additionalUserPriceMonthly: PLAN_DEFINITIONS[plan.key]?.additionalUserPriceMonthly ?? plan.additionalUserPriceMonthly ?? 0,
      additionalUserPriceYearly: PLAN_DEFINITIONS[plan.key]?.additionalUserPriceYearly ?? plan.additionalUserPriceYearly ?? 0,
      availableForPurchase: Boolean(plan.availableForPurchase),
      currency: "INR",
      features: {
        ...plan.features,
        maxUsers: PLAN_DEFINITIONS[plan.key]?.features.maxUsers ?? plan.features.maxUsers,
        aiCreditsPerSession: plan.features.aiCreditsPerSession ?? PLAN_DEFINITIONS[plan.key]?.features.aiCreditsPerSession ?? 20,
        aiCreditsPerWeek: plan.features.aiCreditsPerWeek ?? PLAN_DEFINITIONS[plan.key]?.features.aiCreditsPerWeek ?? 100,
      },
      isCustom: Boolean(plan.isCustom),
    })).sort((a, b) => a.priceMonthly - b.priceMonthly);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
