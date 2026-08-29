import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { getDefaultPrefix } from "@/lib/sales/invoiceNumbering";
import { SALES_DOCUMENT_TYPE } from "@/lib/constants/statuses";
import Counter from "@/models/shared/Counter";

// Preview-only: shows what the next quote number would be, without reserving it
// (reservation happens atomically on actual save via generateQuoteNumber).
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const prefix = await getDefaultPrefix(tenantId, SALES_DOCUMENT_TYPE.QUOTATION);
    const counter = await Counter.findOne({ tenantId, key: `invoice:quote:${prefix}` }).lean();
    const nextSeq = ((counter as any)?.seq || 0) + 1;
    const number = `${prefix}${String(nextSeq).padStart(6, "0")}`;

    return NextResponse.json({ success: true, data: { number, prefix } });
  } catch (error: any) {
    console.error("Quote next-number GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
