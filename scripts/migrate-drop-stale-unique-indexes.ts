/**
 * One-off migration: drops stale single-field unique indexes left over from
 * earlier schema versions that have since been fixed in code to compound
 * `{tenantId, <field>}` unique indexes instead. The old single-field indexes
 * were never dropped when the schemas changed, so they were silently still
 * enforcing global (cross-tenant) uniqueness — a Golden Rule #7 violation
 * found during the 2026-07-05 system-wide audit (see AUDIT_REPORT.md), plus
 * two more found during the QA_GAP_REPORT.md remediation pass (`crmquotes`,
 * `deliverychallans`) missed by that first pass.
 *
 * Safe to run multiple times (skips indexes that don't exist) and safe to
 * run against any environment — it only drops the redundant single-field
 * index, the correct compound unique index is left untouched (or created by
 * Mongoose on next app start if somehow missing).
 *
 * Usage: npx tsx scripts/migrate-drop-stale-unique-indexes.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";

const TARGETS: { collection: string; staleIndexName: string }[] = [
  { collection: "salesquotations", staleIndexName: "quoteNumber_1" },
  { collection: "bills", staleIndexName: "billNumber_1" },
  { collection: "warehouses", staleIndexName: "warehouseCode_1" },
  { collection: "stockmoves", staleIndexName: "reference_1" },
  { collection: "hscodes", staleIndexName: "hsCode_1" },
  { collection: "shipments", staleIndexName: "shipmentNumber_1" },
  { collection: "customsclearances", staleIndexName: "clearanceNumber_1" },
  { collection: "freightproviders", staleIndexName: "providerCode_1" },
  { collection: "batches", staleIndexName: "batchNumber_1" },
  { collection: "stocktransfers", staleIndexName: "header.name_1" },
  { collection: "crmquotes", staleIndexName: "quote_number_1" },
  { collection: "deliverychallans", staleIndexName: "dcNumber_1" },
];

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;

  for (const { collection, staleIndexName } of TARGETS) {
    const existing = await db.collection(collection).indexes();
    const found = existing.find((i) => i.name === staleIndexName);
    if (!found) {
      console.log(`${collection}: "${staleIndexName}" not present, skipping.`);
      continue;
    }
    await db.collection(collection).dropIndex(staleIndexName);
    console.log(`${collection}: dropped stale index "${staleIndexName}".`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
