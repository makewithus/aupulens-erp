import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationJob from "@/models/admin/MigrationJob";
import { validateRows } from "@/lib/migration/validation";
import { MIGRATION_JOB_STATUS } from "@/lib/migration/constants";

// POST /api/migration/jobs/[id]/validate — run integrity checks over the mapped
// rows (required/format/GSTIN/state-code + in-file dedupe). Persists the summary.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await MigrationJob.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  const result = validateRows(
    job.entityType,
    (job.rows || []) as Record<string, unknown>[],
    (job.mapping || {}) as Record<string, string>,
  );

  job.validation = {
    ranAt: new Date(),
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    duplicateCount: result.duplicateCount,
    // Cap stored issues so a pathological file can't bloat the doc past 16MB.
    issues: result.issues.slice(0, 1000),
  };
  if (job.status === MIGRATION_JOB_STATUS.MAPPED) job.status = MIGRATION_JOB_STATUS.VALIDATED;
  await job.save();

  return NextResponse.json({
    success: true,
    data: {
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      duplicateCount: result.duplicateCount,
      issues: result.issues.slice(0, 200),
      truncated: result.issues.length > 200,
    },
  });
}
