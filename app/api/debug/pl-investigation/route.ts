import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import JournalEntry from "@/models/JournalEntry";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { requireMaintenanceAccess } from "@/lib/api/maintenance-guard";

export async function GET(req: NextRequest) {
  try {
    const guard = await requireMaintenanceAccess({
      allowedRoles: ["admin", "finance"],
    });
    if (guard.error) return guard.error;

    const tenantId = (guard.session!.user as any).tenantId || "default-tenant";
    await connectDB();

    const journalEntries = await JournalEntry.find({
          tenantId,
          status: DOCUMENT_STATUS.POSTED,
        }).populate("lineIds.accountId").lean();

    const debugData = journalEntries.map((entry) => ({
      name: entry.header.name,
      lines: entry.lineIds.map((line) => ({
        account: line.accountId
          ? {
              name: (line.accountId as any).name,
              internal_group: (line.accountId as any).internal_group,
              id: (line.accountId as any)._id,
            }
          : "NULL",
        debit: line.debit,
        credit: line.credit,
      })),
    }));

    return NextResponse.json({
      tenantId,
      postedCount: journalEntries.length,
      debugData,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message });
  }
}
