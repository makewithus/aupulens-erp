import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ManufacturingOrder from "@/models/ManufacturingOrder";
import { PRODUCTION_STATUS } from "@/lib/constants/statuses";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    await connectDB();

    const orders = await ManufacturingOrder.find({ tenantId })
      .populate(
        "header.productId",
        "header.name tab_general_information.default_code",
      )
      .populate("chatter.authorId", "name image")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ orders });
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
    const tenantId = session.user.tenantId;
    const body = await req.json();

    await connectDB();

    // Generate Name
    if (!body.header.name) {
      const count = await ManufacturingOrder.countDocuments({ tenantId });
      body.header.name = `WH/MO/${String(count + 1).padStart(5, "0")}`;
    }

    // Initialise Plan-to-Produce fields
    if (!body.productionStatus) {
      body.productionStatus = PRODUCTION_STATUS.DEMAND_FORECAST;
    }
    if (!body.reworkCount) {
      body.reworkCount = 0;
    }

    const order = await ManufacturingOrder.create({
      ...body,
      tenantId,
      chatter: [
        { authorId: session.user.id, body: "Created MO", type: "notification" },
      ],
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
