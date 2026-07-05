import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Subscription from "@/models/Subscription";
import { SALES_SUBSCRIPTION_STATUS, SALES_SUBSCRIPTION_STATUS_VALUES } from "@/lib/constants/statuses";
import "@/models/Customer";
import "@/models/SalesInvoice";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const subscription = await (Subscription as any)
      .findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("customerId", "header contact_details")
      .populate("generatedInvoiceIds", "number status totalAmount invoiceDate")
      .lean();

    if (!subscription) {
      return NextResponse.json({ success: false, message: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: subscription });
  } catch (error: any) {
    console.error("Subscription GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Handles the small set of real lifecycle transitions (cancel / reactivate /
// toggle auto-renew) — the dunning engine (Phase 2 Part 4.7) and billing cron
// also PATCH through this route for status + billing-date updates.
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

    const update: Record<string, any> = {};
    if (body.status !== undefined) {
      if (!SALES_SUBSCRIPTION_STATUS_VALUES.includes(body.status)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      update.status = body.status;
      if (body.status === SALES_SUBSCRIPTION_STATUS.CANCELLED) {
        update.cancelledAt = new Date();
      }
    }
    if (body.autoRenew !== undefined) update.autoRenew = !!body.autoRenew;
    if (body.unbilledCharges !== undefined) update.unbilledCharges = Number(body.unbilledCharges) || 0;
    if (body.nextBillingOn !== undefined) update.nextBillingOn = new Date(body.nextBillingOn);
    if (body.lastBilledOn !== undefined) update.lastBilledOn = new Date(body.lastBilledOn);

    const subscription = await Subscription.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true });
    if (!subscription) {
      return NextResponse.json({ success: false, message: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: subscription });
  } catch (error: any) {
    console.error("Subscription PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
