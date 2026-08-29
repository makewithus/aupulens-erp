import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import PerformanceReview from "@/models/hr/PerformanceReview";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    await connectDB();
    const reviews = await PerformanceReview.find({ tenantId }).sort({ updatedAt: -1 }).lean();
    return NextResponse.json({ reviews });
  } catch (error) {
    console.error("Error fetching performance reviews:", error);
    return NextResponse.json({ error: "Failed to fetch performance reviews" }, { status: 500 });
  }
}

// Upsert by (employeeId, reviewPeriod) — this IS the "Add Review" / "Update
// Review" action for that employee's period, matching the page's toggle.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const userId = (session.user as any).id;

    const body = await req.json();
    if (!body.employeeId || !body.reviewPeriod) {
      return NextResponse.json({ error: "employeeId and reviewPeriod are required" }, { status: 400 });
    }

    await connectDB();
    const review = await PerformanceReview.findOneAndUpdate(
      { tenantId, employeeId: body.employeeId, reviewPeriod: body.reviewPeriod },
      {
        $set: {
          employeeName: body.employeeName || "",
          rating: Number(body.rating) || 3,
          goals: body.goals || "",
          achievements: body.achievements || "",
          areasOfImprovement: body.areasOfImprovement || "",
          managerComments: body.managerComments || "",
          reviewedBy: userId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return NextResponse.json({ review }, { status: 201 });
  } catch (error: any) {
    console.error("Error saving performance review:", error);
    return NextResponse.json({ error: error.message || "Failed to save performance review" }, { status: 500 });
  }
}
