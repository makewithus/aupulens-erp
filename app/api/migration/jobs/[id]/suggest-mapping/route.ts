import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationJob from "@/models/MigrationJob";
import { suggestMapping } from "@/lib/migration/fieldMapping";
import { MIGRATION_JOB_STATUS } from "@/lib/migration/constants";

// POST /api/migration/jobs/[id]/suggest-mapping — AI-assisted (+ deterministic
// fallback) column→field mapping. Persists the suggestion as the job's mapping.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const job = await MigrationJob.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!job) return NextResponse.json({ success: false }, { status: 404 });

  const { mapping, aiUsed } = await suggestMapping(
    session.user.tenantId,
    job.entityType,
    job.columns,
    (job.rows || []).slice(0, 3) as Record<string, unknown>[],
  );

  job.mapping = mapping;
  job.aiMappingUsed = aiUsed;
  job.validation = undefined;
  job.preview = undefined;
  if (job.status === MIGRATION_JOB_STATUS.CREATED) job.status = MIGRATION_JOB_STATUS.MAPPED;
  await job.save();

  return NextResponse.json({ success: true, data: { mapping, aiUsed } });
}
