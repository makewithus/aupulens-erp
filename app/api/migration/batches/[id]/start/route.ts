import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { startWorkerDaemon, runWriteReadinessCheck } from "@/lib/migration/worker";
import { productionMigrationError } from "@/lib/migration/errors";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";
import { checkJournalAccountDependencies } from "@/lib/migration/dependencyCheck";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";

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

    // Duplicate decisions may change target values (Force Create). Validate
    // those actual values again before switching the batch to live writes.
    const targetErrors = await runWriteReadinessCheck(batch);
    if (targetErrors > 0) {
      const summary = await computeMigrationReviewSummary(batch._id, session.user.tenantId);
      batch.summary = { ...batch.summary, ...summary };
      await batch.save();
      return NextResponse.json({ success: false, message: "Target validation found values that need correction. Review the highlighted rows before migration; no data was written." }, { status: 409 });
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
    if (unresolvedDuplicates > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Resolve duplicate records before starting migration.",
        },
        { status: 400 },
      );
    }

    const dependencyCheck = await checkJournalAccountDependencies(batch._id, session.user.tenantId);
    if (!dependencyCheck.ready) {
      const summary = await computeMigrationReviewSummary(batch._id, session.user.tenantId);
      batch.summary = { ...batch.summary, ...summary };
      await batch.save();
      const message = dependencyCheck.reopenedSkipped > 0
        ? `${dependencyCheck.reopenedSkipped} skipped account record(s) are required by journal entries. Resolve them as Merge / Update or Force Create, or correct the dependent journal account codes; no migration data was written.`
        : dependencyCheck.failedAccounts > 0
          ? `${dependencyCheck.failedAccounts} required Account record(s) could not be saved. They and the dependent journal rows have been returned to validation; no journal entries were written.`
        : "Some journal entries reference accounts that will not exist after migration. Correct the account/journal rows shown in validation; no migration data was written.";
      return NextResponse.json(
        { success: false, message, dependencyErrors: dependencyCheck.missing },
        { status: 409 },
      );
    }

    if (invalidRecords > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Fix invalid records before starting migration.",
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
