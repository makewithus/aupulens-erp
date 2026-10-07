import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { markBatchFailed, processMigrationWorker } from "@/lib/migration/worker";
import MigrationBatch from "@/models/admin/MigrationBatch";
import { productionMigrationError } from "@/lib/migration/errors";

const WORKER_CHUNK_LIMIT = 1000;
const WORKER_TIME_BUDGET_MS = 8000;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  let body: { workerLock?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  await dbConnect();
  const batch = session?.user?.tenantId
    ? await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId })
    : await MigrationBatch.findOne({ _id: id, workerLock: body.workerLock });
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });
  if (!session?.user?.tenantId && (!body.workerLock || body.workerLock !== batch.workerLock)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  if (batch.status !== "validating" && batch.status !== "running") {
    return NextResponse.json({ success: true, message: "Worker not needed right now.", done: true });
  }

  try {
    const startedAt = Date.now();
    let done = false;
    let processed = 0;
    let iterations = 0;

    while (!done && Date.now() - startedAt < WORKER_TIME_BUDGET_MS) {
      const result = await processMigrationWorker(id, WORKER_CHUNK_LIMIT);
      done = result.done;
      processed += result.processed || 0;
      iterations += 1;
      if (result.processed === 0) break;
    }

    return NextResponse.json({
      success: true,
      message: done ? "Worker completed." : "Worker processed a chunk.",
      done,
      processed,
      iterations,
    });
  } catch (err: any) {
    await markBatchFailed(id, err);
    return NextResponse.json({ success: false, message: productionMigrationError(err), done: true }, { status: 200 });
  }
}
