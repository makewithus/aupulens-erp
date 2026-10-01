import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { startWorkerDaemon } from "@/lib/migration/worker";
import MigrationBatch from "@/models/admin/MigrationBatch";

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
    await startWorkerDaemon(id, req.nextUrl.origin);
    
    return NextResponse.json({ success: true, message: "Worker loop started in background", done: false });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
