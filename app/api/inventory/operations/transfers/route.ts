import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import StockTransfer from "@/models/StockTransfer";
import Customer from "@/models/Customer"; // Ensure model registration
import Product from "@/models/Product"; // Ensure model registration

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // 'incoming' or 'outgoing'

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    await connectDB();

    const query: any = { tenantId };
    if (type) {
      query["header.operationType"] = type;
    }

    const transfers = await StockTransfer.find(query)
      .populate("header.partnerId", "header.name contact_details.email")
      .populate(
        "operations_tab.productId",
        "header.name tab_general_information.default_code",
      )
      .populate("chatter.authorId", "name image")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ transfers });
  } catch (error: any) {
    console.error("Fetch Transfers Error:", error);
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

    // Auto-generate name if not provided (Simplistic)
    if (!body.header.name) {
      const prefix =
        body.header.operationType === "incoming" ? "WH/IN/" : "WH/OUT/";
      const count = await StockTransfer.countDocuments({
        "header.operationType": body.header.operationType,
      });
      body.header.name = `${prefix}${String(count + 1).padStart(5, "0")}`;
    }

    const transfer = await StockTransfer.create({
      ...body,
      tenantId,
      chatter: [
        {
          authorId: session.user.id,
          body: "Created " + body.header.operationType,
          type: "notification",
        },
      ],
    });

    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error: any) {
    console.error("Create Transfer Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
