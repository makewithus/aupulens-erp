import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import Coupon from "@/models/Coupon";

// Thin, read-only proxy onto the shared Coupon model (owned by
// Manufacturing > Items > Coupons) so the Sales invoice "Use Coupons"
// feature can list active coupons without requiring Manufacturing module
// access via middleware path-based module gating.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const now = new Date();
    const coupons = await Coupon.find({
      tenantId: session.user.tenantId,
      $or: [{ neverExpires: true }, { validTill: { $gte: now } }, { validTill: { $exists: false } }],
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: coupons });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
