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
import { applySemanticRulesAndClassify } from "@/lib/accounting/smart-rules";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";

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

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;

    const filter: any = { tenantId };
    if (voucherType) filter.voucherType = voucherType;
    if (voucherStatus) filter.voucherStatus = voucherStatus;

    const [total, items] = await Promise.all([
      JournalEntry.countDocuments(filter),
      JournalEntry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("lineIds.accountId", "code name account_type")
        .populate("lineIds.partnerId", "header.name contact_details.email")
        .lean(),
    ]);

    return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
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

    try {
      await assertTransactionNotLocked(tenantId, "accountant", body.header?.date);
    } catch (lockError) {
      if (lockError instanceof TransactionLockError) {
        return NextResponse.json({ error: lockError.message }, { status: 403 });
      }
      throw lockError;
    }

    // Apply Smart Rules
    const classification = await applySemanticRulesAndClassify(body, tenantId);
    if (!classification.ok) {
      return NextResponse.json({ error: classification.error }, { status: 400 });
    }

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
