import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationBatch from "@/models/admin/MigrationBatch";
import { fixMigrationRecordWithAi } from "@/lib/migration/aiFix";
import { processMigrationWorker } from "@/lib/migration/worker";

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

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
    ? await MigrationRecord.find({ batchId: id, tenantId: session.user.tenantId, status: "invalid" }).select("_id").sort({ createdAt: 1, _id: 1 }).lean()
    : [{ _id: recordId }];

  let fixedCount = 0;
  let aiUsedCount = 0;
  const messages: string[] = [];
  const fixedRecordIds: string[] = [];

  const results = await runWithConcurrency(
    recordIds,
    scope === "all" ? 12 : 1,
    (item) => fixMigrationRecordWithAi(id, session.user.tenantId, String(item._id)),
  );

  for (const [index, result] of results.entries()) {
    if (result.fixed) {
      fixedCount += 1;
      fixedRecordIds.push(String(recordIds[index]._id));
    }
    if ("aiUsed" in result && result.aiUsed) aiUsedCount += 1;
    if (!result.fixed) messages.push(result.message);
  }

  if (fixedCount > 0) {
    let done = false;
    for (let i = 0; i < 200 && !done; i += 1) {
      const result = await processMigrationWorker(id, 100);
      done = result.done;
      if (result.processed === 0) break;
    }
  }

  return NextResponse.json({
    success: fixedCount > 0,
    fixedCount,
    fixedRecordIds,
    aiUsedCount,
    unresolvedCount: messages.length,
    unresolvedMessages: messages.slice(0, 5),
    message: fixedCount > 0
      ? `${fixedCount} invalid record${fixedCount === 1 ? "" : "s"} fixed and sent back through validation${messages.length ? `; ${messages.length} still need review.` : "."}`
      : messages[0] || "No automatic fix was available for these rows. Please edit the highlighted fields.",
  });
}
