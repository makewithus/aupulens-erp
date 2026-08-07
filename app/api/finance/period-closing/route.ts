import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import PeriodClosing from "@/models/PeriodClosing";
import { PERIOD_CLOSING_STATUS } from "@/lib/constants/statuses";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const items = await PeriodClosing.find({ tenantId })
          .sort({ fiscalYear: -1, month: -1 })
          .populate("lockedBy", "name email")
          .populate("closedBy", "name email").lean();

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const userId = (session.user as any).id;
    const body = await req.json();

    if (!body.fiscalYear || !body.month) {
      return NextResponse.json(
        { error: "fiscalYear and month are required" },
        { status: 400 },
      );
    }

    await dbConnect();

    // Prevent duplicate period
    const existing = await PeriodClosing.findOne({
      fiscalYear: body.fiscalYear,
      month: body.month,
      tenantId,
    });
    if (existing) {
      return NextResponse.json(
        { error: "Period already exists for this month/year" },
        { status: 409 },
      );
    }

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const name =
      body.name ||
      `${monthNames[body.month - 1]} ${body.fiscalYear}`;

    const quarter = Math.ceil(body.month / 3);

    const period = new PeriodClosing({
      name,
      fiscalYear: body.fiscalYear,
      month: body.month,
      quarter,
      status: PERIOD_CLOSING_STATUS.OPEN,
      tenantId,
      createdBy: userId,
    });

    await period.save();
    return NextResponse.json(period);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
