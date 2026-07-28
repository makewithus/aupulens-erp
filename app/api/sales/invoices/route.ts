import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import { SalesInvoice } from "@/models/SalesInvoice";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateInvoiceNumber } from "@/lib/sales/invoiceNumbering";
import { resolveInvoiceStatus } from "@/lib/sales/invoiceStatus";
import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import Organization from "@/models/Organization";
import { postSalesInvoiceJournal } from "@/lib/accounting/salesInvoicePosting";
import "@/models/Customer"; // side-effect import: registers "Customer" for .populate("customerId") below (a bound `import X from` here gets tree-shaken by Next's bundler since X is otherwise unused)

const REVENUE_RECOGNIZED_STATUSES = new Set([
  SALES_INVOICE_STATUS.SAVED,
  SALES_INVOICE_STATUS.PARTIALLY_PAID,
  SALES_INVOICE_STATUS.PAID,
  SALES_INVOICE_STATUS.OVERDUE,
]);

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const skip = (page - 1) * limit;

    const query: any = { tenantId: session.user.tenantId };

    const search = searchParams.get("search");
    if (search) {
      query.number = { $regex: search, $options: "i" };
    }

    const status = searchParams.get("status");
    if (status === "unpaid") {
      // Any invoice with a real outstanding balance — used by the Payments
      // form's "pick invoices to pay" picker. A plain `status: "saved"`
      // filter here previously hid overdue and partially-paid invoices
      // (both still have dues) from the picker entirely.
      query.status = {
        $in: [SALES_INVOICE_STATUS.SAVED, SALES_INVOICE_STATUS.OVERDUE, SALES_INVOICE_STATUS.PARTIALLY_PAID],
      };
    } else if (status && status !== "all") {
      query.status = status;
    }

    const customerId = searchParams.get("customerId");
    if (customerId) {
      query.customerId = customerId;
    }

    const [total, invoices] = await Promise.all([
      SalesInvoice.countDocuments(query),
      (SalesInvoice as any)
        .find(query)
        .populate("customerId", "header contact_details")
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: invoices,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Sales Invoices GET error:", error);
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
    const isDraft = body.status === SALES_INVOICE_STATUS.DRAFT;

    if (!isDraft) {
      if (!body.customerId) {
        return NextResponse.json({ success: false, message: "Customer is required" }, { status: 400 });
      }
      if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
        return NextResponse.json({ success: false, message: "At least one line item is required" }, { status: 400 });
      }
    }

    const org = await Organization.findOne({ subdomain: tenantId }).lean();
    const sellerState = (org as any)?.settings?.state;

    const totals = computeInvoiceTotals({
      lineItems: body.lineItems || [],
      itemLevelDiscountPercent: body.itemLevelDiscountPercent || 0,
      additionalCharges: body.additionalCharges || [],
      extraDiscount: body.extraDiscount || 0,
      extraDiscountMode: body.extraDiscountMode || "amount",
      roundOff: !!body.roundOff,
      sellerState,
      placeOfSupply: body.placeOfSupply,
      tdsRate: body.taxes?.tds || 0,
      tcsRate: body.taxes?.tcs || 0,
    });

    let number = body.number;
    if (!number) {
      const generated = await generateInvoiceNumber(tenantId, body.prefix);
      number = generated.number;
    }

    const status = resolveInvoiceStatus({
      requestedStatus: body.status || SALES_INVOICE_STATUS.SAVED,
      totalAmount: totals.totalAmount,
      payments: body.payments || [],
      markedFullyPaid: body.markedFullyPaid,
      dueDate: body.dueDate,
    });

    const newInvoice = new SalesInvoice({
      ...body,
      tenantId,
      number,
      taxableAmount: totals.taxableAmount,
      totalDiscount: totals.totalDiscount,
      totalAmount: totals.totalAmount,
      taxes: {
        tds: body.taxes?.tds || 0,
        tcs: body.taxes?.tcs || 0,
        gstBreakup: totals.gstBreakup,
      },
      status,
      createdBy: session.user.id,
    });

    await newInvoice.save();

    // Post revenue/receivable/tax to the General Ledger as soon as the
    // invoice is a real, issued document (not draft) — previously nothing
    // in the Sales module ever posted a journal entry for a sale at all, so
    // Profit & Loss and the Balance Sheet never reflected sales revenue
    // regardless of payment status. Roll back the invoice itself if posting
    // fails (missing Chart of Accounts entry etc.) rather than leaving a
    // "real" invoice with no GL impact.
    if (REVENUE_RECOGNIZED_STATUSES.has(newInvoice.status as any)) {
      try {
        await postSalesInvoiceJournal({
          invoice: newInvoice,
          tenantId,
          createdBy: session.user.id,
          current: { taxableAmount: totals.taxableAmount, totalTax: totals.totalTax, tcsAmount: totals.tcsAmount, tdsAmount: totals.tdsAmount },
        });
        await newInvoice.save();
      } catch (postingError: any) {
        await (SalesInvoice as any).deleteOne({ _id: newInvoice._id });
        return NextResponse.json({ success: false, message: postingError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true, data: newInvoice }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "That invoice number is already in use. Please choose another." },
        { status: 409 },
      );
    }
    console.error("Sales Invoices POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
