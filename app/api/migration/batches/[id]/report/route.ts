import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationJob from "@/models/admin/MigrationJob";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  const session = await auth();
  if (!session?.user?.tenantId) return new NextResponse("Unauthorized", { status: 401 });

  await dbConnect();
  
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!batch) return new NextResponse("Not Found", { status: 404 });

  const jobs = await MigrationJob.find({ batchId: id, tenantId: session.user.tenantId }).lean();
  const records = await MigrationRecord.find({ batchId: id, tenantId: session.user.tenantId }).lean();

  let reportText = `MIGRATION REPORT\n`;
  reportText += `Batch ID: ${batch._id}\n`;
  reportText += `Source: ${batch.sourceSystem}\n`;
  reportText += `Status: ${batch.status}\n`;
  reportText += `Date: ${new Date(batch.createdAt).toLocaleString()}\n\n`;

  reportText += `--- SUMMARY ---\n`;
  reportText += `Total Records: ${batch.totalRecords}\n`;
  reportText += `Migrated: ${batch.summary?.migrated || 0}\n`;
  reportText += `Failed: ${batch.summary?.failed || 0}\n\n`;

  reportText += `--- JOBS ---\n`;
  for (const job of jobs) {
    reportText += `${job.fileName} (${job.entityType}) - ${job.totalRows} rows\n`;
  }
  
  reportText += `\n--- RECORD DETAILS ---\n`;
  for (const rec of records) {
    const errorMsg = rec.errors && rec.errors.length > 0 ? rec.errors.map((e: any) => e.message).join("; ") : "";
    reportText += `[${rec.entityType.toUpperCase()}] Status: ${rec.status} | Source: ${JSON.stringify(rec.sourceData)} ${errorMsg ? '| ERR: ' + errorMsg : ''}\n`;
  }

  return new NextResponse(reportText, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="migration-report-${id}.txt"`
    }
  });
}
