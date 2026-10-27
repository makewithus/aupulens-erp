/**
 * One-off migration: replaces the stale, non-partial unique index
 * `{tenantId: 1, code: 1}` on the `accounts` collection with the partial
 * version `models/Account.ts` has declared since the Chart-of-Accounts
 * feature (v2) was added — `partialFilterExpression: { code: { $exists:
 * true, $type: "string" } }`, so it only enforces uniqueness among
 * documents that actually set the legacy `code` field.
 *
 * The old, non-partial index was never migrated when the schema changed,
 * so every code-less (new-style) Account after the very first one for a
 * given tenant collides on `{tenantId, code: null}` — discovered during the
 * Issue #8 fix while linking BankAccount docs to a GL Account. The existing
 * `coa-feature-seeder.ts` already works around this by stamping a throwaway
 * `code: "SYS-<timestamp>-<n>"` on every account it creates; that workaround
 * is left in place (harmless, and not worth touching working code for this
 * fix) but is no longer strictly required for *new* callers after this
 * migration runs.
 *
 * Safe to run multiple times (checks the index's actual options before
 * doing anything, so a second run is a no-op).
 *
 * Usage: npx tsx scripts/migrate-fix-account-legacy-code-index.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;
  const collection = db.collection("accounts");

  const existing = await collection.indexes();
  const staleIndex = existing.find((i) => i.name === "tenantId_1_code_1");

  if (staleIndex?.partialFilterExpression) {
    console.log('accounts: "tenantId_1_code_1" is already partial, nothing to do.');
  } else if (staleIndex) {
    await collection.dropIndex("tenantId_1_code_1");
    console.log('accounts: dropped stale non-partial index "tenantId_1_code_1".');
    await collection.createIndex(
      { tenantId: 1, code: 1 },
      { unique: true, partialFilterExpression: { code: { $exists: true, $type: "string" } } },
    );
    console.log('accounts: recreated "tenantId_1_code_1" as a partial index.');
  } else {
    console.log('accounts: "tenantId_1_code_1" not present, nothing to do.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
