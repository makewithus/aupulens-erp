import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import EInvoice from "@/models/EInvoice";
import { CURRENCY_ADJUSTMENT_FILTER } from "@/lib/constants/statuses";
import "@/models/SalesInvoice"; // side-effect import: registers "SalesInvoice" for .populate("invoiceId") below
import "@/models/Customer"; // side-effect import: registers "Customer" for the nested populate below

function dateRangeForFilter(range: string | null): { $gte?: Date; $lte?: Date } | undefined {
  if (!range || range === CURRENCY_ADJUSTMENT_FILTER.ALL) return undefined;
  const now = new Date();
  const start = new Date(now);
  if (range === CURRENCY_ADJUSTMENT_FILTER.TODAY) {
    start.setHours(0, 0, 0, 0);
  } else if (range === CURRENCY_ADJUSTMENT_FILTER.THIS_WEEK) {
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (range === CURRENCY_ADJUSTMENT_FILTER.THIS_MONTH) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (range === CURRENCY_ADJUSTMENT_FILTER.THIS_QUARTER) {
    const q = Math.floor(now.getMonth() / 3);
    start.setMonth(q * 3, 1);
    start.setHours(0, 0, 0, 0);
  } else if (range === CURRENCY_ADJUSTMENT_FILTER.THIS_YEAR) {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    return undefined;
  }
  return { $gte: start, $lte: now };
}

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

    const query: any = { tenantId };

    const status = searchParams.get("status");
    if (status && status !== "all") {
      query.status = status;
    }

    const createdRange = dateRangeForFilter(searchParams.get("range"));
    if (createdRange) {
      query.createdAt = createdRange;
    }

    const search = searchParams.get("search")?.trim().toLowerCase();

    const baseQuery = EInvoice.find(query)
      .populate({
        path: "invoiceId",
        select: "number totalAmount customerId invoiceDate",
        populate: { path: "customerId", select: "header contact_details" },
      })
      .sort({ createdAt: -1 })
      .lean();

    // Search spans fields on the referenced SalesInvoice/Customer docs, which Mongo can't
    // filter on directly through a populate — so when searching, pull the full status/range
    // match set and paginate the filtered result in memory instead of paginating pre-filter.
    if (search) {
      const all = await baseQuery;
      const filtered = all.filter((r: any) => {
        const invoiceNumber: string = r.invoiceId?.number || "";
        const customerName: string =
          r.invoiceId?.customerId?.header?.name || r.invoiceId?.customerId?.contact_details?.email || "";
        const haystack = `${invoiceNumber} ${customerName} ${r.irn || ""} ${r.ackNo || ""}`.toLowerCase();
        return haystack.includes(search);
      });
      const total = filtered.length;
      return NextResponse.json({
        success: true,
        data: filtered.slice(skip, skip + limit),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    }

    const [total, records] = await Promise.all([
      EInvoice.countDocuments(query),
      baseQuery.skip(skip).limit(limit),
    ]);

    return NextResponse.json({
      success: true,
      data: records,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("E-Invoices GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
