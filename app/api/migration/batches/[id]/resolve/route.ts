import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const { recordId, action } = await req.json();
  if (!recordId || !["skip", "update", "create"].includes(action)) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  await dbConnect();
  
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch || batch.status !== "preview") {
    return NextResponse.json({ success: false, message: "Batch not in preview state" }, { status: 400 });
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
  await record.save();

  return NextResponse.json({ success: true, message: "Action saved" });
}
