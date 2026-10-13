import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationUploadChunk from "@/models/admin/MigrationUploadChunk";
import { MIGRATION_JOB_STATUS } from "@/lib/migration/constants";
import {
  normalizeSourceSystem,
  prepareMigrationPackage,
  type UploadedMigrationFile,
} from "@/lib/migration/package";
import { MIGRATION_SOURCE_SYSTEM, type MigrationSourceSystem } from "@/lib/migration/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK_TTL_HOURS = 6;
const MAX_CHUNK_BASE64_CHARS = 2_000_000;

function sourceSystemFromFiles(files: Array<{ name: string }>, selected: MigrationSourceSystem): MigrationSourceSystem {
  const extensions = new Set(files.map((file) => file.name.split(".").pop()?.toLowerCase()));
  if (extensions.size === 1) {
    if (extensions.has("xlsx") || extensions.has("xls")) return MIGRATION_SOURCE_SYSTEM.EXCEL;
    if (extensions.has("csv") || extensions.has("tsv")) return MIGRATION_SOURCE_SYSTEM.CSV;
    if (extensions.has("json")) return MIGRATION_SOURCE_SYSTEM.JSON;
    if (extensions.has("xml")) return MIGRATION_SOURCE_SYSTEM.XML;
  }
  return selected;
}

async function createMigrationBatchFromFiles({
  tenantId,
  userId,
  sourceSystem,
  uploadedFiles,
}: {
  tenantId: string;
  userId: string;
  sourceSystem: MigrationSourceSystem;
  uploadedFiles: UploadedMigrationFile[];
}) {
  let preparedPackage;
  try {
    preparedPackage = prepareMigrationPackage(uploadedFiles, sourceSystem);
  } catch (err) {
    return {
      response: NextResponse.json(
        {
          success: false,
          message: err instanceof Error ? err.message : "Upload package could not be prepared.",
        },
        { status: 400 },
      ),
    };
  }

  const preparedFiles = preparedPackage.files;

  const batch = await MigrationBatch.create({
    tenantId,
    sourceSystem,
    status: "analyzing",
    createdBy: userId,
  });

  let totalRecords = 0;

  for (const fileData of preparedFiles) {
    const job = await MigrationJob.create({
      tenantId,
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
      createdBy: userId,
    });

    const chunkSize = 5000;
    for (let i = 0; i < fileData.rows.length; i += chunkSize) {
      const chunk = fileData.rows.slice(i, i + chunkSize);
      const docs = chunk.map((row) => ({
        tenantId,
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

  batch.totalFiles = preparedPackage.sourceFileCount || preparedFiles.length;
  batch.totalRecords = preparedPackage.sourceRecordCount || totalRecords;
  batch.totalModules = preparedPackage.importableFileCount;
  batch.summary = {
    ...(batch.summary || {}),
    sourceRecords: preparedPackage.sourceRecordCount,
    importableRecords: preparedPackage.importableRecordCount,
    ignoredRecords: Math.max(0, preparedPackage.sourceRecordCount - preparedPackage.importableRecordCount),
  };
  batch.status = "mapping";
  await batch.save();

  return { batch };
}

function badUploadRequest(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

async function handleChunkedUpload(req: NextRequest, tenantId: string, userId: string) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return badUploadRequest("Invalid upload request.");
  }

  const action = String(body.action || "");
  await dbConnect();

  if (action === "uploadChunk") {
    const uploadId = String(body.uploadId || "").trim();
    const fileName = String(body.fileName || "").trim();
    const data = String(body.data || "");
    const fileIndex = Number(body.fileIndex);
    const chunkIndex = Number(body.chunkIndex);
    const totalChunks = Number(body.totalChunks);
    const byteLength = Number(body.byteLength);

    if (!uploadId || !fileName || !Number.isInteger(fileIndex) || !Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks)) {
      return badUploadRequest("Invalid upload chunk metadata.");
    }
    if (!data || data.length > MAX_CHUNK_BASE64_CHARS) {
      return badUploadRequest("Upload chunk is too large. Please try again with a smaller chunk.", 413);
    }

    const expiresAt = new Date(Date.now() + CHUNK_TTL_HOURS * 60 * 60 * 1000);
    await MigrationUploadChunk.updateOne(
      { tenantId, uploadId, fileIndex, chunkIndex },
      {
        $set: {
          tenantId,
          uploadId,
          fileIndex,
          fileName,
          chunkIndex,
          totalChunks,
          data,
          byteLength: Number.isFinite(byteLength) ? byteLength : 0,
          createdBy: userId,
          expiresAt,
        },
      },
      { upsert: true, runValidators: true },
    );

    return NextResponse.json({ success: true });
  }

  if (action === "abortUpload") {
    const uploadId = String(body.uploadId || "").trim();
    if (uploadId) await MigrationUploadChunk.deleteMany({ tenantId, uploadId });
    return NextResponse.json({ success: true });
  }

  if (action !== "finalizeUpload") {
    return badUploadRequest("Unsupported upload action.");
  }

  const uploadId = String(body.uploadId || "").trim();
  const files = Array.isArray(body.files) ? body.files : [];
  let sourceSystem = normalizeSourceSystem(body.sourceSystem);

  if (!uploadId || files.length === 0) {
    return badUploadRequest("No uploaded files were found to finalize.");
  }

  const chunks = await MigrationUploadChunk.find({ tenantId, uploadId }).sort({ fileIndex: 1, chunkIndex: 1 }).lean();
  const uploadedFiles: UploadedMigrationFile[] = [];

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const meta = files[fileIndex] || {};
    const fileName = String(meta.name || "").trim();
    const expectedChunks = Number(meta.totalChunks);
    const fileChunks = chunks.filter((chunk) => chunk.fileIndex === fileIndex);

    if (!fileName || !Number.isInteger(expectedChunks) || expectedChunks < 1 || fileChunks.length !== expectedChunks) {
      return badUploadRequest(`Upload for ${fileName || `file ${fileIndex + 1}`} is incomplete. Please upload again.`);
    }

    for (let i = 0; i < expectedChunks; i += 1) {
      if (fileChunks[i]?.chunkIndex !== i) {
        return badUploadRequest(`${fileName}: Upload chunks are out of sequence. Please upload again.`);
      }
    }

    uploadedFiles.push({
      name: fileName,
      buffer: Buffer.concat(fileChunks.map((chunk) => Buffer.from(chunk.data, "base64"))),
    });
  }

  sourceSystem = sourceSystemFromFiles(uploadedFiles, sourceSystem);

  const result = await createMigrationBatchFromFiles({
    tenantId,
    userId,
    sourceSystem,
    uploadedFiles,
  });

  if (result.response) return result.response;

  await MigrationUploadChunk.deleteMany({ tenantId, uploadId });
  return NextResponse.json({ success: true, data: result.batch });
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

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return handleChunkedUpload(req, session.user.tenantId, session.user.id);
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

  await dbConnect();
  const result = await createMigrationBatchFromFiles({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    sourceSystem,
    uploadedFiles,
  });

  if (result.response) return result.response;
  return NextResponse.json({ success: true, data: result.batch });
}
