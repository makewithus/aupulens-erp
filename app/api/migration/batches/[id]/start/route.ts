import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { startWorkerDaemon } from "@/lib/migration/worker";
import { productionMigrationError } from "@/lib/migration/errors";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    await dbConnect();
    const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
    if (!batch) return NextResponse.json({ success: false }, { status: 404 });

    if (batch.status !== "preview") {
      return NextResponse.json(
        { success: false, message: "Wait for validation and preview review to finish before starting migration." },
        { status: 400 },
      );
    }

    const pendingRecords = await MigrationRecord.countDocuments({
      batchId: batch._id,
      tenantId: session.user.tenantId,
      status: "pending",
    });
    if (pendingRecords > 0) {
      return NextResponse.json(
        { success: false, message: "Validation is still running. Please wait for preview to finish." },
        { status: 400 },
      );
    }

    const [unresolvedDuplicates, invalidRecords] = await Promise.all([
      MigrationRecord.countDocuments(unresolvedDuplicateFilter({
        batchId: batch._id,
        tenantId: session.user.tenantId,
      })),
      MigrationRecord.countDocuments({
        batchId: batch._id,
        tenantId: session.user.tenantId,
        status: "invalid",
      }),
    ]);
    if (invalidRecords > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Fix invalid records before starting migration.",
        },
        { status: 400 },
      );
    }
    if (unresolvedDuplicates > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Resolve duplicate records before starting migration.",
        },
        { status: 400 },
      );
    }

    const started = await MigrationBatch.updateOne(
      { _id: batch._id, tenantId: session.user.tenantId, status: "preview" },
      { $set: { status: "running", progress: 1 } },
    );

    if (started.modifiedCount === 0) {
      return NextResponse.json({ success: true, message: "Migration is already starting." });
    }

    await startWorkerDaemon(id, req.nextUrl.origin);

    return NextResponse.json({ success: true, data: { ...batch.toObject(), status: "running", progress: 1 } });
  } catch (err) {
    const message = productionMigrationError(err);
    return NextResponse.json(
      {
        success: false,
        message: /timed out|server selection|ECONN|network/i.test(message)
          ? "Database connection timed out while starting migration. Please try again; no data was written."
          : message,
      },
      { status: 200 },
    );
  }
}
