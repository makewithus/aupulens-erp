import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationBatch from "@/models/admin/MigrationBatch";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  
  const invalid = await MigrationRecord.find({ 
    batchId: id, 
    tenantId: session.user.tenantId,
    status: "invalid"
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(500)
    .lean();

  return NextResponse.json({ success: true, data: invalid });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const { recordId, sourceData } = await req.json();
  
  await dbConnect();

  const record = await MigrationRecord.findOne({ _id: recordId, batchId: id, tenantId: session.user.tenantId });
  if (!record) return NextResponse.json({ success: false }, { status: 404 });

  // Update source data and reset status to pending so it gets re-validated
  record.sourceData = sourceData;
  record.status = "pending";
  record.errors = [] as any;
  await record.save();
  
  // Ensure the batch moves back to validating so the worker picks it up
  await MigrationBatch.updateOne(
    { _id: id, tenantId: session.user.tenantId, status: "preview" },
    { $set: { status: "validating", progress: 1 } }
  );
  
  // Immediately process the pending record so the UI gets instant feedback
  const { processMigrationWorker } = await import("@/lib/migration/worker");
  await processMigrationWorker(id, 5);
  
  return NextResponse.json({ success: true });
}
