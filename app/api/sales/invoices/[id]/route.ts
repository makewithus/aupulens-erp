import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import { SalesInvoice } from "@/models/SalesInvoice";
import Organization from "@/models/Organization";
import "@/models/Customer"; // side-effect import: registers "Customer" for .populate("customerId") below
import "@/models/BankAccount"; // side-effect import: registers "BankAccount" for .populate("bankAccountId") below
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { resolveInvoiceStatus } from "@/lib/sales/invoiceStatus";
import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const invoice = await (SalesInvoice as any)
      .findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("customerId")
      .populate("bankAccountId")
      .lean();

    if (!invoice) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error("Sales Invoice GET error:", error);
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
    delete body.tenantId;
    delete body.number; // Immutable once assigned

    const existing = await (SalesInvoice as any).findOne({ _id: id, tenantId }).lean();
    if (!existing) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    const merged = { ...existing, ...body };
    const isDraft = merged.status === SALES_INVOICE_STATUS.DRAFT;

    if (!isDraft) {
      if (!merged.customerId) {
        return NextResponse.json({ success: false, message: "Customer is required" }, { status: 400 });
      }
      if (!Array.isArray(merged.lineItems) || merged.lineItems.length === 0) {
        return NextResponse.json({ success: false, message: "At least one line item is required" }, { status: 400 });
      }
    }

    const org = await Organization.findOne({ subdomain: tenantId }).lean();
    const sellerState = (org as any)?.settings?.state;

    const totals = computeInvoiceTotals({
      lineItems: merged.lineItems || [],
      itemLevelDiscountPercent: merged.itemLevelDiscountPercent || 0,
      additionalCharges: merged.additionalCharges || [],
      extraDiscount: merged.extraDiscount || 0,
      extraDiscountMode: "amount",
      roundOff: !!merged.roundOff,
      sellerState,
      placeOfSupply: merged.placeOfSupply,
      tdsRate: merged.taxes?.tds || 0,
      tcsRate: merged.taxes?.tcs || 0,
    });

    const status = resolveInvoiceStatus({
      requestedStatus: merged.status || SALES_INVOICE_STATUS.SAVED,
      totalAmount: totals.totalAmount,
      payments: merged.payments || [],
      markedFullyPaid: merged.markedFullyPaid,
      dueDate: merged.dueDate,
    });

    const update = {
      ...body,
      taxableAmount: totals.taxableAmount,
      totalDiscount: totals.totalDiscount,
      totalAmount: totals.totalAmount,
      taxes: {
        tds: merged.taxes?.tds || 0,
        tcs: merged.taxes?.tcs || 0,
        gstBreakup: totals.gstBreakup,
      },
      status,
    };

    const invoice = await (SalesInvoice as any).findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true });

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error("Sales Invoice PATCH error:", error);
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
    const invoice = await (SalesInvoice as any).findOneAndDelete({ _id: id, tenantId: session.user.tenantId });

    if (!invoice) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Invoice deleted" });
  } catch (error: any) {
    console.error("Sales Invoice DELETE error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
