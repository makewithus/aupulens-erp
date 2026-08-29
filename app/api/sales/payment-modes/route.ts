import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import PaymentMode from "@/models/sales/PaymentMode";

const SEED_MODES = ["Cash", "Bank Transfer", "Cheque", "Credit Card", "UPI"];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const existing = await PaymentMode.countDocuments({ tenantId });
    if (existing === 0) {
      await PaymentMode.insertMany(SEED_MODES.map((name) => ({ tenantId, name })), { ordered: false }).catch(() => {});
    }

    const modes = await PaymentMode.find({ tenantId }).sort({ name: 1 }).lean();
    return NextResponse.json({ success: true, data: modes });
  } catch (error: any) {
    console.error("Payment modes GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Idempotent "find or create" — the Record Payment form's Payment Mode
// combobox calls this whenever the user types a new value, persisting it
// (mirrors app/api/sales/delivery-methods/route.ts's POST exactly).
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

    const mode = await PaymentMode.findOneAndUpdate(
      { tenantId, name },
      { $setOnInsert: { tenantId, name } },
      { new: true, upsert: true },
    );

    return NextResponse.json({ success: true, data: mode }, { status: 201 });
  } catch (error: any) {
    console.error("Payment modes POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
