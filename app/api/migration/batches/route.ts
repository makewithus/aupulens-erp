import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { MIGRATION_JOB_STATUS } from "@/lib/migration/constants";
import {
  normalizeSourceSystem,
  prepareMigrationFiles,
} from "@/lib/migration/package";
import { MIGRATION_SOURCE_SYSTEM, type MigrationSourceSystem } from "@/lib/migration/constants";

function sourceSystemFromFiles(files: File[], selected: MigrationSourceSystem): MigrationSourceSystem {
  const extensions = new Set(files.map((file) => file.name.split(".").pop()?.toLowerCase()));
  if (extensions.size === 1) {
    if (extensions.has("xlsx") || extensions.has("xls")) return MIGRATION_SOURCE_SYSTEM.EXCEL;
    if (extensions.has("csv") || extensions.has("tsv")) return MIGRATION_SOURCE_SYSTEM.CSV;
    if (extensions.has("json")) return MIGRATION_SOURCE_SYSTEM.JSON;
    if (extensions.has("xml")) return MIGRATION_SOURCE_SYSTEM.XML;
  }
  return selected;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const batches = await MigrationBatch.find({ tenantId: session.user.tenantId })
    .sort({ createdAt: -1 })
    .lean();
    
  return NextResponse.json({ success: true, data: batches });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const form = await req.formData();
  let sourceSystem = normalizeSourceSystem(form.get("sourceSystem"));
  
  const files: File[] = [];
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ success: false, message: "No files provided." }, { status: 400 });
  }
  sourceSystem = sourceSystemFromFiles(files, sourceSystem);

  const uploadedFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  let preparedFiles;
  try {
    preparedFiles = prepareMigrationFiles(uploadedFiles, sourceSystem);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Upload package could not be prepared.",
      },
      { status: 400 },
    );
  }

  await dbConnect();
  
  const batch = await MigrationBatch.create({
    tenantId: session.user.tenantId,
    sourceSystem,
    status: "analyzing",
    createdBy: session.user.id,
  });

  let totalRecords = 0;
  
  for (const fileData of preparedFiles) {
    const job = await MigrationJob.create({
      tenantId: session.user.tenantId,
      batchId: batch._id,
      name: fileData.name,
      sourceSystem,
      entityType: fileData.entityType,
      status: MIGRATION_JOB_STATUS.CREATED,
      fileName: fileData.name,
      columns: fileData.columns,
      totalRows: fileData.rows.length,
      mapping: {},
      importedRefs: [],
      createdBy: session.user.id,
    });

    // Chunk insert records
    const chunkSize = 5000;
    for (let i = 0; i < fileData.rows.length; i += chunkSize) {
      const chunk = fileData.rows.slice(i, i + chunkSize);
      const docs = chunk.map(row => ({
        tenantId: session.user.tenantId,
        batchId: batch._id,
        jobId: job._id,
        entityType: fileData.entityType,
        sourceData: row,
        status: "pending",
      }));
      await MigrationRecord.insertMany(docs);
    }
    
    totalRecords += fileData.rows.length;
  }

  batch.totalFiles = preparedFiles.length;
  batch.totalRecords = totalRecords;
  batch.status = "mapping"; // ready for user mapping
  await batch.save();

  return NextResponse.json({ success: true, data: batch });
}
