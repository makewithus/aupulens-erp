import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Plan from "@/models/platform/Plan";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability, AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY, PlanKeyType } from "@/lib/constants/statuses";
import { getPlanImpactCount, updatePlan, ManagePlanError } from "@/lib/platform/entitlements/managePlan";

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
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      billingCycleOptions: plan.billingCycleOptions,
      isCustom: plan.isCustom,
      basedOnPlanKey: plan.basedOnPlanKey,
      active: plan.active,
      features: plan.features,
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
