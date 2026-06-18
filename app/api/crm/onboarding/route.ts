import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOnboardingPlan from "@/models/crm/OnboardingPlan";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const plans = await CrmOnboardingPlan.find({ tenantId: session.user.tenantId })
    .populate("account_id", "company_name")
    .populate("owner_id", "name")
    .lean();

  return NextResponse.json({ success: true, data: plans });
}
