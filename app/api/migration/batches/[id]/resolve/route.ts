import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";

async function refreshDuplicateSummary(batch: any, tenantId: string) {
  const duplicate = await MigrationRecord.countDocuments({
    batchId: batch._id,
    tenantId,
    status: "duplicate",
    duplicateAction: { $exists: false },
  });
  batch.summary = { ...batch.summary, duplicate };
  await batch.save();
  return duplicate;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const { recordId, action, scope } = await req.json();
  if (!["skip", "update", "create"].includes(action) || (!recordId && scope !== "all")) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  await dbConnect();
  
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch || batch.status !== "preview") {
    return NextResponse.json({ success: false, message: "Batch not in preview state" }, { status: 400 });
  }

  if (scope === "all") {
    const query: Record<string, unknown> = {
      batchId: id,
      tenantId: session.user.tenantId,
      status: "duplicate",
      duplicateAction: { $exists: false },
    };
    if (action === "update") {
      query.duplicateTargetId = { $exists: true };
    }

    const update: Record<string, unknown> = { duplicateAction: action };
    if (action === "create" || action === "update") {
      update.errors = [];
    }

    const result = await MigrationRecord.updateMany(query, { $set: update });
    const remainingDuplicates = await refreshDuplicateSummary(batch, session.user.tenantId);
    const actionLabel = action === "create" ? "force create" : action === "update" ? "merge/update" : "skip";
    return NextResponse.json({
      success: true,
      resolvedCount: result.modifiedCount,
      remainingDuplicates,
      message: result.modifiedCount > 0
        ? `Saved ${actionLabel} for ${result.modifiedCount} duplicate record${result.modifiedCount === 1 ? "" : "s"}.`
        : action === "update"
          ? "No database duplicates are available for merge/update."
          : "No unresolved duplicates found.",
    });
  }

  const record = await MigrationRecord.findOne({ _id: recordId, batchId: id, tenantId: session.user.tenantId });
  if (!record) {
    return NextResponse.json({ success: false, message: "Record not found" }, { status: 404 });
  }
  if (action === "update" && !record.duplicateTargetId) {
    return NextResponse.json(
      { success: false, message: "This duplicate has no existing workspace record to update. Choose Skip or Force Create." },
      { status: 400 },
    );
  }

  record.duplicateAction = action;
  if (action === "create" || action === "update") {
    record.errors = [] as any;
  }
  await record.save();
  const remainingDuplicates = await refreshDuplicateSummary(batch, session.user.tenantId);

  const actionLabel = action === "create" ? "force create" : action === "update" ? "merge/update" : "skip";
  return NextResponse.json({ success: true, remainingDuplicates, message: `Duplicate resolution saved: ${actionLabel}.` });
}
