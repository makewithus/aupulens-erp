import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import PurchaseOrder from "@/models/PurchaseOrder";
import "@/models/Product";
import "@/models/Customer";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const partnerId = searchParams.get("partnerId");

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";

    let query: any = { tenantId };

    if (status) {
      const statuses = status.split(",");
      query.status = { $in: statuses };
    }

    if (partnerId) {
      query.partnerId = partnerId;
    }

    const pageParam = searchParams.get("page");
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const baseQuery = PurchaseOrder.find(query)
      .populate("partnerId", "header.name contact_details.email")
      .populate("orderLines.productId", "header.name")
      .sort({ createdAt: -1 });

    if (pageParam) {
      // Paginated mode: only when caller explicitly passes ?page= — matches
      // the backward-compat convention used elsewhere (e.g. hr/employees).
      const page = Math.max(1, parseInt(pageParam));
      const skip = (page - 1) * limit;
      const [total, orders] = await Promise.all([
        PurchaseOrder.countDocuments(query),
        baseQuery.skip(skip).limit(limit).lean(),
      ]);
      return NextResponse.json({ items: orders, total, page, totalPages: Math.ceil(total / limit) });
    }

    // No ?page= → return all (backward-compat for the new Purchase Order UI
    // and any other existing consumer, e.g. the Inventory receiving popup).
    const orders = await baseQuery.lean();
    return NextResponse.json({ items: orders, total: orders.length, page: 1, totalPages: 1 });
  } catch (error: any) {
    console.error("Error fetching purchase orders:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
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

    if (!body.partnerId) {
      return NextResponse.json(
        { error: "Partner/Vendor (partnerId) is required" },
        { status: 400 },
      );
    }

    // Auto-generate name logic (e.g. PO/2026/0001) if not provided
    let name = body.name;
    if (!name) {
      const date = new Date();
      const year = date.getFullYear().toString();
      const count = await PurchaseOrder.countDocuments({
        tenantId,
        createdAt: {
          $gte: new Date(date.getFullYear(), 0, 1),
        },
      });
      const sequence = (count + 1).toString().padStart(4, "0");
      name = `PO/${year}/${sequence}`;
    }

    // Calculate totals if not provided or to ensure accuracy
    const orderLines = body.orderLines || [];
    const amountUntaxed = orderLines.reduce((sum: number, line: any) => {
      const lineQty = Number(line.productQty) || 0;
      const linePrice = Number(line.priceUnit) || 0;
      const lineSubtotal = Number((lineQty * linePrice).toFixed(2));
      line.priceSubtotal = lineSubtotal;
      return sum + lineSubtotal;
    }, 0);

    const amountTax = Number((amountUntaxed * 0.18).toFixed(2)); // Default 18% tax
    const amountTotal = Number((amountUntaxed + amountTax).toFixed(2));

    const order = await PurchaseOrder.create({
      ...body,
      name,
      tenantId,
      orderLines,
      totals: {
        amountUntaxed,
        amountTax,
        amountTotal,
      },
      createdBy: session.user.id,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating purchase order:", error);
    if (error.code === 11000) {
      return NextResponse.json(
        { error: "Purchase Order name already exists in this tenant" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
