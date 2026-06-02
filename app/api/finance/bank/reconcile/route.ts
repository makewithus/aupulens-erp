import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import BankStatement from "@/models/BankStatement";
import JournalEntry from "@/models/JournalEntry";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
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
