import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import StockTransfer from "@/models/StockTransfer";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = session.user.tenantId || "default-tenant";
    await connectDB();

    // A return is identified by having a source document reference (e.g. WH/IN/...)
    // and usually an opposite operation type. For now, we filter by name starting with RET or having sourceDocument.
    const query: any = {
      tenantId,
      $or: [
        { "header.name": { $regex: /RET/i } },
        { "header.sourceDocument": { $exists: true, $ne: "" } },
      ],
    };

    const items = await StockTransfer.find(query)
      .populate("header.partnerId", "header.name contact_details.email")
      .populate(
        "operations_tab.productId",
        "header.name tab_general_information.default_code",
      )
      .sort({ createdAt: -1 })
      .lean();

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

    const tenantId = session.user.tenantId || "default-tenant";
    const body = await req.json();

    await connectDB();

    // Auto-generate return name (WH/RET/00001)
    if (!body.header.name) {
      const prefix = "WH/RET/";
      const count = await StockTransfer.countDocuments({
        tenantId,
        "header.name": { $regex: /^WH\/RET\// },
      });
      body.header.name = `${prefix}${String(count + 1).padStart(5, "0")}`;
    }

    const transfer = await StockTransfer.create({
      ...body,
      tenantId,
      chatter: [
        {
          authorId: session.user.id,
          body: "Created Return Document",
          type: "notification",
        },
      ],
    });

    return NextResponse.json({ item: transfer }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
