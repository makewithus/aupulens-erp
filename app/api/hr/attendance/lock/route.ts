import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Attendance from "@/models/Attendance";

// Lock attendance for a date range (for payroll processing)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json();
    await connectDB();

    const { startDate, endDate } = body;
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Start date and end date are required" },
        { status: 400 },
      );
    }

    const result = await Attendance.updateMany(
      {
        tenantId,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
        isLocked: false,
      },
      {
        $set: {
          isLocked: true,
          lockedBy: session.user.id,
          lockedAt: new Date(),
        },
      },
    );

    return NextResponse.json({
      success: true,
      lockedCount: result.modifiedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
