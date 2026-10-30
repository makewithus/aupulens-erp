import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Plan from "@/models/platform/Plan";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY } from "@/lib/constants/statuses";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { PLAN_SEAT_BANDS, type SeatBandPlanKey } from "@/lib/billing/seatBands";

export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  if (!(await hasCapability(actor, ADMIN_CAPABILITY.VIEW_PLANS))) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  await connectDB();
  const plans = await Plan.find({}).sort({ priceMonthly: 1 }).lean();
  return NextResponse.json({
    success: true,
    data: plans.map((p) => ({
      key: p.key,
      name: PLAN_SEAT_BANDS[p.key as SeatBandPlanKey]?.displayName ?? p.name,
      description: PLAN_SEAT_BANDS[p.key as SeatBandPlanKey]?.description ?? p.description,
      priceMonthly: PLAN_SEAT_BANDS[p.key as SeatBandPlanKey]?.baseMonthly ?? p.priceMonthly,
      priceYearly: PLAN_SEAT_BANDS[p.key as SeatBandPlanKey]?.baseYearly ?? p.priceYearly,
      isCustom: p.isCustom,
      features: {
        ...p.features,
        ...(p.key === "starter" ? { maxUsers: 5 } : {}),
        aiCreditsPerSession: p.features.aiCreditsPerSession ?? PLAN_DEFINITIONS[p.key]?.features.aiCreditsPerSession ?? 20,
        aiCreditsPerWeek: p.features.aiCreditsPerWeek ?? PLAN_DEFINITIONS[p.key]?.features.aiCreditsPerWeek ?? 100,
      },
      active: p.active,
      availableForPurchase: p.availableForPurchase ?? false,
    })),
  });
}
