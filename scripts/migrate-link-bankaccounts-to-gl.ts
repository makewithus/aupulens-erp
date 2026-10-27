/**
 * One-off migration: backfills a linked Chart-of-Accounts GL entry
 * (BankAccount.glAccountId) for any BankAccount doc missing one.
 *
 * Found during the Issue #8 fix: `scripts/seed-invoices.ts` inserted demo
 * BankAccount rows (HDFC/ICICI) directly via insertMany, bypassing
 * POST /api/finance/accounting/bank-accounts — which is the only place that
 * normally creates the linked GL Account. Sales Payments' "Deposit To"
 * picker posts against that GL account, not the BankAccount doc itself, so
 * any BankAccount without a glAccountId is invisible there and payments
 * can never be deposited into it. Same root cause could recur for any other
 * bank account created by direct DB writes/older seed scripts instead of
 * the real API route, so this is written to fix every tenant, not just
 * default-tenant.
 *
 * Run scripts/migrate-fix-account-legacy-code-index.ts first — a stale
 * unique index this migration would otherwise collide on when creating a
 * code-less GL Account.
 *
 * Safe to run multiple times (skips accounts that already have glAccountId,
 * reuses an existing same-name GL account instead of duplicating one).
 *
 * Usage: npx tsx scripts/migrate-fix-account-legacy-code-index.ts && npx tsx scripts/migrate-link-bankaccounts-to-gl.ts
 */
import "dotenv/config";
import connectDB from "../lib/db";
import BankAccount from "../models/finance/BankAccount";
import Account from "../models/finance/Account";
import AccountType from "../models/finance/AccountType";

async function main() {
  await connectDB();

  const orphaned = await BankAccount.find({ glAccountId: { $exists: false } });
  console.log(`Found ${orphaned.length} bank account(s) with no linked GL account.`);

  let linked = 0;
  for (const bank of orphaned) {
    const glTypeName = bank.accountType === "credit_card" ? "Credit Card" : "Bank";
    const glType = await AccountType.findOne({ tenantId: bank.tenantId, name: glTypeName });
    if (!glType) {
      console.warn(`  Skipping "${bank.accountName}" (tenant ${bank.tenantId}): Chart of Accounts not seeded yet.`);
      continue;
    }

    let glAccount = await Account.findOne({ tenantId: bank.tenantId, accountName: bank.accountName });
    if (!glAccount) {
      // Requires scripts/migrate-fix-account-legacy-code-index.ts to have
      // run first (fixes a stale non-partial unique index on {tenantId,
      // code} that otherwise collides on the first code-less Account).
      glAccount = await Account.create({
        tenantId: bank.tenantId,
        accountName: bank.accountName,
        accountType: glType._id,
        createdBy: bank.createdBy,
        isActive: true,
      });
    }

    bank.glAccountId = glAccount._id as any;
    await bank.save();
    linked += 1;
    console.log(`  Linked "${bank.accountName}" (tenant ${bank.tenantId}) -> GL account ${glAccount._id}.`);
  }

  console.log(`Done. Linked ${linked}/${orphaned.length} bank account(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
