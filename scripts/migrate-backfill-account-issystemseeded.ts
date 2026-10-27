/**
 * One-off migration: backfills `isSystemSeeded: true` on the legacy Chart of
 * Accounts rows created by seedChartOfAccounts()/ensureChartOfAccounts()
 * before that seeder started setting the flag itself (Issue #8 fix — the
 * boilerplate "Bank Current Account" placeholder was leaking into the
 * Payments "Deposit To" / Journal Entries bank pickers for every tenant,
 * even ones that never added a real bank account).
 *
 * Matches by the seeder's fixed `code` values only — a tenant that has since
 * renamed/repurposed one of these codes for real use still gets flagged as
 * seeded (same as any fresh tenant would be), which is the intended default;
 * codes never touched by the seeder are left untouched.
 *
 * Safe to run multiple times (idempotent `$set`).
 *
 * Usage: npx tsx scripts/migrate-backfill-account-issystemseeded.ts
 */
import "dotenv/config";
import connectDB from "../lib/db";
import Account from "../models/finance/Account";

const SEEDED_CODES = [
  "1000", "1100", "1110", "1120", "1200", "1210", "1300", "1400",
  "2000", "2100", "2150", "2200",
  "3000", "3100", "3200",
  "4000", "4100",
  "5000", "5100", "5150", "5200", "5300",
];

async function main() {
  await connectDB();

  const result = await Account.updateMany(
    { code: { $in: SEEDED_CODES }, isSystemSeeded: { $ne: true } },
    { $set: { isSystemSeeded: true } },
  );
  console.log(`Backfilled isSystemSeeded on ${result.modifiedCount} account(s).`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
