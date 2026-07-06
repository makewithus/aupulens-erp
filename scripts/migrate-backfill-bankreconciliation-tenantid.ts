/**
 * One-off migration: `models/BankReconciliation.ts` never declared a `tenantId`
 * path in its schema, even though API routes always passed one on `.create()`.
 * Mongoose's default strict mode silently stripped that field before every
 * write, so every reconciliation record ever created was saved with no
 * `tenantId` at all — invisible to any tenant-scoped `find({tenantId})` query
 * (found + fixed during the QA_GAP_REPORT.md remediation pass, see item #3).
 *
 * This migration backfills any existing tenant-less records by looking up the
 * creating user's `tenantId` via `createdBy`. Falls back to `default-tenant`
 * (logged loudly) only if the creating user can't be resolved.
 *
 * Safe to run multiple times — only touches documents missing `tenantId`.
 *
 * Usage: npx tsx scripts/migrate-backfill-bankreconciliation-tenantid.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;
  const reconciliations = db.collection("bankreconciliations");
  const users = db.collection("users");

  const orphaned = await reconciliations
    .find({ tenantId: { $exists: false } })
    .toArray();

  if (orphaned.length === 0) {
    console.log("No tenant-less BankReconciliation records found. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${orphaned.length} tenant-less BankReconciliation record(s).`);

  for (const doc of orphaned) {
    let tenantId = "default-tenant";
    let source = "fallback (no createdBy / user not found)";

    if (doc.createdBy) {
      const creator = await users.findOne({ _id: doc.createdBy });
      if (creator?.tenantId) {
        tenantId = creator.tenantId;
        source = `resolved from creator ${doc.createdBy}`;
      }
    }

    await reconciliations.updateOne(
      { _id: doc._id },
      { $set: { tenantId } },
    );

    console.log(
      `  ${doc._id}: backfilled tenantId="${tenantId}" (${source}) — bankStatementDate=${doc.bankStatementDate}, createdAt=${doc.createdAt}`,
    );
  }

  console.log(`Backfilled ${orphaned.length} record(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
