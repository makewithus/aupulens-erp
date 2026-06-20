import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import JournalEntry from "@/models/JournalEntry";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { searchParams } = new URL(req.url);
    const reconciled = searchParams.get("reconciled");

    await dbConnect();

    const query: any = { tenantId };
    if (reconciled === "false") {
      // In a real scenario, we might need to filter lines, but Mongoose find()
      // queries the parent. We'll filter the lines in JS for simplicity or use aggregation.
    }

    const entries = await JournalEntry.find(query)
          .sort({ "header.date": -1 })
          .populate("lineIds.accountId")
          .populate("lineIds.partnerId").lean();

    const flattenedLines: any[] = [];
    entries.forEach((entry) => {
      entry.lineIds.forEach((line) => {
        if (reconciled === "false" && line.reconciled) return;

        flattenedLines.push({
          journalEntryId: entry._id,
          journalLineId: line._id,
          date: entry.header.date,
          entryName: entry.header.name,
          ref: entry.header.ref,
          accountId: line.accountId,
          partnerId: line.partnerId,
          label: line.label,
          debit: line.debit,
          credit: line.credit,
          reconciled: line.reconciled,
          status: entry.status,
        });
      });
    });

    return NextResponse.json({ items: flattenedLines });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
