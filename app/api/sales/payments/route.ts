import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { SalesInvoice } from "@/models/SalesInvoice";
import { resolveInvoiceStatus } from "@/lib/sales/invoiceStatus";
import "@/models/Customer"; // side-effect import: registers "Customer" for .populate("customerId") below

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toLowerCase();
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);

    const invoices = await (SalesInvoice as any)
      .find({ tenantId, "payments.0": { $exists: true } })
      .populate("customerId", "header contact_details")
      .select("number customerId payments totalAmount")
      .sort({ createdAt: -1 })
      .lean();

    const rows = invoices.flatMap((inv: any) =>
      (inv.payments || []).map((p: any, idx: number) => ({
        id: `${inv._id}:${idx}`,
        invoiceId: inv._id,
        invoiceNumber: inv.number,
        customerName: inv.customerId?.header?.name || inv.customerId?.contact_details?.email || "—",
        amount: p.amount,
        date: p.date,
        mode: p.mode,
        notes: p.notes,
      })),
    );

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const filtered = search
      ? rows.filter((r) => `${r.invoiceNumber} ${r.customerName} ${r.mode}`.toLowerCase().includes(search))
      : rows;

    const total = filtered.length;
    const skip = (page - 1) * limit;

    return NextResponse.json({
      success: true,
      data: filtered.slice(skip, skip + limit),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Sales Payments GET error:", error);
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
    const { invoiceId, amount, date, mode, notes } = body;

    if (!invoiceId || !amount || !mode) {
      return NextResponse.json(
        { success: false, message: "invoiceId, amount and mode are required" },
        { status: 400 },
      );
    }

    const invoice = await (SalesInvoice as any).findOne({ _id: invoiceId, tenantId });
    if (!invoice) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    invoice.payments.push({ amount: Number(amount), date: date ? new Date(date) : new Date(), mode, notes });
    invoice.status = resolveInvoiceStatus({
      requestedStatus: invoice.status,
      totalAmount: invoice.totalAmount,
      payments: invoice.payments,
      markedFullyPaid: invoice.markedFullyPaid,
      dueDate: invoice.dueDate,
    });
    await invoice.save();

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) {
    console.error("Sales Payments POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
