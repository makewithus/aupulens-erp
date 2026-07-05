import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import PaymentGateway from "@/models/PaymentGateway";
import { PAYMENT_GATEWAY_STATUS } from "@/lib/constants/statuses";

// Default gateway catalog for spec §7.3 item 5. Lazily seeded on first read,
// mirroring ensureSystemViews in app/api/sales/sales-order-views/route.ts.
const DEFAULT_GATEWAYS: { name: string; provider: string }[] = [
  { name: "Razorpay", provider: "razorpay" },
  { name: "PayPal", provider: "paypal" },
  { name: "Stripe", provider: "stripe" },
  { name: "Bank Transfer", provider: "bank_transfer" },
  { name: "Manual/Offline", provider: "manual" },
];

async function ensureDefaultGateways(tenantId: string) {
  const existing = await PaymentGateway.countDocuments({ tenantId, isDefault: true });
  if (existing > 0) return;
  await PaymentGateway.insertMany(
    DEFAULT_GATEWAYS.map((g) => ({
      tenantId,
      name: g.name,
      provider: g.provider,
      status: PAYMENT_GATEWAY_STATUS.DISCONNECTED,
      isDefault: true,
    })),
  );
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    await ensureDefaultGateways(tenantId);

    const gateways = await PaymentGateway.find({ tenantId }).sort({ isDefault: -1, createdAt: 1 }).lean();

    return NextResponse.json({ success: true, data: gateways });
  } catch (error: any) {
    console.error("Online payment gateways GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();

    if (!body.name?.trim() || !body.provider?.trim()) {
      return NextResponse.json(
        { success: false, message: "Name and provider are required" },
        { status: 400 },
      );
    }

    const gateway = await PaymentGateway.create({
      tenantId,
      name: body.name.trim(),
      provider: body.provider.trim().toLowerCase().replace(/\s+/g, "_"),
      status: PAYMENT_GATEWAY_STATUS.DISCONNECTED,
      isDefault: false,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: gateway }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "A gateway with this provider already exists" },
        { status: 409 },
      );
    }
    console.error("Online payment gateways POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
