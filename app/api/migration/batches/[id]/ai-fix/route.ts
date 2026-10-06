import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationBatch from "@/models/admin/MigrationBatch";
import { fixMigrationRecordWithAi } from "@/lib/migration/aiFix";
import { processMigrationWorker } from "@/lib/migration/worker";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const { recordId, scope } = await req.json();
  if (!recordId && scope !== "all") {
    return NextResponse.json({ success: false, message: "Provide recordId or scope=all." }, { status: 400 });
  }

  await dbConnect();
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch || batch.status !== "preview") {
    return NextResponse.json({ success: false, message: "AI fix is available during preview review only." }, { status: 400 });
  }

  const recordIds = scope === "all"
    ? await MigrationRecord.find({ batchId: id, tenantId: session.user.tenantId, status: "invalid" }).select("_id").limit(100).lean()
    : [{ _id: recordId }];

  let fixedCount = 0;
  let aiUsedCount = 0;
  const messages: string[] = [];

  for (const item of recordIds) {
    const result = await fixMigrationRecordWithAi(id, session.user.tenantId, String(item._id));
    if (result.fixed) fixedCount += 1;
    if (result.aiUsed) aiUsedCount += 1;
    if (!result.fixed) messages.push(result.message);
  }

  if (fixedCount > 0) {
    await processMigrationWorker(id, 1000);
  }

  return NextResponse.json({
    success: true,
    fixedCount,
    aiUsedCount,
    message: fixedCount > 0
      ? `${fixedCount} invalid record${fixedCount === 1 ? "" : "s"} fixed and sent back through validation.`
      : messages[0] || "No invalid records were available to fix.",
  });
}
