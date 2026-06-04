import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Invoice from "@/models/Invoice";
import Customer from "@/models/Customer";
import {
  DOCUMENT_STATUS,
  DOCUMENT_STATUS_VALUES,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
} from "@/lib/constants/statuses";

function serializeBill(bill: any) {
  const partner = bill.partnerId;
  const isOverdue =
    bill.paymentState !== PAYMENT_STATE.PAID &&
    bill.state === DOCUMENT_STATUS.POSTED &&
    bill.dueDate &&
    new Date(bill.dueDate).getTime() < Date.now();
  const paymentStatus =
    bill.paymentState === PAYMENT_STATE.PAID
      ? "paid"
      : bill.paymentState === PAYMENT_STATE.OVERDUE || isOverdue
        ? "overdue"
        : bill.state === DOCUMENT_STATUS.POSTED
          ? "posted"
          : bill.state;

  return {
    ...bill,
    billNumber: bill.name,
    vendorName: partner?.header?.name || "Unknown Vendor",
    vendorEmail: partner?.contact_details?.email || "",
    total: Number(bill.amountTotal) || 0,
    currency: bill.currencyId || "INR",
    status: paymentStatus,
    issueDate: bill.invoiceDate,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId");
    const state = searchParams.get("state") || searchParams.get("status");

    const query: any = {
      tenantId,
      moveType: "in_invoice",
    };

    if (partnerId) query.partnerId = partnerId;
    if (state === "pending") {
      query.state = DOCUMENT_STATUS.PENDING_APPROVAL;
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

    const items = await Invoice.find(query)
      .populate("partnerId", "header.name contact_details.email")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      items,
      bills: items.map(serializeBill),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const body = await req.json();

    await dbConnect();

    let partnerId = body.partnerId;
    if (!partnerId && (body.vendorName || body.vendorEmail)) {
      const vendorName = body.vendorName || body.vendorEmail;
      const vendorEmail = body.vendorEmail || undefined;
      let vendor = vendorEmail
        ? await Customer.findOne({
            tenantId,
            "contact_details.email": vendorEmail.toLowerCase(),
          })
        : null;

      if (!vendor) {
        vendor = await Customer.create({
          tenantId,
          header: {
            name: vendorName,
            is_company: true,
          },
          contact_details: {
            email: vendorEmail,
          },
          createdBy: session.user.id,
        });
      }

      partnerId = vendor._id;
    }

    if (!partnerId) {
      return NextResponse.json(
        { error: "Vendor (partnerId) is required" },
        { status: 400 },
      );
    }

    // Auto-generate name logic (e.g. BILL/25-26/01/0001)
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const count = await Invoice.countDocuments({
      tenantId,
      moveType: "in_invoice",
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), 1),
      },
    });
    const sequence = (count + 1).toString().padStart(4, "0");
    const name = `BILL/${year}-${parseInt(year) + 1}/${month}/${sequence}`;

    const invoiceLines = body.invoiceLines?.length
      ? body.invoiceLines
      : (body.items || []).map((item: any) => ({
          name: item.description || "Bill line",
          quantity: Number(item.quantity) || 1,
          priceUnit: Number(item.rate) || 0,
          priceSubtotal: Number(item.amount) || 0,
          taxIds: [],
        }));
    const amountUntaxed = Number(body.amountUntaxed ?? body.subtotal) || 0;
    const amountTax = Number(body.amountTax ?? body.taxAmount) || 0;
    const amountTotal =
      Number(body.amountTotal ?? body.total) || amountUntaxed + amountTax;

    const bill = await Invoice.create({
      ...body,
      name,
      partnerId,
      moveType: "in_invoice",
      invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
      dueDate: body.dueDate ? new Date(body.dueDate) : new Date(),
      invoiceLines,
      currencyId: body.currencyId || body.currency || "INR",
      amountUntaxed,
      amountTax,
      amountTotal,
      amountResidual:
        body.amountResidual !== undefined
          ? Number(body.amountResidual)
          : amountTotal,
      state: body.state || DOCUMENT_STATUS.DRAFT,
      paymentState: body.paymentState || PAYMENT_STATE.NOT_PAID,
      poMatchType: body.poMatchType || "2_way",
      poMatchStatus: body.poMatchStatus || "pending",
      manualReviewRequired: body.manualReviewRequired || false,
      tenantId,
      createdBy: session.user.id,
    });

    if (bill.poReference) {
      try {
        const { runPOMatching } = await import("@/lib/accounting/matching");
        await runPOMatching(String(bill._id), tenantId);
      } catch (matchError) {
        console.error("Auto-matching failed on bill creation:", matchError);
      }
    }

    // Refetch the updated bill with matching results
    const finalBill = await Invoice.findById(bill._id).populate("partnerId", "header.name contact_details.email");

    return NextResponse.json({ success: true, item: finalBill || bill });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
