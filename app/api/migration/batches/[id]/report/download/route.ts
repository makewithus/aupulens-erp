import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationBatch from "@/models/admin/MigrationBatch";
import { friendlyMigrationRecordError } from "@/lib/migration/friendlyRecordError";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });
  
  const records = await MigrationRecord.find({ batchId: id, tenantId: session.user.tenantId }).lean();
  
  if (!records || records.length === 0) {
    return new NextResponse("No records found for this batch", { status: 404 });
  }

  // Generate CSV
  let csv = "Entity,Status,Action,Duplicate Reason,Duplicate Fields,Target ID,Errors,Source Data,Mapped Data\n";
  
  for (const r of records) {
    const entity = `"${r.entityType || ""}"`;
    const status = `"${r.status || ""}"`;
    const action = `"${r.duplicateAction || ""}"`;
    const duplicateReason = `"${r.duplicateReason || ""}"`;
    const duplicateFields = `"${Array.isArray(r.duplicateFields) ? r.duplicateFields.join("; ") : ""}"`;
    const targetId = `"${r.targetRecordId || ""}"`;
    
    let errorsStr = "";
    if (r.errors && Array.isArray(r.errors) && r.errors.length > 0) {
      const friendly = friendlyMigrationRecordError(r);
      errorsStr = `${friendly.title}: ${friendly.message} ${friendly.action}`;
    }
    const errors = `"${errorsStr.replace(/"/g, '""')}"`;
    
    let sourceStr = "";
    if (r.sourceData) {
      sourceStr = JSON.stringify(r.sourceData);
    }
    const sourceData = `"${sourceStr.replace(/"/g, '""')}"`;
    const mappedStr = r.mappedData ? JSON.stringify(r.mappedData) : "";
    const mappedData = `"${mappedStr.replace(/"/g, '""')}"`;
    
    csv += `${entity},${status},${action},${duplicateReason},${duplicateFields},${targetId},${errors},${sourceData},${mappedData}\n`;
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="migration-report-${id}.csv"`
    }
  });
}
