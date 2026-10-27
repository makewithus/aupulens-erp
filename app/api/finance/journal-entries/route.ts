import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import {
  DOCUMENT_STATUS,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from "@/lib/constants/statuses";
import { createJournalEntry, type JournalPostingInput } from "@/lib/accounting/posting";
import { applySemanticRulesAndClassify } from "@/lib/accounting/smart-rules";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";
import { withAccountingTransaction } from "@/lib/accounting/transaction";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const voucherType = searchParams.get("voucherType");
    const voucherStatus = searchParams.get("voucherStatus");
    const onlyVouchers = searchParams.get("onlyVouchers") === "true";
    const search = (searchParams.get("search") || "").trim();

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;

    const filter: any = { tenantId };
    if (voucherType) filter.voucherType = voucherType;
    if (voucherStatus) filter.voucherStatus = voucherStatus;
    if (onlyVouchers) filter.voucherType = filter.voucherType || { $exists: true, $ne: null };
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { "header.name": re },
        { "header.ref": re },
        { "header.journalType": re },
      ];
    }

    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) filter["header.date"] = range;
    }

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
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!["finance", "admin", "master-admin"].includes((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden: Finance role required" }, { status: 403 });
    }

    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;
    const body = stripProtectedFields(await req.json());

    // Public journal creation starts a draft; posting services used by other
    // business workflows enforce their own authoritative posting rules.
    if ((body.voucherStatus && body.voucherStatus !== VOUCHER_STATUS.DRAFT) ||
      (body.status && body.status !== DOCUMENT_STATUS.DRAFT)) {
      return NextResponse.json({ error: "New entries must start as drafts" }, { status: 400 });
    }

    if (
      !body.header ||
      typeof body.header !== "object" ||
      typeof body.header.journalType !== "string" ||
      !Array.isArray(body.lineIds)
    ) {
      return NextResponse.json(
        { error: "Journal header and line items are required" },
        { status: 400 },
      );
    }

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

    return await withAccountingTransaction(async () => {
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

      const postingInput: JournalPostingInput = {
        ...body,
        header: body.header as JournalPostingInput["header"],
        lineIds: body.lineIds as JournalPostingInput["lineIds"],
        voucherType: body.voucherType || VOUCHER_TYPE.JOURNAL,
        voucherStatus:
          body.voucherStatus ||
          (body.status === DOCUMENT_STATUS.POSTED
            ? VOUCHER_STATUS.POSTED
            : VOUCHER_STATUS.DRAFT),
        tenantId,
        createdBy: session.user.id,
      };
      const entry = await createJournalEntry(postingInput);

      return NextResponse.json(entry);
    });
  } catch (error: any) {
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}
