import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationJob from "@/models/admin/MigrationJob";
import { executeImport } from "@/lib/migration/importer";
import { validateRows } from "@/lib/migration/validation";
import { MIGRATION_JOB_STATUS } from "@/lib/migration/constants";

// POST /api/migration/jobs/[id]/execute — the real import. Writes surviving rows
// to live collections and records every created id for rollback. Idempotent-ish:
// a job already imported (and not rolled back) is refused so a double-click can't
// double-import.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await MigrationJob.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  if (job.status === MIGRATION_JOB_STATUS.IMPORTED) {
    return NextResponse.json({ success: false, message: "This job has already been imported. Roll it back to re-run." }, { status: 409 });
  }

  const validation = validateRows(
    job.entityType,
    (job.rows || []) as Record<string, unknown>[],
    (job.mapping || {}) as Record<string, string>,
  );
  const structuralErrors = validation.issues.filter((i) => i.rowIndex === -1 && i.severity === "error");
  if (structuralErrors.length > 0) {
    return NextResponse.json({ success: false, message: structuralErrors.map((i) => i.message).join(" ") }, { status: 422 });
  }

  const result = await executeImport(
    job.entityType,
    (job.rows || []) as Record<string, unknown>[],
    (job.mapping || {}) as Record<string, string>,
    { tenantId: session.user.tenantId, userId: session.user.id },
  );

  job.importedRefs = result.importedRefs;
  job.result = {
    ranAt: new Date(),
    created: result.created,
    failed: result.failed,
    errors: result.errors.slice(0, 1000),
  };
  job.status = MIGRATION_JOB_STATUS.IMPORTED;
  await job.save();

  return NextResponse.json({
    success: true,
    data: {
      created: result.created,
      failed: result.failed,
      errors: result.errors.slice(0, 200),
      truncated: result.errors.length > 200,
    },
  });
}
