import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import SalesQuotation from "@/models/SalesQuotation";
import SalesView from "@/models/SalesView";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateQuoteNumber } from "@/lib/sales/quoteNumbering";
import { buildMongoFilterFromCriteria } from "@/lib/sales/quoteViews";
import { QUOTE_STATUS, QUOTE_STATUS_VALUES } from "@/lib/constants/statuses";
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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const skip = (page - 1) * limit;

    let query: any = { tenantId };

    const viewId = searchParams.get("viewId");
    if (viewId) {
      const view = await SalesView.findOne({ _id: viewId, tenantId, entityType: "quotes" }).lean();
      if (view) {
        query = { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
      }
    }

    const status = searchParams.get("status");
    if (status && status !== "all") query.status = status;

    const search = searchParams.get("search")?.trim();
    if (search) {
      query.$or = [{ quoteNumber: { $regex: search, $options: "i" } }, { subject: { $regex: search, $options: "i" } }];
    }

    const [total, quotes] = await Promise.all([
      SalesQuotation.countDocuments(query),
      (SalesQuotation as any)
        .find(query)
        .populate("customerId", "header contact_details")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: quotes,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Sales Quotes GET error:", error);
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
    if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
      return NextResponse.json({ success: false, message: "At least one line item is required" }, { status: 400 });
    }

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
    const totalAmount = totals.totalAmount + adjustment;

    let quoteNumber = body.quoteNumber;
    if (!quoteNumber) {
      const generated = await generateQuoteNumber(tenantId, body.prefix);
      quoteNumber = generated.number;
    }

    const quote = await SalesQuotation.create({
      ...body,
      tenantId,
      quoteNumber,
      taxes: { mode: taxMode, taxId: body.taxes?.taxId || undefined, rate: taxRate, amount: taxMode === "tds" ? totals.tdsAmount : totals.tcsAmount },
      adjustment,
      taxableAmount: totals.taxableAmount,
      totalDiscount: totals.totalDiscount,
      totalAmount,
      status: QUOTE_STATUS_VALUES.includes(body.status) ? body.status : QUOTE_STATUS.DRAFT,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: quote }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "That quote number is already in use. Please choose another." },
        { status: 409 },
      );
    }
    console.error("Sales Quotes POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
