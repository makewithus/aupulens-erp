import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import DocumentPrefix from "@/models/sales/DocumentPrefix";
import Counter from "@/models/shared/Counter";
import { createPrefix, clearOtherDefaults } from "@/lib/sales/documentPrefixes";
import { SALES_DOCUMENT_TYPE, DOCUMENT_PREFIX_KIND } from "@/lib/constants/statuses";

// Backs the New Subscription page's "Configure Subscription# Preferences"
// modal — same shape as app/api/sales/quotes/number-settings/route.ts.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();
    const prefix = (body.prefix || "SUB-").trim();
    const nextNumber = Math.max(1, parseInt(body.nextNumber, 10) || 1);

    let row = await DocumentPrefix.findOne({
      tenantId,
      documentType: SALES_DOCUMENT_TYPE.SUBSCRIPTION,
      kind: DOCUMENT_PREFIX_KIND.PREFIX,
      value: prefix,
    });

    if (!row) {
      row = await createPrefix({
        tenantId,
        documentType: SALES_DOCUMENT_TYPE.SUBSCRIPTION,
        kind: DOCUMENT_PREFIX_KIND.PREFIX,
        value: prefix,
        isDefault: true,
        createdBy: session.user.id,
      });
    } else if (!row.isDefault) {
      await clearOtherDefaults(tenantId, SALES_DOCUMENT_TYPE.SUBSCRIPTION, DOCUMENT_PREFIX_KIND.PREFIX, row.id);
      row.isDefault = true;
      await row.save();
    }

    // Same key-building convention as lib/sales/subscriptionNumbering.ts/getNextSequence.
    await Counter.findOneAndUpdate(
      { tenantId, key: `invoice:subscription:${prefix}` },
      { $set: { seq: nextNumber - 1 } },
      { upsert: true },
    );

    return NextResponse.json({ success: true, data: { prefix, nextNumber } });
  } catch (error: any) {
    console.error("Subscription number-settings POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
