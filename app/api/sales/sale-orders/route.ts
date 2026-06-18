export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/SaleOrder";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const q2cStatus = searchParams.get("q2cStatus");
    const partnerId = searchParams.get("partnerId");

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";

    let query: any = { tenantId };

    if (status) {
      const statuses = status.split(",");
      query.status = { $in: statuses };
    }

    if (q2cStatus) {
      const q2cStatuses = q2cStatus.split(",");
      query.q2cStatus = { $in: q2cStatuses };
    }

    if (partnerId) {
      query["header.partnerId"] = partnerId;
    }

    const orders = await SaleOrder.find(query)
      .populate("header.partnerId", "header.name")
      .populate("orderLines.productId", "header.name")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ items: orders });
  } catch (error) {
    console.error("Error fetching sale orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const body = await request.json();

    if (!body.header?.name || !body.header?.partnerId) {
      return NextResponse.json(
        { error: "Order name and partner are required" },
        { status: 400 },
      );
    }

    const order = await SaleOrder.create({
      ...body,
      tenantId,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("Error creating sale order:", error);
    if ((error as any).code === 11000) {
      return NextResponse.json(
        { error: "Order name already exists in this tenant" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
