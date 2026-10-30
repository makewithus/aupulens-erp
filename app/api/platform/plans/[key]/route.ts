import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Plan from "@/models/platform/Plan";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability, AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY, PlanKeyType } from "@/lib/constants/statuses";
import { getPlanImpactCount, updatePlan, ManagePlanError } from "@/lib/platform/entitlements/managePlan";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { PLAN_SEAT_BANDS, type SeatBandPlanKey } from "@/lib/billing/seatBands";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  if (!(await hasCapability(actor, ADMIN_CAPABILITY.VIEW_PLANS))) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  const { key } = await params;
  await connectDB();
  const plan = await Plan.findOne({ key }).lean();
  if (!plan) {
    return NextResponse.json({ success: false, message: "Plan not found." }, { status: 404 });
  }

  const impact = await getPlanImpactCount(key as PlanKeyType);

  return NextResponse.json({
    success: true,
    data: {
      key: plan.key,
      name: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.displayName ?? plan.name,
      description: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.description ?? plan.description,
      priceMonthly: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.baseMonthly ?? plan.priceMonthly,
      priceYearly: PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]?.baseYearly ?? plan.priceYearly,
      billingCycleOptions: plan.billingCycleOptions,
      isCustom: plan.isCustom,
      basedOnPlanKey: plan.basedOnPlanKey,
      active: plan.active,
      availableForPurchase: plan.availableForPurchase ?? false,
      meteredUsers: PLAN_DEFINITIONS[plan.key]?.meteredUsers ?? plan.meteredUsers ?? false,
      includedUsers: PLAN_DEFINITIONS[plan.key]?.includedUsers ?? plan.includedUsers ?? plan.features.maxUsers,
      additionalUserPriceMonthly: PLAN_DEFINITIONS[plan.key]?.additionalUserPriceMonthly ?? plan.additionalUserPriceMonthly ?? 0,
      additionalUserPriceYearly: PLAN_DEFINITIONS[plan.key]?.additionalUserPriceYearly ?? plan.additionalUserPriceYearly ?? 0,
      features: {
        ...plan.features,
        ...(PLAN_DEFINITIONS[plan.key] ? { maxUsers: PLAN_DEFINITIONS[plan.key].features.maxUsers } : {}),
        aiCreditsPerSession: plan.features.aiCreditsPerSession ?? PLAN_DEFINITIONS[plan.key]?.features.aiCreditsPerSession ?? 20,
        aiCreditsPerWeek: plan.features.aiCreditsPerWeek ?? PLAN_DEFINITIONS[plan.key]?.features.aiCreditsPerWeek ?? 100,
      },
      impact,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const { key } = await params;
  const body = await request.json();

  try {
    await updatePlan(
      actor,
      key as PlanKeyType,
      {
        name: body.name,
        description: body.description,
        priceMonthly: body.priceMonthly,
        priceYearly: body.priceYearly,
        features: body.features,
        active: body.active,
        availableForPurchase: body.availableForPurchase,
        meteredUsers: body.meteredUsers,
        includedUsers: body.includedUsers,
        additionalUserPriceMonthly: body.additionalUserPriceMonthly,
        additionalUserPriceYearly: body.additionalUserPriceYearly,
      },
      body.reason,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    if (err instanceof ManagePlanError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
