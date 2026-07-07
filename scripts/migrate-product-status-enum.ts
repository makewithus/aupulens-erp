/**
 * One-off migration for the Product "Publish" 500 bug (test-team Bug 5):
 * `models/Product.ts` reused the shared `DOCUMENT_STATUS` enum
 * (draft/pending_approval/approved/posted/...), which has no "published"
 * value — so the "Publish Product" button (which always sent
 * `status: "published"`) failed Mongoose enum validation on every attempt,
 * while "Save as Draft" worked since "draft" is a valid DOCUMENT_STATUS
 * value. A prior seed script worked around this by marking demo products
 * "approved" as a stand-in for "live". The schema now uses a real
 * `PRODUCT_STATUS` enum (draft/published).
 *
 * This migration finds existing Product documents whose `status` is
 * anything other than "draft" or "published" (i.e. any DOCUMENT_STATUS
 * value that was standing in for "live" — approved/posted/pending_approval/
 * closed) and reports them; with --apply, sets them to "published" so they
 * keep showing up wherever the app now filters on `status: "published"`
 * (item pickers in quotes/invoices/sales orders).
 *
 * Safe to re-run: only touches docs that still have a non-draft,
 * non-published status.
 *
 * Usage:
 *   npx tsx scripts/migrate-product-status-enum.ts            # report only
 *   npx tsx scripts/migrate-product-status-enum.ts --apply     # repair
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import { PRODUCT_STATUS } from "../lib/constants/statuses";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();
  const db = mongoose.connection.db!;
  const products = db.collection("products");

  const stale = await products
    .find({ status: { $nin: [PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.PUBLISHED] } })
    .project({ "header.name": 1, status: 1 })
    .toArray();

  if (stale.length === 0) {
    console.log("No products with a stale status value found. Nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${stale.length} product(s) with a pre-enum-fix status:`);
  for (const p of stale) {
    console.log(`  - ${(p as any).header?.name} (${p._id}): status="${(p as any).status}"`);
  }

  if (!apply) {
    console.log("\nRe-run with --apply to set these to \"published\".");
    process.exit(0);
  }

  const result = await products.updateMany(
    { status: { $nin: [PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.PUBLISHED] } },
    { $set: { status: PRODUCT_STATUS.PUBLISHED } },
  );
  console.log(`\nUpdated ${result.modifiedCount} product(s) to status="published".`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
