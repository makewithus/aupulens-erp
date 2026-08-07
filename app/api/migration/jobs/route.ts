import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationJob from "@/models/MigrationJob";
import {
  MIGRATION_ENTITY_VALUES,
  MIGRATION_SOURCE_SYSTEM_VALUES,
  MIGRATION_JOB_STATUS,
  MIGRATION_MAX_ROWS,
} from "@/lib/migration/constants";
import { parseSourceFile, validateSourceFile } from "@/lib/migration/sourceAdapters";

// GET /api/migration/jobs — list this tenant's migration jobs (newest first).
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  await dbConnect();
  const jobs = await MigrationJob.find({ tenantId: session.user.tenantId })
    // Exclude the heavy rows array from the list payload.
    .select("-rows -validation.issues -preview.sample -result.errors")
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json({ success: true, data: jobs });
}

// POST /api/migration/jobs — upload a source file and create a parsed job.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const name = (form.get("name") as string)?.trim();
  const sourceSystem = form.get("sourceSystem") as string;
  const entityType = form.get("entityType") as string;

  if (!file) return NextResponse.json({ success: false, message: "No file provided." }, { status: 400 });
  if (!name) return NextResponse.json({ success: false, message: "A job name is required." }, { status: 400 });
  if (!MIGRATION_SOURCE_SYSTEM_VALUES.includes(sourceSystem as never)) {
    return NextResponse.json({ success: false, message: "Invalid source system." }, { status: 400 });
  }
  if (!MIGRATION_ENTITY_VALUES.includes(entityType as never)) {
    return NextResponse.json({ success: false, message: "Invalid entity type." }, { status: 400 });
  }

  const fileError = validateSourceFile(file.name);
  if (fileError) return NextResponse.json({ success: false, message: fileError }, { status: 400 });

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = parseSourceFile(file.name, buffer);
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to parse file." },
      { status: 400 },
    );
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json({ success: false, message: "No data rows found in the file." }, { status: 400 });
  }
  if (parsed.rows.length > MIGRATION_MAX_ROWS) {
    return NextResponse.json(
      { success: false, message: `File has ${parsed.rows.length} rows; the per-file limit is ${MIGRATION_MAX_ROWS}. Split it into smaller files.` },
      { status: 400 },
    );
  }

  await dbConnect();
  const job = await MigrationJob.create({
    tenantId: session.user.tenantId,
    name,
    sourceSystem,
    entityType,
    status: MIGRATION_JOB_STATUS.CREATED,
    fileName: file.name,
    columns: parsed.columns,
    rows: parsed.rows,
    totalRows: parsed.rows.length,
    mapping: {},
    importedRefs: [],
    createdBy: session.user.id,
  });

  return NextResponse.json({
    success: true,
    data: {
      _id: job._id,
      name: job.name,
      sourceSystem: job.sourceSystem,
      entityType: job.entityType,
      status: job.status,
      fileName: job.fileName,
      columns: job.columns,
      totalRows: job.totalRows,
      preview: parsed.rows.slice(0, 5),
    },
  });
}
