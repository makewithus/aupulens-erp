import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import { logActivity } from "@/lib/logger";
import {
  DOCUMENT_STATUS,
  DOCUMENT_STATUS_VALUES,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
} from "@/lib/constants/statuses";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";

function serializeInvoice(invoice: any) {
  const partner = invoice.partnerId;
  const isOverdue =
    invoice.paymentState !== PAYMENT_STATE.PAID &&
    invoice.state === DOCUMENT_STATUS.POSTED &&
    invoice.dueDate &&
    new Date(invoice.dueDate).getTime() < Date.now();
  const paymentStatus =
    invoice.paymentState === PAYMENT_STATE.PAID
      ? "paid"
      : invoice.paymentState === PAYMENT_STATE.OVERDUE || isOverdue
        ? "overdue"
        : invoice.state === DOCUMENT_STATUS.POSTED
          ? "sent"
          : invoice.state;

  return {
    ...invoice,
    invoiceNumber: invoice.name,
    customerName: partner?.header?.name || "Unknown Customer",
    customerEmail: partner?.contact_details?.email || "",
    total: Number(invoice.amountTotal) || 0,
    currency: invoice.currencyId || "INR",
    status: paymentStatus,
    issueDate: invoice.invoiceDate,
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();

    const { searchParams } = new URL(req.url);
    const state = searchParams.get("state") || searchParams.get("status");
    const partnerId = searchParams.get("partnerId") || searchParams.get("customerId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const query: Record<string, unknown> = {
      tenantId,
      moveType: "out_invoice",
    };
    if (state === "sent") {
      query.state = DOCUMENT_STATUS.POSTED;
      query.paymentState = { $ne: PAYMENT_STATE.PAID };
    } else if (state === "paid" || state === "overdue") {
      if (state === "paid") {
        query.paymentState = PAYMENT_STATE.PAID;
      } else {
        query.state = DOCUMENT_STATUS.POSTED;
        query.paymentState = { $ne: PAYMENT_STATE.PAID };
        query.dueDate = { $lt: new Date() };
      }
    } else if (state && PAYMENT_STATE_VALUES.includes(state as any)) {
      query.paymentState = state;
    } else if (state && DOCUMENT_STATUS_VALUES.includes(state as any)) {
      query.state = state;
    }
    if (partnerId) query.partnerId = partnerId;

    const total = await Invoice.countDocuments(query);
    const invoices = await Invoice.find(query)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("partnerId", "header.name contact_details.email")
      .populate("createdBy", "name email")
      .lean();

    return NextResponse.json({
      invoices: invoices.map(serializeInvoice),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;

    await connectDB();

    const body = await req.json();

    let partnerId = body.partnerId;
    if (!partnerId && (body.customerName || body.customerEmail)) {
      const customerName = body.customerName || body.customerEmail;
      const customerEmail = body.customerEmail || undefined;
      let customer = customerEmail
        ? await Customer.findOne({
            tenantId,
            "contact_details.email": customerEmail.toLowerCase(),
          })
        : null;

      if (!customer) {
        customer = await Customer.create({
          tenantId,
          header: {
            name: customerName,
            is_company: false,
          },
          contact_details: {
            email: customerEmail,
          },
          createdBy: session.user.id,
        });
      }

      partnerId = customer._id;
    }

    if (!partnerId || !body.dueDate) {
      return NextResponse.json(
        { error: "Customer and due date are required" },
        { status: 400 },
      );
    }

    const invoiceLines = body.invoiceLines?.length
      ? body.invoiceLines
      : (body.items || []).map((item: any) => ({
          name: item.description || "Invoice line",
          quantity: Number(item.quantity) || 1,
          priceUnit: Number(item.rate) || 0,
          priceSubtotal: Number(item.amount) || 0,
          taxIds: [],
        }));

    const amountUntaxed = Number(body.amountUntaxed ?? body.subtotal) || 0;
    const amountTax = Number(body.amountTax ?? body.taxAmount) || 0;
    const amountTotal =
      Number(body.amountTotal ?? body.total) || amountUntaxed + amountTax;

    try {
      await assertTransactionNotLocked(tenantId, "sales", body.invoiceDate);
    } catch (lockError) {
      if (lockError instanceof TransactionLockError) {
        return NextResponse.json({ error: lockError.message }, { status: 403 });
      }
      throw lockError;
    }

    const invoice = await Invoice.create({
      name: body.name || body.invoiceNumber || "Draft",
      partnerId,
      invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
      dueDate: new Date(body.dueDate),
      state: body.state || DOCUMENT_STATUS.DRAFT,
      moveType: "out_invoice",
      invoiceLines,
      currencyId: body.currencyId || "INR",
      receivableAccountId: body.receivableAccountId,
      sourceDocument: body.sourceDocument,
      sourceId: body.sourceId,
      amountUntaxed,
      amountTax,
      amountTotal,
      amountResidual:
        body.amountResidual !== undefined
          ? Number(body.amountResidual)
          : amountTotal,
      paymentState: body.paymentState || PAYMENT_STATE.NOT_PAID,
      tenantId,
      createdBy: session.user.id,
    });

    await logActivity({
      activity: `Created invoice ${invoice.name}`,
      details: `Amount: ${invoice.amountTotal} ${invoice.currencyId}, Due: ${invoice.dueDate.toISOString()}`,
      req,
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error("Error creating invoice:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
