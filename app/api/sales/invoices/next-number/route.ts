import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import Counter from "@/models/Counter";
import { getDefaultPrefix } from "@/lib/sales/invoiceNumbering";

// Non-committing preview of the next invoice number for a given prefix —
// does NOT increment the counter. Final uniqueness is enforced at save time
// by the compound unique index on SalesInvoice.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix") || (await getDefaultPrefix(tenantId));

    const counter = await Counter.findOne({ tenantId, key: `invoice:${prefix}` }).lean();
    const nextSeq = ((counter as any)?.seq || 0) + 1;
    const number = `${prefix}${String(nextSeq).padStart(4, "0")}`;

    return NextResponse.json({ success: true, data: { number, prefix, seq: nextSeq } });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
