import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationJob from "@/models/admin/MigrationJob";
import { MIGRATION_JOB_STATUS } from "@/lib/migration/constants";
import { getEntitySchema } from "@/lib/migration/entitySchemas";

// GET /api/migration/jobs/[id] — full job incl. columns, mapping, a row sample.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await MigrationJob.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  const schema = getEntitySchema(job.entityType);
  return NextResponse.json({
    success: true,
    data: {
      ...job,
      rows: undefined, // don't ship the whole file back
      rowSample: (job.rows || []).slice(0, 5),
      targetFields: schema?.fields ?? [],
    },
  });
}

// PATCH /api/migration/jobs/[id] — save the field mapping (or rename the job).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await MigrationJob.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });
  if (job.status === MIGRATION_JOB_STATUS.IMPORTED) {
    return NextResponse.json({ success: false, message: "An imported job can't be re-mapped. Roll it back first." }, { status: 409 });
  }

  const body = await req.json();
  if (typeof body.name === "string" && body.name.trim()) job.name = body.name.trim();

  if (body.mapping && typeof body.mapping === "object") {
    const schema = getEntitySchema(job.entityType);
    const validFieldKeys = new Set(schema?.fields.map((f) => f.key) ?? []);
    const validColumns = new Set(job.columns);
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.mapping as Record<string, unknown>)) {
      if (validFieldKeys.has(k) && typeof v === "string" && validColumns.has(v)) clean[k] = v;
    }
    job.mapping = clean;
    // Saving a new mapping invalidates any prior validation/preview.
    job.validation = undefined;
    job.preview = undefined;
    job.status = MIGRATION_JOB_STATUS.MAPPED;
  }

  await job.save();
  return NextResponse.json({ success: true, data: { _id: job._id, name: job.name, mapping: job.mapping, status: job.status } });
}

// DELETE /api/migration/jobs/[id] — remove the job record itself. Does NOT undo
// an import (use rollback for that first); refuses if imported records still
// exist so a job's audit trail can't be lost while its data lingers.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await MigrationJob.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });
  if (job.status === MIGRATION_JOB_STATUS.IMPORTED && job.importedRefs.length > 0) {
    return NextResponse.json(
      { success: false, message: "This job has imported records. Roll it back before deleting the job." },
      { status: 409 },
    );
  }
  await job.deleteOne();
  return NextResponse.json({ success: true });
}
