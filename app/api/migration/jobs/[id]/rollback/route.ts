import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationJob from "@/models/MigrationJob";
import { rollbackImport } from "@/lib/migration/importer";
import { MIGRATION_JOB_STATUS } from "@/lib/migration/constants";

// POST /api/migration/jobs/[id]/rollback — delete exactly the records this job
// created (scoped to the job's tenant), then mark it rolled_back so it can be
// re-mapped/re-run cleanly.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await MigrationJob.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  if (job.status !== MIGRATION_JOB_STATUS.IMPORTED) {
    return NextResponse.json({ success: false, message: "Only an imported job can be rolled back." }, { status: 409 });
  }

  const { deleted } = await rollbackImport(job.importedRefs, session.user.tenantId);

  job.importedRefs = [];
  job.status = MIGRATION_JOB_STATUS.ROLLED_BACK;
  job.result = {
    ...(job.result || { ranAt: new Date(), created: 0, failed: 0, errors: [] }),
    rolledBackAt: new Date(),
    deleted,
  } as never;
  await job.save();

  return NextResponse.json({ success: true, data: { deleted } });
}
