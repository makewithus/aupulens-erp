import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SalesOrder from "@/models/SalesOrder";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export async function GET() {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";

    await connectDB();
    const items = await SalesOrder.find({
      tenantId,
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log(items);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching sales orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";

    await connectDB();
    const body = await request.json();

    // Validate required fields
    if (
      !body.orderNumber ||
      !body.customer ||
      !body.items ||
      body.items.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const order = await SalesOrder.create({
      orderNumber: body.orderNumber,
      customer: body.customer,
      customerEmail: body.customerEmail,
      items: body.items,
      subtotal: body.subtotal,
      taxRate: body.taxRate,
      taxAmount: body.taxAmount,
      total: body.total,
      status: body.status || DOCUMENT_STATUS.DRAFT,
      shippingAddress: body.shippingAddress,
      notes: body.notes,
      tenantId,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("Error creating sales order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
