import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Payment from "@/models/Payment";
import SalesView from "@/models/SalesView";
import { generatePaymentNumber } from "@/lib/sales/paymentNumbering";
import { validateAllocations, applyAllocationsToInvoices } from "@/lib/sales/paymentAllocation";
import { buildMongoFilterFromCriteria } from "@/lib/sales/paymentViews";
import { resolveSpecialFilter } from "@/lib/sales/paymentViews.server";
import { PAYMENT_STATUS, PAYMENT_TYPE, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import "@/models/Customer";
import { SalesInvoice } from "@/models/SalesInvoice";
import "@/models/Account";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const skip = (page - 1) * limit;
    const sortField = searchParams.get("sortField") || "paymentDate";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;
    const viewId = searchParams.get("viewId");
    const search = searchParams.get("search")?.trim();

    let query: Record<string, any> = { tenantId };

    if (viewId) {
      const view = await SalesView.findOne({ _id: viewId, tenantId, entityType: "payments" }).lean();
      if (view) {
        query = (view as any).specialFilter
          ? { ...query, ...(await resolveSpecialFilter((view as any).specialFilter)) }
          : { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
      }
    }

    if (search) {
      query.$or = [
        { paymentNumber: { $regex: search, $options: "i" } },
        { reference: { $regex: search, $options: "i" } },
      ];
    }

    const [total, payments] = await Promise.all([
      Payment.countDocuments(query),
      (Payment as any)
        .find(query)
        .populate("customerId", "header contact_details")
        .populate("allocations.invoiceId", "number")
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({ success: true, data: payments, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error("Payments GET error:", error);
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
    const amountReceived = Number(body.amountReceived);
    if (!amountReceived || amountReceived <= 0) {
      return NextResponse.json({ success: false, message: "Amount received must be greater than 0" }, { status: 400 });
    }
    if (!body.depositToAccountId) {
      return NextResponse.json({ success: false, message: "Deposit To account is required" }, { status: 400 });
    }

    const bankCharges = Number(body.bankCharges) || 0;
    const tdsAmount = body.taxDeducted ? Number(body.tdsAmount) || 0 : 0;
    const allocations: { invoiceId: string; amount: number }[] = (body.allocations || []).filter(
      (a: any) => a.invoiceId && Number(a.amount) > 0,
    );

    let unusedAmount: number;
    try {
      unusedAmount = validateAllocations(allocations, amountReceived, bankCharges, tdsAmount);
    } catch (e: any) {
      return NextResponse.json({ success: false, message: e.message }, { status: 400 });
    }

    if (allocations.length) {
      // Draft/cancelled invoices are excluded from the real Record Payment
      // form's invoice picker (it queries status=saved) — reject them here
      // too so a direct API call can't silently create a "paid" payment
      // that has no visible effect, since resolveInvoiceStatus deliberately
      // never auto-transitions a draft/cancelled invoice off that status.
      const invoiceIds = allocations.map((a) => a.invoiceId);
      const targetInvoices = await (SalesInvoice as any)
        .find({ _id: { $in: invoiceIds }, tenantId })
        .select("_id number status")
        .lean();
      const blocked = targetInvoices.find(
        (inv: any) => inv.status === SALES_INVOICE_STATUS.DRAFT || inv.status === SALES_INVOICE_STATUS.CANCELLED,
      );
      if (blocked) {
        return NextResponse.json(
          { success: false, message: `Invoice ${blocked.number} is ${blocked.status} and cannot receive a payment.` },
          { status: 400 },
        );
      }
    }

    let paymentNumber = body.paymentNumber;
    if (!paymentNumber) {
      const generated = await generatePaymentNumber(tenantId, body.prefix);
      paymentNumber = generated.number;
    }

    const status = body.status === PAYMENT_STATUS.PAID ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.DRAFT;

    const payment = await Payment.create({
      tenantId,
      customerId: body.customerId,
      paymentNumber,
      paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
      amountReceived,
      bankCharges,
      mode: body.mode || "Cash",
      depositToAccountId: body.depositToAccountId,
      reference: body.reference,
      taxDeducted: !!body.taxDeducted,
      tdsAccountId: body.taxDeducted ? body.tdsAccountId : undefined,
      tdsAmount,
      allocations,
      unusedAmount,
      status,
      paymentType: PAYMENT_TYPE.INVOICE_PAYMENT,
      notes: body.notes,
      customFieldValues: body.customFieldValues || {},
      createdBy: session.user.id,
    });

    if (status === PAYMENT_STATUS.PAID && allocations.length) {
      await applyAllocationsToInvoices({
        tenantId,
        paymentId: String(payment._id),
        paymentNumber,
        paymentDate: payment.paymentDate,
        mode: payment.mode,
        allocations,
      });
    }

    return NextResponse.json({ success: true, data: payment }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "That payment number is already in use. Please choose another." },
        { status: 409 },
      );
    }
    console.error("Payments POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
