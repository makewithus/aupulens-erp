import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import BankStatement from "@/models/BankStatement";
import JournalEntry from "@/models/JournalEntry";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { statementId, lineId, journalEntryId, journalLineId } =
      await req.json();

    await dbConnect();

    // 1. Mark bank statement line as reconciled
    const statement = await BankStatement.findOne({
      _id: statementId,
      tenantId,
    });
    if (statement) {
      const line = statement.lineIds.find(
        (l: any) => l._id.toString() === lineId,
      );
      if (line) {
        line.isReconciled = true;
        await statement.save();
      }
    }

    // 2. Mark journal entry line as reconciled
    const entry = await JournalEntry.findOne({ _id: journalEntryId, tenantId });
    if (entry) {
      try {
        await assertTransactionNotLocked(tenantId, "banking", entry.header?.date);
      } catch (lockError) {
        if (lockError instanceof TransactionLockError) {
          return NextResponse.json({ error: lockError.message }, { status: 403 });
        }
        throw lockError;
      }
      const line = entry.lineIds.find(
        (l: any) => l._id.toString() === journalLineId,
      );
      if (line) {
        line.reconciled = true;
        await entry.save();
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
