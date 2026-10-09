import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { buildGstReport } from "@/lib/tax/gstReport";
import { SalesInvoice } from "@/models/sales/SalesInvoice";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const query: any = { tenantId: session.user.tenantId };
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      query.invoiceDate = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) query.invoiceDate.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.invoiceDate.$lte = end;
      }
    }

    const invoices = await SalesInvoice.find(query).select("lineItems invoiceDate number tenantId").lean();
    const rows = buildGstReport(invoices);
    return NextResponse.json({
      success: true,
      rows,
      totals: {
        taxableValue: rows.reduce((sum, row) => sum + row.taxableValue, 0),
        taxAmount: rows.reduce((sum, row) => sum + row.taxAmount, 0),
        total: rows.reduce((sum, row) => sum + row.total, 0),
        missingHsnCount: rows.reduce((sum, row) => sum + row.missingHsnCount, 0),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
