import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import SaaSSubscription from "@/models/billing/SaaSSubscription";
import Organization from "@/models/admin/Organization";
import { verifyGlobalAdmin } from "@/lib/billing/adminAuth";

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyGlobalAdmin(req);
    if (!authResult.isAuthorized) {
      return NextResponse.json(
        { success: false, error: authResult.message },
        { status: authResult.errorStatus || 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const plan = searchParams.get("plan");

    const query: any = {};
    if (status) query.status = status;
    if (plan) query.planKey = plan;
    if (search) {
      query.$or = [
        { tenantId: { $regex: search, $options: "i" } },
      ];
    }

    const subscriptions = await SaaSSubscription.find(query)
      .sort({ updatedAt: -1 })
      .lean();

    const enriched = await Promise.all(
      subscriptions.map(async (s) => {
        const org = await Organization.findOne({ subdomain: s.tenantId })
          .select("name tier createdAt")
          .lean();
        return {
          ...s,
          organizationName: org?.name || s.tenantId,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enriched,
    });
  } catch (error: any) {
    console.error("Platform subscriptions error:", error);
    return NextResponse.json(
      { success: false, error: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}
