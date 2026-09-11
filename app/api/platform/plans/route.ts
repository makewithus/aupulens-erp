import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Plan from "@/models/platform/Plan";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY } from "@/lib/constants/statuses";

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
      name: p.name,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      isCustom: p.isCustom,
      features: p.features,
      active: p.active,
    })),
  });
}
