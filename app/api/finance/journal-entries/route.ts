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

    if (body.lineIds && Array.isArray(body.lineIds)) {
      let totalDebit = 0;
      let totalCredit = 0;

      for (const line of body.lineIds) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;

        if (debit < 0 || credit < 0) {
          return NextResponse.json(
            { error: "Negative values are not allowed for debit or credit." },
            { status: 400 }
          );
        }
        
        totalDebit += debit;
        totalCredit += credit;
      }

      // Prevent unbalanced entries (allowing tiny float precision variances)
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        return NextResponse.json(
          { error: `Unbalanced journal entry: Total Debit (${totalDebit.toFixed(2)}) must exactly equal Total Credit (${totalCredit.toFixed(2)}).` },
          { status: 400 }
        );
      }
    }

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
