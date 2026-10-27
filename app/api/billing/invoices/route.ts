import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BillingInvoice from "@/models/billing/BillingInvoice";
import { handleRouteError } from "@/lib/api/validateId";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      BillingInvoice.find({ tenantId })
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BillingInvoice.countDocuments({ tenantId }),
    ]);

    return NextResponse.json({
      success: true,
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
