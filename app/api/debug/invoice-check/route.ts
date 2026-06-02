import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";
import JournalEntry from "@/models/JournalEntry";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { requireMaintenanceAccess } from "@/lib/api/maintenance-guard";

export async function GET(req: NextRequest) {
  try {
    const guard = await requireMaintenanceAccess({
      allowedRoles: ["admin", "finance"],
    });
    if (guard.error) return guard.error;

    const tenantId = guard.session!.user.tenantId || "default-tenant";
    await connectDB();

    const postedInvoices = await Invoice.find({
      tenantId,
      state: DOCUMENT_STATUS.POSTED,
    }).countDocuments();
    const draftInvoices = await Invoice.find({
      tenantId,
      state: DOCUMENT_STATUS.DRAFT,
    }).countDocuments();
    const postedJEs = await JournalEntry.find({
      tenantId,
      status: DOCUMENT_STATUS.POSTED,
    }).countDocuments();

    const sampleJE = await JournalEntry.findOne({ tenantId, status: DOCUMENT_STATUS.POSTED })
      .populate("lineIds.accountId")
      .lean();

    return NextResponse.json({
      tenantId,
      postedInvoices,
      draftInvoices,
      postedJEs,
      sampleJE,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message });
  }
}
