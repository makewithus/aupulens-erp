export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";
import { DOCUMENT_STATUS, PAYMENT_STATE } from "@/lib/constants/statuses";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";

    const invoices = await Invoice.find({ tenantId })
      .populate("partnerId")
      .sort({ createdAt: -1 })  
      .lean();

    return NextResponse.json({ items: invoices });
  } catch (error: any) {
    console.error("Error fetching invoices:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.partnerId) {
      return NextResponse.json(
        { error: "Customer (partnerId) is required" },
        { status: 400 },
      );
    }

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";

    // Generate Name if Draft (or logic?)
    // Default name is "Draft" in schema.

    const newInvoice = new Invoice({
      ...body,
      tenantId,
      createdBy: session.user.id,
      name: body.name || "Draft",
      state: body.state || DOCUMENT_STATUS.DRAFT,
      amountResidual:
        body.amountResidual !== undefined
          ? Number(body.amountResidual)
          : Number(body.amountTotal) || 0,
      paymentState: body.paymentState || PAYMENT_STATE.NOT_PAID,
    });

    await newInvoice.save();

    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error: any) {
    console.error("Error creating invoice:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
