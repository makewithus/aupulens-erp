import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import "@/models/sales/Customer";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const quote = await (SalesQuotation as any)
      .findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("customerId", "header contact_details")
      .lean();

    if (!quote) return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: quote });
  } catch (error: any) {
    console.error("Sales Quote GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

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

    const update: any = { ...body };
    if (Array.isArray(body.lineItems)) {
      const taxMode = body.taxes?.mode || "none";
      const taxRate = taxMode !== "none" ? Number(body.taxes?.rate) || 0 : 0;
      const totals = computeInvoiceTotals({
        lineItems: body.lineItems,
        itemLevelDiscountPercent: body.itemLevelDiscountPercent || 0,
        extraDiscount: body.extraDiscount || 0,
        extraDiscountMode: body.extraDiscountMode || "amount",
        tdsRate: taxMode === "tds" ? taxRate : 0,
        tcsRate: taxMode === "tcs" ? taxRate : 0,
      });
      const adjustment = Number(body.adjustment) || 0;
      update.taxableAmount = totals.taxableAmount;
      update.totalDiscount = totals.totalDiscount;
      update.totalAmount = totals.totalAmount + adjustment;
      update.taxes = {
        mode: taxMode,
        taxId: body.taxes?.taxId || undefined,
        rate: taxRate,
        amount: taxMode === "tds" ? totals.tdsAmount : totals.tcsAmount,
      };
    }

    const quote = await SalesQuotation.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true });
    if (!quote) return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: quote });
  } catch (error: any) {
    console.error("Sales Quote PATCH error:", error);
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
    const { id } = await params;
    const quote = await SalesQuotation.findOneAndDelete({ _id: id, tenantId: session.user.tenantId });
    if (!quote) return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sales Quote DELETE error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
