import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import PaymentGateway from "@/models/PaymentGateway";
import { getPaymentGatewayService } from "@/lib/sales/paymentGatewayService";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;
    const body = await request.json();
    const { action, credentials } = body;

    const gateway = await PaymentGateway.findOne({ _id: id, tenantId });
    if (!gateway) {
      return NextResponse.json({ success: false, message: "Gateway not found" }, { status: 404 });
    }

    const service = getPaymentGatewayService();

    if (action === "connect") {
      const result = await service.connect(tenantId, gateway.provider, credentials || {});
      if (!result.ok) {
        return NextResponse.json({ success: false, message: result.error || "Failed to connect" }, { status: 400 });
      }
      gateway.status = result.status || "connected";
      gateway.credentials = credentials || {};
      gateway.connectedAt = new Date();
      await gateway.save();
      return NextResponse.json({ success: true, data: gateway });
    }

    if (action === "disconnect") {
      const result = await service.disconnect(tenantId, gateway.provider);
      if (!result.ok) {
        return NextResponse.json({ success: false, message: result.error || "Failed to disconnect" }, { status: 400 });
      }
      gateway.status = result.status || "disconnected";
      gateway.credentials = undefined;
      gateway.connectedAt = undefined;
      await gateway.save();
      return NextResponse.json({ success: true, data: gateway });
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Online payment gateway PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;

    const gateway = await PaymentGateway.findOne({ _id: id, tenantId });
    if (!gateway) {
      return NextResponse.json({ success: false, message: "Gateway not found" }, { status: 404 });
    }
    if (gateway.isDefault) {
      return NextResponse.json(
        { success: false, message: "Default gateways cannot be deleted" },
        { status: 400 },
      );
    }

    await PaymentGateway.deleteOne({ _id: id, tenantId });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Online payment gateway DELETE error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
