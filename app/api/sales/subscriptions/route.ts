import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Subscription from "@/models/Subscription";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import "@/models/Customer";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const subscriptions = await (Subscription as any)
      .find({ tenantId: session.user.tenantId })
      .populate("customerId", "header contact_details")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: subscriptions });
  } catch (error: any) {
    console.error("Subscriptions GET error:", error);
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

    if (!body.customerId) {
      return NextResponse.json({ success: false, message: "Customer is required" }, { status: 400 });
    }
    if (!body.profileName?.trim()) {
      return NextResponse.json({ success: false, message: "Profile Name is required" }, { status: 400 });
    }
    if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
      return NextResponse.json({ success: false, message: "At least one line item is required" }, { status: 400 });
    }

    const totals = computeInvoiceTotals({ lineItems: body.lineItems });

    const subscription = await Subscription.create({
      ...body,
      tenantId,
      profileName: body.profileName.trim(),
      lineItems: totals.computedLines,
      totalAmount: totals.totalAmount,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: subscription }, { status: 201 });
  } catch (error: any) {
    console.error("Subscriptions POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
