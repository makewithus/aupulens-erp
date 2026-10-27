/**
 * One-off migration: `models/Invoice.ts`'s `{tenantId, name}` index was never
 * marked `unique: true`, unlike JournalEntry/Bill/SaleOrder's equivalent
 * indexes — a Golden Rule #7 gap missed by the prior 10-collection migration
 * (found during the QA_GAP_REPORT.md remediation pass, item #6). Since `Bill`
 * shares this same `invoices` collection (moveType: "in_invoice"), this also
 * means an invoice and a bill could silently share a document number within
 * one tenant.
 *
 * Before creating the unique constraint, this script detects any existing
 * {tenantId, name} collisions. For each duplicate group it keeps the oldest
 * document's name untouched and renames the newer ones by appending a
 * `-DUP-<n>` suffix, logging every rename so it can be reviewed/corrected by
 * a human afterward — it never silently deletes data.
 *
 * Safe to run multiple times (skips recreating the index if already unique).
 *
 * Usage: npx tsx scripts/migrate-invoice-unique-index.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";

const INDEX_NAME = "tenantId_1_name_1";

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;
  const invoices = db.collection("invoices");

  // 1. Find and resolve any existing collisions.
  const dupeGroups = await invoices
    .aggregate([
      {
        $group: {
          _id: { tenantId: "$tenantId", name: "$name" },
          count: { $sum: 1 },
          docs: { $push: { _id: "$_id", createdAt: "$createdAt" } },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (dupeGroups.length === 0) {
    console.log("No existing {tenantId, name} collisions found.");
  } else {
    console.log(`Found ${dupeGroups.length} colliding {tenantId, name} group(s). Renaming duplicates...`);
    for (const group of dupeGroups) {
      const sorted = [...group.docs].sort(
        (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
      );
      // Keep the oldest document's name as-is; rename the rest.
      for (let i = 1; i < sorted.length; i++) {
        const newName = `${group._id.name}-DUP-${i}`;
        await invoices.updateOne({ _id: sorted[i]._id }, { $set: { name: newName } });
        console.log(
          `  tenant="${group._id.tenantId}" name="${group._id.name}": renamed ${sorted[i]._id} -> "${newName}" (review manually)`,
        );
      }
    }
  }

  // 2. Drop the stale non-unique index (if present) and recreate it as unique.
  const existing = await invoices.indexes();
  const current = existing.find((i) => i.name === INDEX_NAME);

  if (current?.unique) {
    console.log(`"${INDEX_NAME}" is already unique. Nothing to do.`);
  } else {
    if (current) {
      await invoices.dropIndex(INDEX_NAME);
      console.log(`Dropped non-unique "${INDEX_NAME}".`);
    }
    await invoices.createIndex({ tenantId: 1, name: 1 }, { unique: true, name: INDEX_NAME });
    console.log(`Created unique "${INDEX_NAME}".`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
