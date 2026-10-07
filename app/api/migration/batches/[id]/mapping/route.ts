import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import { deterministicMapping } from "@/lib/migration/fieldMapping";
import { getEntitySchema } from "@/lib/migration/entitySchemas";

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
    const schema = getEntitySchema(job.entityType);
    if (!job.mapping || Object.keys(job.mapping).length === 0) {
      const mapping = schema ? deterministicMapping(schema, job.columns || []) : {};
      mappings.push({ jobId: job._id, entityType: job.entityType, columns: job.columns, mapping, aiUsed: false });
    } else {
      // Heal stale mappings: required fields that are unmapped may now be detectable
      // because aliases were updated. Merge fresh auto-mapping for missing required
      // fields only — never overwrite fields the user has already mapped.
      let mapping = { ...(job.mapping as Record<string, string>) };
      if (schema) {
        const missingRequired = schema.fields.filter(f => f.required && !mapping[f.key]);
        if (missingRequired.length > 0) {
          const fresh = deterministicMapping(schema, job.columns || []);
          for (const field of missingRequired) {
            if (fresh[field.key] && !mapping[field.key]) {
              mapping[field.key] = fresh[field.key];
            }
          }
        }
      }
      mappings.push({ jobId: job._id, entityType: job.entityType, columns: job.columns, mapping, aiUsed: job.aiMappingUsed });
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

  await Promise.all(jobMappings.map((jm) =>
    MigrationJob.updateOne(
      { _id: jm.jobId, batchId: batch._id, tenantId: session.user.tenantId },
      { $set: { mapping: jm.mapping, status: "mapped" } },
    ),
  ));

  batch.status = "validating";
  batch.progress = 1;
  await batch.save();

  return NextResponse.json({ success: true });
}
