import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import DocumentPrefix from "@/models/DocumentPrefix";
import Counter from "@/models/Counter";
import { createPrefix, clearOtherDefaults } from "@/lib/sales/documentPrefixes";
import { SALES_DOCUMENT_TYPE, DOCUMENT_PREFIX_KIND } from "@/lib/constants/statuses";

// Backs the New Quote page's "Configure Quote Number Preferences" modal
// (gear icon next to Quote#). Persists the prefix as the default
// SALES_DOCUMENT_TYPE.QUOTATION DocumentPrefix row, and — since quote
// numbering is an atomic $inc counter, not a stored "next value" — sets the
// underlying Counter.seq so the *next* generated number equals nextNumber.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();
    const prefix = (body.prefix || "QUO-").trim();
    const nextNumber = Math.max(1, parseInt(body.nextNumber, 10) || 1);

    let row = await DocumentPrefix.findOne({
      tenantId,
      documentType: SALES_DOCUMENT_TYPE.QUOTATION,
      kind: DOCUMENT_PREFIX_KIND.PREFIX,
      value: prefix,
    });

    if (!row) {
      row = await createPrefix({
        tenantId,
        documentType: SALES_DOCUMENT_TYPE.QUOTATION,
        kind: DOCUMENT_PREFIX_KIND.PREFIX,
        value: prefix,
        isDefault: true,
        createdBy: session.user.id,
      });
    } else if (!row.isDefault) {
      await clearOtherDefaults(tenantId, SALES_DOCUMENT_TYPE.QUOTATION, DOCUMENT_PREFIX_KIND.PREFIX, row.id);
      row.isDefault = true;
      await row.save();
    }

    // Same key-building convention as lib/sales/quoteNumbering.ts/getNextSequence.
    await Counter.findOneAndUpdate(
      { tenantId, key: `invoice:quote:${prefix}` },
      { $set: { seq: nextNumber - 1 } },
      { upsert: true },
    );

    return NextResponse.json({ success: true, data: { prefix, nextNumber } });
  } catch (error: any) {
    console.error("Quote number-settings POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
