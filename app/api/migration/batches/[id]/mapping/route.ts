import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import { suggestMapping } from "@/lib/migration/fieldMapping";
import { markBatchFailed, processMigrationWorker } from "@/lib/migration/worker";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });

  const jobs = await MigrationJob.find({ batchId: batch._id, tenantId: session.user.tenantId }).lean();
  
  // Return columns and suggested mapping for all jobs
  const mappings = [];
  for (const job of jobs) {
    if (!job.mapping || Object.keys(job.mapping).length === 0) {
      // Suggest mapping
      const { mapping, aiUsed } = await suggestMapping(
        session.user.tenantId,
        job.entityType,
        job.columns,
        [] // We don't have rows loaded here easily. We'll skip AI row sampling or load 3 records.
      );
      mappings.push({ jobId: job._id, entityType: job.entityType, columns: job.columns, mapping, aiUsed });
    } else {
      mappings.push({ jobId: job._id, entityType: job.entityType, columns: job.columns, mapping: job.mapping, aiUsed: job.aiMappingUsed });
    }
  }

  return NextResponse.json({ success: true, data: mappings });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const body = await req.json();
  const { jobMappings } = body; // [{ jobId, mapping }]
  if (!Array.isArray(jobMappings) || jobMappings.length === 0) {
    return NextResponse.json({ success: false, message: "No job mappings provided." }, { status: 400 });
  }

  await dbConnect();
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });

  for (const jm of jobMappings) {
    await MigrationJob.updateOne(
      { _id: jm.jobId, batchId: batch._id, tenantId: session.user.tenantId },
      { $set: { mapping: jm.mapping, status: "mapped" } }
    );
  }

  batch.status = "validating";
  await batch.save();

  // Fire and forget loop for durable background processing
  const runLoop = async () => {
    let done = false;
    while (!done) {
      try {
        const result = await processMigrationWorker(id, 500);
        done = result.done;
        if (!done) await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.error("Worker loop chunk error:", e);
        await markBatchFailed(id, e);
        done = true; // Stop loop on fatal error
      }
    }
  };
  
  runLoop().catch(console.error);

  return NextResponse.json({ success: true });
}
