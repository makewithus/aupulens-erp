import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { PLAN_KEY_LABELS, PlanKeyType } from "@/lib/constants/statuses";
import { handleRouteError } from "@/lib/api/validateId";

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const plans = Object.entries(PLAN_DEFINITIONS).map(([key, def]) => ({
      key,
      name: PLAN_KEY_LABELS[key as PlanKeyType] || key,
      priceMonthly: def.priceMonthly,
      priceYearly: def.priceYearly,
      currency: "INR",
      features: def.features,
      isCustom: Boolean(def.isCustom),
    }));

    return NextResponse.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
