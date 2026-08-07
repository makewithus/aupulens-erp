import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationJob from "@/models/MigrationJob";
import { previewImport } from "@/lib/migration/importer";
import { validateRows } from "@/lib/migration/validation";
import { MIGRATION_JOB_STATUS } from "@/lib/migration/constants";

// POST /api/migration/jobs/[id]/preview — sandbox dry-run. Counts create-vs-skip
// (skip = missing required, in-file dup, or already exists) with ZERO writes.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await MigrationJob.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  // A structural mapping error (required field unmapped) blocks preview outright.
  const validation = validateRows(
    job.entityType,
    (job.rows || []) as Record<string, unknown>[],
    (job.mapping || {}) as Record<string, string>,
  );
  const structuralErrors = validation.issues.filter((i) => i.rowIndex === -1 && i.severity === "error");
  if (structuralErrors.length > 0) {
    return NextResponse.json(
      { success: false, message: structuralErrors.map((i) => i.message).join(" ") },
      { status: 422 },
    );
  }

  const result = await previewImport(
    job.entityType,
    (job.rows || []) as Record<string, unknown>[],
    (job.mapping || {}) as Record<string, string>,
    { tenantId: session.user.tenantId, userId: session.user.id },
  );

  job.preview = { ranAt: new Date(), willCreate: result.willCreate, willSkip: result.willSkip, sample: result.sample };
  if (job.status === MIGRATION_JOB_STATUS.VALIDATED || job.status === MIGRATION_JOB_STATUS.MAPPED) {
    job.status = MIGRATION_JOB_STATUS.PREVIEWED;
  }
  await job.save();

  return NextResponse.json({ success: true, data: result });
}
