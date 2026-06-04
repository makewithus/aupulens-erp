import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import JournalEntry from "@/models/JournalEntry";
import {
  DOCUMENT_STATUS,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from "@/lib/constants/statuses";
import { createJournalEntry } from "@/lib/accounting/posting";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const voucherType = searchParams.get("voucherType");
    const voucherStatus = searchParams.get("voucherStatus");

    const filter: any = { tenantId };
    if (voucherType) filter.voucherType = voucherType;
    if (voucherStatus) filter.voucherStatus = voucherStatus;

    const items = await JournalEntry.find(filter)
      .sort({ createdAt: -1 })
      .populate("lineIds.accountId")
      .populate("lineIds.partnerId");

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const body = await req.json();

    await dbConnect();

    const entry = await createJournalEntry({
      ...body,
      voucherType: body.voucherType || VOUCHER_TYPE.JOURNAL,
      voucherStatus:
        body.voucherStatus ||
        (body.status === DOCUMENT_STATUS.POSTED
          ? VOUCHER_STATUS.POSTED
          : VOUCHER_STATUS.DRAFT),
      tenantId,
      createdBy: session.user.id,
    });

    return NextResponse.json(entry);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
