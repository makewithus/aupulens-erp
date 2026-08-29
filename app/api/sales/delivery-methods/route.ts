import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import DeliveryMethod from "@/models/sales/DeliveryMethod";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const methods = await DeliveryMethod.find({ tenantId: session.user.tenantId }).sort({ name: 1 }).lean();
    return NextResponse.json({ success: true, data: methods });
  } catch (error: any) {
    console.error("Delivery methods GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Idempotent "find or create" — the Sales Order form's delivery method
// combobox calls this whenever the user types a new value, persisting it.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ success: false, message: "Name is required" }, { status: 400 });
    }

    const method = await DeliveryMethod.findOneAndUpdate(
      { tenantId, name },
      { $setOnInsert: { tenantId, name } },
      { new: true, upsert: true },
    );

    return NextResponse.json({ success: true, data: method }, { status: 201 });
  } catch (error: any) {
    console.error("Delivery methods POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
